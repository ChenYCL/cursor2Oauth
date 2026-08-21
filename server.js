const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { spawn } = require('child_process');

const MODEL_MAP = {
  'gpt-4': 'gpt-5.3-codex',
  'gpt-4o': 'gpt-5.3-codex',
  'gpt-4-turbo': 'gpt-5.3-codex',
  'gpt-4o-mini': 'gpt-5.3-codex-low-fast',
  'gpt-3.5-turbo': 'gpt-5.3-codex-low-fast',
  'claude-3-opus': 'claude-opus-5-high',
  'claude-3-sonnet': 'claude-4.5-sonnet',
  'claude-3.5-sonnet': 'claude-4.5-sonnet',
  'claude-3.5-haiku': 'claude-4.5-sonnet',
  'claude-3-opus-20240229': 'claude-opus-5-high',
  'claude-3-sonnet-20240229': 'claude-4.5-sonnet',
  'claude-3.5-sonnet-20241022': 'claude-4.5-sonnet',
  'claude-3.5-haiku-20241022': 'claude-4.5-sonnet',
  'claude-4-5-sonnet-20250601': 'claude-4.5-sonnet',
  'gemini-pro': 'gemini-3.1-pro',
  'gemini-2.0-flash': 'gemini-3.6-flash-high',
  'gemini-2.5-pro': 'gemini-3.1-pro',
  'deepseek': 'gpt-5.3-codex-low',
  'deepseek-chat': 'gpt-5.3-codex-low',
};

const DEFAULT_MODEL = 'claude-4.5-sonnet';

const PORT = parseInt(process.env.PORT || '3000');
const HOST = process.env.HOST || '0.0.0.0';
const API_KEY = process.env.API_KEY || '';

function resolveModel(requested) {
  if (!requested) return DEFAULT_MODEL;
  return MODEL_MAP[requested] || requested;
}

function spawnCursorAgent(model, prompt) {
  const child = spawn('cursor-agent', [
    '--print', '--model', model,
    '--output-format', 'stream-json', '--stream-partial-output', prompt,
  ], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
  return child;
}

function parseCursorOutput(lines) {
  let resultText = '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const p = JSON.parse(line);
      if (p.type === 'result' && p.result) resultText = p.result;
      if (p.type === 'assistant' && p.message?.content) {
        const text = p.message.content.filter(x => x.type === 'text').map(x => x.text).join('');
        if (text) resultText = text;
      }
    } catch (e) { /* skip */ }
  }
  return resultText;
}

function extractPrompt(messages) {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return null;
  if (typeof lastUser.content === 'string') return lastUser.content;
  if (Array.isArray(lastUser.content)) {
    return lastUser.content.map(c => (typeof c === 'string') ? c : (c.text || '')).join('\n');
  }
  return String(lastUser.content || '');
}

const app = express();

app.use(cors());
app.use(morgan('short'));
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  if (API_KEY) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  next();
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/v1/models', (req, res) => {
  const models = [
    ...Object.keys(MODEL_MAP).map(k => ({ id: k, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'cursor' })),
    { id: DEFAULT_MODEL, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'cursor' },
  ];
  res.json({ object: 'list', data: models });
});

