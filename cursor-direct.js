const http2 = require('http2');
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const API_BASE = 'api2.cursor.sh';

function getTokenPath() {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
  if (process.platform === 'win32') {
    return path.join(home, 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
  return path.join(home, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
}

function getTokens() {
  try {
    const dbPath = getTokenPath();
    const result = {};
    const keys = [
      'cursorAuth/accessToken', 'cursorAuth/refreshToken',
      'telemetry.machineId', 'telemetry.macMachineId',
      'storage.serviceMachineId',
    ];
    for (const key of keys) {
      const out = execSync(
        `sqlite3 "${dbPath}" "SELECT value FROM ItemTable WHERE key='${key}';"`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();
      if (out) result[key] = out;
    }
    return result;
  } catch (err) {
    throw new Error(`Cannot read Cursor DB: ${err.message}`);
  }
}

function encodeVarint(value) {
  const bytes = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
  return Buffer.from(bytes);
}

function encodeField(wireType, fieldNum, value) {
  const tag = encodeVarint((fieldNum << 3) | wireType);
  return Buffer.concat([tag, value]);
}

function encodeStringField(fieldNum, value) {
  if (!value) return Buffer.alloc(0);
  const data = Buffer.from(value, 'utf-8');
  const len = encodeVarint(data.length);
  return encodeField(2, fieldNum, Buffer.concat([len, data]));
}

function encodeBoolField(fieldNum, value) {
  if (!value) return Buffer.alloc(0);
  return encodeField(0, fieldNum, encodeVarint(1));
}

function encodeMessageField(fieldNum, data) {
  if (!data || data.length === 0) return Buffer.alloc(0);
  const len = encodeVarint(data.length);
  return encodeField(2, fieldNum, Buffer.concat([len, data]));
}

function encodeConversationMessage(role, content) {
  return Buffer.concat([
    encodeStringField(1, role),
    encodeStringField(2, content),
  ]);
}

function encodeModelDetails(modelId) {
  return encodeStringField(1, modelId);
}

function encodeRequest(messages, modelId, conversationId) {
  const parts = [];

  for (const [role, content] of messages) {
    parts.push(encodeMessageField(1, encodeConversationMessage(role, content)));
  }

  parts.push(encodeMessageField(5, encodeModelDetails(modelId)));
  parts.push(encodeBoolField(22, true)); // is_chat
  parts.push(encodeStringField(23, conversationId));
  parts.push(encodeBoolField(45, true)); // is_headless

  return Buffer.concat(parts);
}

function encodeConnectMessage(data) {
  const header = Buffer.alloc(5);
  header.writeUInt8(0, 0); // flags
  header.writeUInt32BE(data.length, 1); // length
  return Buffer.concat([header, data]);
}

function parseConnectResponse(data) {
  const messages = [];
  let offset = 0;
  while (offset + 5 <= data.length) {
    const flags = data.readUInt8(offset);
    const length = data.readUInt32BE(offset + 1);
    offset += 5;
    if (offset + length > data.length) break;
    messages.push(data.slice(offset, offset + length));
    offset += length;
  }
  return messages;
}

function extractStringField(data, fieldNum) {
  let offset = 0;
  while (offset < data.length) {
    const tag = data[offset];
    const wireType = tag & 0x07;
    const field = tag >> 3;
    offset++;

    if (wireType === 0) {
      while (offset < data.length && data[offset] & 0x80) offset++;
      offset++;
    } else if (wireType === 2) {
      let len = 0;
      let shift = 0;
      while (offset < data.length) {
        const byte = data[offset++];
        len |= (byte & 0x7f) << shift;
        shift += 7;
        if (!(byte & 0x80)) break;
      }
      if (field === fieldNum) {
        return data.slice(offset, offset + len).toString('utf-8');
      }
      offset += len;
    } else if (wireType === 1) {
      offset += 8;
    } else if (wireType === 5) {
      offset += 4;
    } else {
      break;
    }
  }
  return null;
}

async function directChat(prompt, modelId = 'claude-4.5-sonnet') {
  const tokens = getTokens();
  const jwt = tokens['cursorAuth/accessToken'];
  if (!jwt) throw new Error('No access token found. Login to Cursor first.');

  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${API_BASE}`);
    const conversationId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const body = encodeConnectMessage(
      encodeRequest([['user', prompt]], modelId, conversationId)
    );

    const req = client.request({
      ':method': 'POST',
      ':path': '/aiserver.v1.AiService/StreamChat',
      'content-type': 'application/proto',
      'authorization': `Bearer ${jwt}`,
      'connect-protocol-version': '1',
      'accept': 'application/proto',
    });

    let responseData = Buffer.alloc(0);
    let textParts = [];

    req.on('data', (chunk) => {
      responseData = Buffer.concat([responseData, chunk]);
    });

    req.on('end', () => {
      const messages = parseConnectResponse(responseData);
      for (const msg of messages) {
        const text = extractStringField(msg, 1);
        if (text) textParts.push(text);

        const toolCall = extractRawField(msg, 13);
        const toolCallV2 = extractRawField(msg, 36);
        if (toolCall || toolCallV2) {
          textParts.push(`[tool_call: ${toolCall ? 'v1' : 'v2'}]`);
        }
      }
      client.close();
      resolve(textParts.join(''));
    });

    req.on('error', (err) => {
      client.close();
      reject(err);
    });

    req.end(body);
  });
}

function extractRawField(data, fieldNum) {
  let offset = 0;
  while (offset < data.length) {
    const tag = data[offset];
    const wireType = tag & 0x07;
    const field = tag >> 3;
    offset++;

    if (wireType === 0) {
      while (offset < data.length && data[offset] & 0x80) offset++;
      offset++;
    } else if (wireType === 2) {
      let len = 0;
      let shift = 0;
      while (offset < data.length) {
        const byte = data[offset++];
        len |= (byte & 0x7f) << shift;
        shift += 7;
        if (!(byte & 0x80)) break;
      }
      if (field === fieldNum) {
        return data.slice(offset, offset + len);
      }
      offset += len;
    } else if (wireType === 1) {
      offset += 8;
    } else if (wireType === 5) {
      offset += 4;
    } else {
      break;
    }
  }
  return null;
}

/**
 * 解析出一个能调 Cursor API 的 access token。
 *
 * 三个来源，按可靠性排序 —— 存在的理由是**部署形态不同，token 落在不同地方**：
 *
 *   1. `CURSOR_ACCESS_TOKEN` 环境变量。Docker 里唯一确定能用的一条：容器里既
 *      没有桌面版的 state.vscdb，Cursor CLI 把凭证写去哪也没有公开契约（实测
 *      macOS 上 ~/.config、~/.local/share、钥匙串里都找不到）。
 *   2. Cursor CLI 的 XDG 目录。他们的 compose 把 XDG_CONFIG_HOME 指到
 *      /root/.cursor/xdg-config，所以容器里凭证大概率在这下面；用「扫 JSON 找
 *      token 字段」而不是写死文件名，免得上游改一次名字就全废。
 *   3. 桌面版 Cursor 的 state.vscdb。本机开发时最省事，`getTokens()` 已经在读。
 *
 * 找不到就抛错并把三条路都说出来 —— 「No access token」这种话不够用户自救。
 */
function resolveAccessToken() {
  const fromEnv = (process.env.CURSOR_ACCESS_TOKEN || '').trim();
  if (fromEnv) return fromEnv;

  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) {
    const token = scanForToken(path.join(xdg, 'cursor-agent'))
      || scanForToken(xdg);
    if (token) return token;
  }

  try {
    const jwt = getTokens()['cursorAuth/accessToken'];
    if (jwt) return jwt;
  } catch { /* 桌面版没装/读不到，落到下面的报错 */ }

  throw new Error(
    'No Cursor access token. 三条路任选一条：'
    + '(1) 设环境变量 CURSOR_ACCESS_TOKEN；'
    + '(2) 让 Cursor CLI 登录且 XDG_CONFIG_HOME 指向它的配置目录；'
    + '(3) 在本机桌面版 Cursor 里登录。'
  );
}

/** 在一个目录下浅扫 JSON，找形如 accessToken 的字段。找不到返回 null。 */
function scanForToken(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch { return null; }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, e.name), 'utf-8'));
      const hit = findTokenField(doc);
      if (hit) return hit;
    } catch { /* 坏 JSON 跳过 */ }
  }
  return null;
}

/** 递归找第一个 key 含 accesstoken 且值像 JWT 的字段。 */
function findTokenField(node, depth = 0) {
  if (depth > 4 || !node || typeof node !== 'object') return null;
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string' && /accesstoken/i.test(k) && v.split('.').length === 3) {
      return v;
    }
    if (typeof v === 'object') {
      const hit = findTokenField(v, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Connect 协议的一元调用，JSON 编码。
 *
 * 和上面 StreamChat 那条路不一样：那是**流式** RPC，body 要套 5 字节的
 * Connect 帧头、内容是手搓的 protobuf。一元调用不用帧头，直接发 JSON 就行，
 * Cursor 服务端认 `content-type: application/json` —— 省掉给每个响应消息写
 * 一遍 protobuf 解析。
 */
function connectUnaryJson(path_, payload) {
  const jwt = resolveAccessToken();

  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${API_BASE}`);
    const body = Buffer.from(JSON.stringify(payload || {}), 'utf-8');
    const req = client.request({
      ':method': 'POST',
      ':path': path_,
      'content-type': 'application/json',
      'connect-protocol-version': '1',
      'authorization': `Bearer ${jwt}`,
      'content-length': body.length,
    });

    let status = 0;
    let buf = Buffer.alloc(0);
    req.on('response', (h) => { status = h[':status']; });
    req.on('data', (c) => { buf = Buffer.concat([buf, c]); });
    req.on('end', () => {
      client.close();
      const text = buf.toString('utf-8');
      let json = null;
      try { json = JSON.parse(text); } catch { /* 非 JSON 就原样带回去 */ }
      if (status !== 200) {
        // Connect 的错误体是 {code, message}
        const msg = (json && (json.message || json.code)) || text.slice(0, 200);
        return reject(new Error(`${path_} -> HTTP ${status}: ${msg}`));
      }
      if (!json) return reject(new Error(`${path_} 返回的不是 JSON`));
      resolve(json);
    });
    req.on('error', (err) => { client.close(); reject(err); });
    req.end(body);
  });
}

/** 分 -> 美元。Cursor 这几个额度字段都是**分**。 */
function centsToUsd(c) {
  return typeof c === 'number' ? Math.round(c) / 100 : null;
}

function pct(used, total) {
  if (typeof used !== 'number' || typeof total !== 'number' || total <= 0) return null;
  return Math.round((used / total) * 10000) / 100;
}

/**
 * 当前计费周期的订阅用量。
 *
 * 归一成「窗口」数组，形状对齐 ccLoad 内核给 OAuth 渠道的
 * `oauth_usage.windows[]`，这样客户端那一页不用为 Cursor 单写一套渲染。
 *
 * # 百分比取哪个
 *
 * 响应里有三个百分比，含义不一样，别拿错：
 *   * `totalSpend / limit` —— 已用掉的**包含额度**。Cursor 自己界面上显示的
 *     那句 "You've used 90% of your included usage" 就是它。
 *   * `totalPercentUsed` —— 另一个口径（实测 14.41，而同一时刻 displayMessage
 *     说 90%），拿它当主指标会显示出一个和 Cursor 官方界面对不上的数。
 *   * `apiPercentUsed` / `autoPercentUsed` —— 按 API / auto 两类模型分开算。
 *
 * 所以主窗口用 `totalSpend / limit`，另外两个分项各成一条，官方原文
 * `displayMessage` 一并带上，对不上时用户能自己核。
 */
async function getUsage() {
  const raw = await connectUnaryJson(
    '/aiserver.v1.DashboardService/GetCurrentPeriodUsage',
    {},
  );

  const plan = raw.planUsage || {};
  const startMs = Number(raw.billingCycleStart) || 0;
  const endMs = Number(raw.billingCycleEnd) || 0;
  const windowSeconds = startMs && endMs ? Math.round((endMs - startMs) / 1000) : 0;
  const resetAt = endMs ? Math.round(endMs / 1000) : 0;

  const windows = [];
  const used = pct(plan.totalSpend, plan.limit);
  if (used !== null) {
    windows.push({
      limit_name: 'included',
      kind: 'spend',
      used_percent: used,
      remaining_percent: Math.round((100 - used) * 100) / 100,
      limit_window_seconds: windowSeconds,
      reset_at: resetAt,
      limit_usd: centsToUsd(plan.limit),
      spend_usd: centsToUsd(plan.totalSpend),
      remaining_usd: centsToUsd(plan.remaining),
    });
  }
  for (const [name, p] of [
    ['api', plan.apiPercentUsed],
    ['auto', plan.autoPercentUsed],
  ]) {
    if (typeof p !== 'number') continue;
    const v = Math.round(p * 100) / 100;
    windows.push({
      limit_name: name,
      kind: 'spend',
      used_percent: v,
      remaining_percent: Math.round((100 - v) * 100) / 100,
      limit_window_seconds: windowSeconds,
      reset_at: resetAt,
    });
  }

  return {
    provider: 'cursor',
    plan_type: raw.spendLimitUsage?.limitType || '',
    windows,
    // Cursor 官方界面上那句话。主窗口的百分比要和它对得上；对不上就是我们算错了。
    display_message: raw.displayMessage || '',
    billing_cycle_start: startMs ? Math.round(startMs / 1000) : 0,
    billing_cycle_end: resetAt,
    // 原始响应保留：上游加字段时不用改这里就能先看到。
    raw,
  };
}

async function test() {
  try {
    console.log('Fetching tokens...');
    const tokens = await getTokens();
    console.log('Token found:', tokens['cursorAuth/accessToken']?.slice(0, 20) + '...');

    console.log('\nSending test request...');
    const result = await directChat('回复一句话：你好，说OK即可', 'claude-4.5-sonnet');
    console.log('Result:', result);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

if (require.main === module) {
  test();
}

module.exports = { directChat, getTokens, getTokenPath, getUsage, connectUnaryJson };