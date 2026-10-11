const http = require('http');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_session_secret_change_in_production_key';
const userId = '2217e50a-0a1e-480b-b41c-a5ee6d2412bc';
const payload = `${userId}.${Date.now()}`;
const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
const token = `${payload}.${hmac}`;

http.get('http://127.0.0.1:3000/api/library/status', {
  headers: {
    'Cookie': `session=${token}`,
    'X-Requested-With': 'BlackLibraryAdmin',
  }
}, (res) => {
  let data = '';
  res.on('data', (c) => (data += c));
  res.on('end', () => {
    try {
      const s = JSON.parse(data);
      console.log('SCAN STATUS:');
      console.log('Running:', s.isRunning);
      console.log('Current Root:', s.currentRoot);
      console.log('Current Folder:', s.currentFolder);
      console.log('Total files found:', s.totalFilesFound);
      console.log('Tracks processed:', s.tracksProcessed);
      console.log('Tracks added:', s.tracksAdded);
      console.log('Errors:', s.errorsCount);
      if (s.errorMessages && s.errorMessages.length > 0) {
        console.log('Sample errors:', s.errorMessages.slice(0, 3));
      }
    } catch {
      console.log(data);
    }
  });
}).on('error', console.error);