app.post('/v1/chat/completions', (req, res) => {
  try {
    const { model, messages, stream = false } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'messages required' });
    const prompt = extractPrompt(messages);
    if (!prompt) return res.status(400).json({ error: 'user message required' });

    const cursorModel = resolveModel(model);

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const child = spawnCursorAgent(cursorModel, prompt);
      let aborted = false;
      let fullContent = '';

      req.on('close', () => { aborted = true; child.kill('SIGTERM'); });

      const send = (content, finishReason) => {
        if (aborted) return;
        try {
          res.write(`data: ${JSON.stringify({
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: cursorModel,
            choices: [{ index: 0, delta: content ? { content } : {}, finish_reason: finishReason || null }],
          })}\n\n`);
        } catch (e) { aborted = true; child.kill(); }
      };

      let buf = '';
      child.stdout.on('data', (chunk) => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const p = JSON.parse(line);
            if (p.type === 'assistant' && p.message?.content) {
              for (const part of p.message.content) {
                if (part.type === 'text' && part.text) {
                  const prev = fullContent;
                  fullContent = part.text;
                  const delta = fullContent.slice(prev.length);
                  if (delta) send(delta, null);
                }
              }
            }
            if (p.type === 'result') {
              if (p.result && !fullContent) { fullContent = p.result; send(p.result, null); }
              send(null, 'stop');
              try { res.write('data: [DONE]\n\n'); res.end(); } catch (e) { /* ignore */ }
            }
          } catch (e) { /* skip */ }
        }
      });

      child.stderr.on('data', (c) => {
        const t = c.toString();
        if (t.includes('Warning') || t.includes('warn')) console.warn('[cursor-agent]', t);
      });

      child.on('close', () => {
        if (!aborted) {
          try { res.write('data: [DONE]\n\n'); res.end(); } catch (e) { /* ignore */ }
        }
      });

      child.on('error', (err) => {
        console.error('[cursor-agent]', err);
        if (!aborted) { try { res.end(); } catch (e) { /* ignore */ } }
      });

      return;
    }

    const child = spawnCursorAgent(cursorModel, prompt);
    let output = '';
    let errBuf = '';

    child.stdout.on('data', (c) => { output += c.toString(); });
    child.stderr.on('data', (c) => { errBuf += c.toString(); });

    child.on('close', () => {
      if (errBuf.includes('Warning') || errBuf.includes('warn')) console.warn('[cursor-agent]', errBuf);
      const result = parseCursorOutput(output.trim().split('\n'));
      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: cursorModel,
        choices: [{ index: 0, message: { role: 'assistant', content: result || '' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    });

    child.on('error', (err) => {
      console.error('[cursor-agent]', err);
      res.status(500).json({ error: 'Internal server error' });
    });

  } catch (e) {
    console.error('[server]', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/v1/messages', (req, res) => {
  try {
    const { model, messages, stream = false } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'messages required' });
    const prompt = extractPrompt(messages);
    if (!prompt) return res.status(400).json({ error: 'user message required' });

    const cursorModel = resolveModel(model);
    const msgId = `msg_${Date.now()}`;

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const child = spawnCursorAgent(cursorModel, prompt);
      let aborted = false;
      let fullContent = '';
      let started = false;

      req.on('close', () => { aborted = true; child.kill('SIGTERM'); });

      const sendEvent = (event, data) => {
        if (aborted) return;
        try {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (e) { aborted = true; child.kill(); }
      };

      let buf = '';
      child.stdout.on('data', (chunk) => {
        if (!started) {
          started = true;
          sendEvent('message_start', {
            type: 'message_start',
            message: { id: msgId, type: 'message', role: 'assistant', content: [], model: cursorModel, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } },
          });
          sendEvent('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
        }

        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const p = JSON.parse(line);
            if (p.type === 'assistant' && p.message?.content) {
              for (const part of p.message.content) {
                if (part.type === 'text' && part.text) {
                  const prev = fullContent;
                  fullContent = part.text;
                  const delta = fullContent.slice(prev.length);
                  if (delta) {
                    sendEvent('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: delta } });
                  }
                }
              }
            }
            if (p.type === 'result') {
              if (p.result && !fullContent) {
                fullContent = p.result;
                sendEvent('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p.result } });
              }
              sendEvent('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 0, input_tokens: 0 } });
              try { res.write('data: [DONE]\n\n'); res.end(); } catch (e) { /* ignore */ }
            }
          } catch (e) { /* skip */ }
        }
      });

      child.stderr.on('data', (c) => {
        const t = c.toString();
        if (t.includes('Warning') || t.includes('warn')) console.warn('[cursor-agent]', t);
      });

      child.on('close', () => {
        if (!aborted) { try { res.write('data: [DONE]\n\n'); res.end(); } catch (e) { /* ignore */ } }
      });

      child.on('error', (err) => {
        console.error('[cursor-agent]', err);
        if (!aborted) { try { res.end(); } catch (e) { /* ignore */ } }
      });

      return;
    }

    const child = spawnCursorAgent(cursorModel, prompt);
    let output = '';
    let errBuf = '';

    child.stdout.on('data', (c) => { output += c.toString(); });
    child.stderr.on('data', (c) => { errBuf += c.toString(); });

    child.on('close', () => {
      if (errBuf.includes('Warning') || errBuf.includes('warn')) console.warn('[cursor-agent]', errBuf);
      const result = parseCursorOutput(output.trim().split('\n'));
      res.json({
        id: msgId, type: 'message', role: 'assistant',
        content: [{ type: 'text', text: result || '' }],
        model: cursorModel, stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      });
    });

    child.on('error', (err) => {
      console.error('[cursor-agent]', err);
      res.status(500).json({ error: 'Internal server error' });
    });

  } catch (e) {
    console.error('[server]', e);
    res.status(500).json({ error: e.message });
  }
});

process.on('uncaughtException', (err) => console.error('[uncaught]', err));
process.on('unhandledRejection', (err) => console.error('[unhandled]', err));

app.listen(PORT, HOST, () => {
  console.log(`\n  ╔═══════════════════════════════════════════╗`);
  console.log(`  ║       Cursor2OAuth Proxy Server          ║`);
  console.log(`  ╠═══════════════════════════════════════════╣`);
  console.log(`  ║  🌐  http://${HOST}:${PORT}                   ║`);
  console.log(`  ║  🔌  OpenAI: /v1/chat/completions         ║`);
  console.log(`  ║  🦶  Anthropic: /v1/messages              ║`);
  console.log(`  ║  📋  /v1/models                          ║`);
  console.log(`  ╠═══════════════════════════════════════════╣`);
  console.log(`  ║  🤖  Default: ${DEFAULT_MODEL.padEnd(20)} ║`);
  console.log(`  ║  🔐  Auth: ${API_KEY ? 'enabled' : 'disabled'.padEnd(20)} ║`);
  console.log(`  ╚═══════════════════════════════════════════╝\n`);
});