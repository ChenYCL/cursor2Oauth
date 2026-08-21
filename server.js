const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { spawn } = require('child_process');

const CURSOR_MODELS = [
  'auto',
  'claude-sonnet-5', 'claude-sonnet-5-low', 'claude-sonnet-5-medium', 'claude-sonnet-5-high', 'claude-sonnet-5-xhigh', 'claude-sonnet-5-max',
  'claude-opus-5', 'claude-opus-5-low', 'claude-opus-5-medium', 'claude-opus-5-high',
  'claude-fable-5', 'claude-fable-5-low', 'claude-fable-5-medium', 'claude-fable-5-high', 'claude-fable-5-xhigh', 'claude-fable-5-max',
  'claude-opus-4-8-low', 'claude-opus-4-8-medium', 'claude-opus-4-8-high', 'claude-opus-4-8-xhigh', 'claude-opus-4-8-max',
  'claude-opus-4-7-low', 'claude-opus-4-7-medium', 'claude-opus-4-7-high', 'claude-opus-4-7-xhigh', 'claude-opus-4-7-max',
  'claude-4.6-opus-high', 'claude-4.6-opus-max',
  'gpt-5.3-codex-low', 'gpt-5.3-codex-low-fast', 'gpt-5.3-codex', 'gpt-5.3-codex-fast', 'gpt-5.3-codex-high', 'gpt-5.3-codex-high-fast', 'gpt-5.3-codex-xhigh', 'gpt-5.3-codex-xhigh-fast',
  'gpt-5.2', 'gpt-5.2-low', 'gpt-5.2-low-fast', 'gpt-5.2-fast', 'gpt-5.2-high', 'gpt-5.2-high-fast', 'gpt-5.2-xhigh', 'gpt-5.2-xhigh-fast',
  'gpt-5.1', 'gpt-5.1-low', 'gpt-5.1-high',
  'gpt-5.4-low', 'gpt-5.4-medium', 'gpt-5.4-medium-fast', 'gpt-5.4-high', 'gpt-5.4-high-fast', 'gpt-5.4-xhigh', 'gpt-5.4-xhigh-fast',
  'gpt-5.4-mini-none', 'gpt-5.4-mini-low', 'gpt-5.4-mini-medium', 'gpt-5.4-mini-high', 'gpt-5.4-mini-xhigh',
  'gpt-5.4-nano-none', 'gpt-5.4-nano-low', 'gpt-5.4-nano-medium', 'gpt-5.4-nano-high', 'gpt-5.4-nano-xhigh',
  'gpt-5.5-none', 'gpt-5.5-low', 'gpt-5.5-medium', 'gpt-5.5-high', 'gpt-5.5-extra-high',
  'gpt-5.6-sol-none', 'gpt-5.6-sol-low', 'gpt-5.6-sol-medium', 'gpt-5.6-sol-high', 'gpt-5.6-sol-xhigh', 'gpt-5.6-sol-max',
  'gpt-5.6-luna-none', 'gpt-5.6-luna-low', 'gpt-5.6-luna-medium', 'gpt-5.6-luna-high', 'gpt-5.6-luna-xhigh', 'gpt-5.6-luna-max',
  'gpt-5.6-terra-none', 'gpt-5.6-terra-low', 'gpt-5.6-terra-medium', 'gpt-5.6-terra-high', 'gpt-5.6-terra-xhigh', 'gpt-5.6-terra-max',
  'gpt-5-mini',
  'gemini-3.1-pro', 'gemini-3-flash', 'gemini-3.5-flash', 'gemini-3.6-flash-minimal', 'gemini-3.6-flash-low', 'gemini-3.6-flash-medium', 'gemini-3.6-flash-high', 'gemini-3.7-flash-low', 'gemini-3.7-flash-medium', 'gemini-3.7-flash-high',
  'cursor-grok-4.5-low', 'cursor-grok-4.5-medium', 'cursor-grok-4.5-high',
  'cursor-grok-4.6-low', 'cursor-grok-4.6-medium', 'cursor-grok-4.6-high', 'cursor-grok-4.6-xhigh',
  'kimi-k3-low', 'kimi-k3-high', 'kimi-k3-max', 'kimi-k2.7-code',
  'glm-5.2-high', 'glm-5.2-max',
  'composer-2.5', 'composer-2.5-fast',
];

