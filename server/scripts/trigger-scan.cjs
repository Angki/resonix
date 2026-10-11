const http = require('http');
const crypto = require('crypto');
require('dotenv').config({ path: '../.env' });

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_session_secret_change_in_production_key';
const userId = '2217e50a-0a1e-480b-b41c-a5ee6d2412bc'; // admin user
const timestamp = Date.now().toString();
const payload = `${userId}.${timestamp}`;
const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
const token = `${payload}.${hmac}`;

const rawBlackMetalId = '2b9045f5-9588-46d2-851c-bcd2956ea21d';
const body = JSON.stringify({ rootId: rawBlackMetalId });

const req = http.request(
  {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/library/scan',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session=${token}`,
      'X-Requested-With': 'BlackLibraryAdmin',
      'Content-Length': Buffer.byteLength(body),
    },
  },
  (res) => {
    let data = '';
    res.on('data', (c) => (data += c));
    res.on('end', () => {
      console.log('HTTP', res.statusCode, data);
    });
  }
);

req.on('error', (e) => console.error(e));
req.write(body);
req.end();
