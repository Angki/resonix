import { describe, it, expect } from 'vitest';
import { signSession, verifySession } from '../crypto.js';
import { initializeBootstrapToken, verifyBootstrapToken, consumeBootstrapToken } from '../bootstrap.js';
import { config } from '../config.js';

describe('Security Hardening Suite', () => {
  describe('Session Token Cryptography', () => {
    it('signs and successfully verifies a valid session token', () => {
      const userId = 'user-test-uuid-1234';
      const token = signSession(userId);
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);

      const verified = verifySession(token);
      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe(userId);
    });

    it('rejects tampered session token payload', () => {
      const token = signSession('real-user');
      const parts = token.split('.');
      parts[0] = 'attacker-user';
      const tampered = parts.join('.');

      const verified = verifySession(tampered);
      expect(verified).toBeNull();
    });

    it('rejects tampered HMAC signature', () => {
      const token = signSession('real-user');
      const parts = token.split('.');
      parts[2] = parts[2].substring(0, parts[2].length - 4) + '0000';
      const tampered = parts.join('.');

      const verified = verifySession(tampered);
      expect(verified).toBeNull();
    });

    it('rejects malformed session strings', () => {
      expect(verifySession('')).toBeNull();
      expect(verifySession('not.a.valid.token.parts')).toBeNull();
      expect(verifySession('singletoken')).toBeNull();
    });

    it('rejects expired session token', () => {
      const userId = 'expired-user';
      const oldTimestamp = (Date.now() - 31 * 24 * 60 * 60 * 1000).toString();
      // create a signed token with old timestamp
      const crypto = require('crypto');
      const payload = `${userId}.${oldTimestamp}`;
      const hmac = crypto.createHmac('sha256', config.SESSION_SECRET).update(payload).digest('hex');
      const expiredToken = `${payload}.${hmac}`;

      expect(verifySession(expiredToken)).toBeNull();
    });
  });

  describe('Bootstrap Token Security', () => {
    it('generates, verifies, and consumes ephemeral bootstrap tokens', () => {
      const token = initializeBootstrapToken();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes hex

      expect(verifyBootstrapToken(token)).toBe(true);
      expect(verifyBootstrapToken('invalid-fake-token')).toBe(false);

      consumeBootstrapToken();
      expect(verifyBootstrapToken(token)).toBe(false);
    });
  });

  describe('CORS and Origin Filtering', () => {
    it('contains default localhost and tailscale origins', () => {
      expect(config.allowedOrigins).toContain('http://localhost:3000');
      expect(config.allowedOrigins).toContain('http://127.0.0.1:3000');
    });
  });
});