const MODEL_MAP = {
  'gpt-4': 'gpt-5.3-codex',
  'gpt-4o': 'gpt-5.3-codex',
  'gpt-4-turbo': 'gpt-5.3-codex',
  'gpt-4o-mini': 'gpt-5.3-codex-low-fast',
  'gpt-3.5-turbo': 'gpt-5.3-codex-low-fast',
  'claude-3-opus': 'claude-opus-5',
  'claude-3-opus-20240229': 'claude-opus-5',
  'claude-3-sonnet': 'claude-sonnet-5',
  'claude-3-sonnet-20240229': 'claude-sonnet-5',
  'claude-3.5-sonnet': 'claude-sonnet-5',
  'claude-3.5-sonnet-20241022': 'claude-sonnet-5',
  'claude-3.5-haiku': 'claude-sonnet-5',
  'claude-3.5-haiku-20241022': 'claude-sonnet-5',
  'claude-4-5-sonnet-20250601': 'claude-sonnet-5',
  'claude-4.5-sonnet': 'claude-sonnet-5',
  'claude-4-sonnet': 'claude-sonnet-5',
  'claude-sonnet-4-5': 'claude-sonnet-5',
  'claude-sonnet-4-5-20250929': 'claude-sonnet-5',
  'claude-haiku-4-5': 'claude-sonnet-5',
  'claude-haiku-4-5-20251001': 'claude-sonnet-5',
  'gemini-pro': 'gemini-3.1-pro',
  'gemini-2.0-flash': 'gemini-3.6-flash-high',
  'gemini-2.5-pro': 'gemini-3.1-pro',
  'deepseek': 'gpt-5.3-codex-low',
  'deepseek-chat': 'gpt-5.3-codex-low',
};

const DEFAULT_MODEL = 'claude-sonnet-5';

const PORT = parseInt(process.env.PORT || '3000');
const HOST = process.env.HOST || '0.0.0.0';
const API_KEY = process.env.API_KEY || '';

function stripThinking(id) {
  return String(id || '')
    .replace(/-thinking-(none|low|medium|high|xhigh|max)(-fast)?$/i, (_, effort, fast) => `-${effort}${fast || ''}`)
    .replace(/-thinking(-fast)?$/i, (_, fast) => fast || '');
}

function upgradeLegacySonnet(id) {
  const x = String(id || '').toLowerCase();
  if (
    x === 'claude-4.5-sonnet' ||
    x === 'claude-4-sonnet' ||
    x.startsWith('claude-4.6-sonnet') ||
    x.startsWith('claude-sonnet-4-5') ||
    x.startsWith('claude-sonnet-4-6') ||
    x.includes('3.5-sonnet') ||
    x.includes('3-sonnet') ||
    x === 'claude-4-5-sonnet-20250601' ||
    x === 'claude-haiku-4-5' ||
    x === 'claude-haiku-4-5-20251001' ||
    x.includes('3.5-haiku') ||
    x.includes('3-5-haiku')
  ) {
    return 'claude-sonnet-5';
  }
  return id;
}

function parseFamilyEffort(id) {
  const raw = String(id || '');
  const hadThinking = /thinking/i.test(raw);
  let s = upgradeLegacySonnet(stripThinking(raw));
  const m = s.match(/^(.*?)-(none|low|medium|high|xhigh|max|extra-high)(-fast)?$/i);
  if (m) {
    return {
      family: m[1],
      effort: m[2].toLowerCase() === 'extra-high' ? 'xhigh' : m[2].toLowerCase(),
      fast: Boolean(m[3]),
      hadThinking,
    };
  }
  return { family: s, effort: null, fast: false, hadThinking };
}

function budgetToEffort(budget) {
  const n = Number(budget) || 0;
  if (n >= 32000) return 'max';
  if (n >= 16000) return 'xhigh';
  if (n >= 8000) return 'high';
  if (n >= 4000) return 'medium';
  if (n > 0) return 'low';
  return 'high';
}

