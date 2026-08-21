const http2 = require('http2');
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

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

module.exports = { directChat, getTokens, getTokenPath };