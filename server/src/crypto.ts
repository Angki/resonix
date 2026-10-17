import crypto from 'crypto';
import { config } from './config.js';

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

export function verifyPassword(password: string, combinedHash: string): Promise<boolean> {
  return new Promise((resolve) => {
    const parts = combinedHash.split(':');
    if (parts.length !== 2) return resolve(false);
    const [salt, hash] = parts;
    const hashBuffer = Buffer.from(hash, 'hex');

    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        resolve(crypto.timingSafeEqual(hashBuffer, derivedKey));
      } catch {
        resolve(false);
      }
    });
  });
}

function getDerivedEncryptionKey(): Buffer {
  return crypto.createHash('sha256').update(config.CREDENTIAL_ENCRYPTION_KEY).digest();
}

export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getDerivedEncryptionKey(), iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptSecret(cipherText: string): string {
  if (!cipherText) return '';
  const parts = cipherText.split(':');
  if (parts.length !== 3) return '';
  const [ivHex, authTagHex, encryptedData] = parts;
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getDerivedEncryptionKey(),
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return '';
  }
}

export function signSession(userId: string): string {
  const timestamp = Date.now().toString();
  const payload = `${userId}.${timestamp}`;
  const hmac = crypto.createHmac('sha256', config.SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${hmac}`;
}

export function verifySession(token: string): { userId: string } | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, timestamp, hmac] = parts;
  const payload = `${userId}.${timestamp}`;
  const expectedHmac = crypto.createHmac('sha256', config.SESSION_SECRET).update(payload).digest('hex');
  
  const a = Buffer.from(hmac, 'utf8');
  const b = Buffer.from(expectedHmac, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }
  
  // 30 days session expiry
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Date.now() - ts > 30 * 24 * 60 * 60 * 1000) {
    return null;
  }
  return { userId };
}