function parseClientThinking(body) {
  const t = body && body.thinking;
  if (t && typeof t === 'object') {
    const typ = String(t.type || '').toLowerCase();
    if (typ === 'disabled' || typ === 'none') {
      return { thinking: false, effort: 'high' };
    }
    return { thinking: true, effort: budgetToEffort(t.budget_tokens) };
  }
  const re = String((body && (body.reasoning_effort || body.reasoningEffort)) || '').toLowerCase();
  if (['low', 'medium', 'high', 'xhigh', 'max'].includes(re)) {
    return { thinking: true, effort: re };
  }
  // 编程客户端默认开思考；力度 high。不想思考时在请求里传 thinking.type=disabled。
  return { thinking: true, effort: 'high' };
}

function claudeCursorId(family, thinking, effort, fast) {
  const e = effort || 'high';
  const fastSuf = fast ? '-fast' : '';
  if (thinking) {
    if (family === 'claude-opus-5' || family === 'claude-sonnet-5' || family === 'claude-fable-5'
      || family.startsWith('claude-opus-4-') || family.startsWith('claude-4.')) {
      if (family === 'claude-fable-5' && e === 'xhigh') return `claude-fable-5-thinking-xhigh${fastSuf}`;
      if (family === 'claude-sonnet-5' && e === 'xhigh') return `claude-sonnet-5-thinking-xhigh${fastSuf}`;
      return `${family}-thinking-${e}${fastSuf}`;
    }
  }
  if (family === 'claude-opus-5' && (e === 'xhigh' || e === 'max')) {
    return thinking ? `claude-opus-5-thinking-${e}${fastSuf}` : `claude-opus-5-high${fastSuf}`;
  }
  return `${family}-${e}${fastSuf}`;
}

function resolveModel(requested, body) {
  if (!requested) requested = DEFAULT_MODEL;
  const mapped = MODEL_MAP[requested] || requested;
  const parsed = parseFamilyEffort(mapped);
  const client = parseClientThinking(body || {});
  const effort = parsed.effort || client.effort || 'high';
  const thinking = parsed.hadThinking || client.thinking;
  if (!String(parsed.family).startsWith('claude-')) {
    return parsed.effort ? `${parsed.family}-${parsed.effort}${parsed.fast ? '-fast' : ''}` : parsed.family;
  }
  if (parsed.family === 'claude-sonnet-5' && !parsed.effort && thinking) {
    return claudeCursorId('claude-sonnet-5', true, effort, parsed.fast);
  }
  return claudeCursorId(parsed.family, thinking, effort, parsed.fast);
}

function classifyAgentError(errBuf, code, resultText) {
  const err = (errBuf || '').trim();
  const lower = err.toLowerCase();
  if (lower.includes('authentication required') || lower.includes('not logged in') || lower.includes('not authenticated')) {
    return { status: 401, error: 'Cursor CLI not authenticated. Run agent login or set CURSOR_API_KEY.' };
  }
  if (code && code !== 0) {
    return { status: 502, error: err || `cursor-agent exited with code ${code}` };
  }
  if (!resultText && err && !lower.includes('warning') && !lower.includes('warn')) {
    return { status: 502, error: err };
  }
  return null;
}

function spawnCursorAgent(model, prompt) {
  const child = spawn('cursor-agent', [
    '--print', '--trust', '--mode', 'ask',
    '--model', model,
    '--output-format', 'stream-json', prompt,
  ], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });

  setTimeout(() => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }, 180000);
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
  if (req.path === '/health') return next();
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
  const now = Math.floor(Date.now() / 1000);
  const data = CURSOR_MODELS.map(id => ({
    id, object: 'model', created: now, owned_by: 'cursor',
  }));
  res.json({ object: 'list', data });
});

app.post('/v1/chat/completions', (req, res) => {
  try {
    const { model, messages, stream = false } = req.body;
    if (!messages?.length) return res.status(400).json({ error: 'messages required' });
    const prompt = extractPrompt(messages);
    if (!prompt) return res.status(400).json({ error: 'user message required' });

    const cursorModel = resolveModel(model, req.body);
    console.log('[model]', model, '->', cursorModel);

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const child = spawnCursorAgent(cursorModel, prompt);
      let finished = false;
      let fullContent = '';
      let errBuf = '';

      const cleanup = () => {
        if (finished) return;
        finished = true;
        if (!child.killed) child.kill('SIGTERM');
      };

      res.on('close', cleanup);

      const send = (content, finishReason) => {
        if (finished) return;
        try {
          if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: cursorModel,
              choices: [{ index: 0, delta: content ? { content } : {}, finish_reason: finishReason || null }],
            })}\n\n`);
          }
        } catch (e) { cleanup(); }
      };

      const end = () => {
        if (finished) return;
        finished = true;
        try {
          if (!res.writableEnded) {
            res.write('data: [DONE]\n\n');
            res.end();
          }
        } catch (e) { /* ignore */ }
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
              end();
            }
          } catch (e) { /* skip */ }
        }
      });

      child.stderr.on('data', (c) => {
        const t = c.toString();
        errBuf += t;
        if (t.includes('Warning') || t.includes('warn')) console.warn('[cursor-agent]', t);
      });

      child.on('close', (code) => {
        const fail = classifyAgentError(errBuf, code, fullContent);
        if (fail && !fullContent) {
          if (finished || res.writableEnded) return;
          finished = true;
          try {
            res.write(`data: ${JSON.stringify({ error: { message: fail.error, type: 'api_error' } })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          } catch (e) { /* ignore */ }
          return;
        }
        end();
      });

      child.on('error', (err) => {
        console.error('[cursor-agent]', err);
        end();
      });

      return;
    }

    const child = spawnCursorAgent(cursorModel, prompt);
    let output = '';
    let errBuf = '';

    child.stdout.on('data', (c) => { output += c.toString(); });
    child.stderr.on('data', (c) => { errBuf += c.toString(); });

    child.on('close', (code) => {
      if (errBuf.includes('Warning') || errBuf.includes('warn')) console.warn('[cursor-agent]', errBuf);
      const result = parseCursorOutput(output.trim().split('\n'));
      const fail = classifyAgentError(errBuf, code, result);
      if (fail) {
        return res.status(fail.status).json({ error: { message: fail.error, type: 'api_error' } });
      }
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

    const cursorModel = resolveModel(model, req.body);
    console.log('[model]', model, '->', cursorModel);
    const msgId = `msg_${Date.now()}`;

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const child = spawnCursorAgent(cursorModel, prompt);
      let finished = false;
      let fullContent = '';
      let started = false;
      let errBuf = '';

      const cleanup = () => {
        if (finished) return;
        finished = true;
        if (!child.killed) child.kill('SIGTERM');
      };

      res.on('close', cleanup);

      const sendEvent = (event, data) => {
        if (finished) return;
        try {
          if (!res.writableEnded) {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          }
        } catch (e) { cleanup(); }
      };

      const end = () => {
        if (finished) return;
        finished = true;
        try {
          if (!res.writableEnded) {
            res.write('data: [DONE]\n\n');
            res.end();
          }
        } catch (e) { /* ignore */ }
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
              end();
            }
          } catch (e) { /* skip */ }
        }
      });

      child.stderr.on('data', (c) => {
        const t = c.toString();
        errBuf += t;
        if (t.includes('Warning') || t.includes('warn')) console.warn('[cursor-agent]', t);
      });

      child.on('close', (code) => {
        const fail = classifyAgentError(errBuf, code, fullContent);
        if (fail && !fullContent) {
          if (finished || res.writableEnded) return;
          finished = true;
          try {
            res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'api_error', message: fail.error } })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          } catch (e) { /* ignore */ }
          return;
        }
        end();
      });
      child.on('error', (err) => { console.error('[cursor-agent]', err); end(); });

      return;
    }

    const child = spawnCursorAgent(cursorModel, prompt);
    let output = '';
    let errBuf = '';

    child.stdout.on('data', (c) => { output += c.toString(); });
    child.stderr.on('data', (c) => { errBuf += c.toString(); });

    child.on('close', (code) => {
      if (errBuf.includes('Warning') || errBuf.includes('warn')) console.warn('[cursor-agent]', errBuf);
      const result = parseCursorOutput(output.trim().split('\n'));
      const fail = classifyAgentError(errBuf, code, result);
      if (fail) {
        return res.status(fail.status).json({ error: { message: fail.error, type: 'api_error' } });
      }
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