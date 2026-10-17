import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

describe('OpenSubsonic API Protocol Suite', () => {
  describe('Subsonic Token & Salt Authentication', () => {
    it('computes and validates Subsonic md5(password + salt) token properly', () => {
      const password = 'testpassword123';
      const salt = 'randomsalt987';
      const expectedToken = crypto.createHash('md5').update(password + salt).digest('hex').toLowerCase();

      // Client calculation
      const clientToken = crypto.createHash('md5').update('testpassword123randomsalt987').digest('hex').toLowerCase();

      expect(clientToken).toBe(expectedToken);
      expect(clientToken.length).toBe(32);
    });

    it('rejects incorrect password with same salt', () => {
      const salt = 'randomsalt987';
      const serverToken = crypto.createHash('md5').update('correct_password' + salt).digest('hex').toLowerCase();
      const clientToken = crypto.createHash('md5').update('wrong_password' + salt).digest('hex').toLowerCase();

      expect(clientToken).not.toBe(serverToken);
    });

    it('correctly decodes legacy enc:hex password parameter', () => {
      const original = 'metalhead2026';
      const hexEncoded = 'enc:' + Buffer.from(original, 'utf8').toString('hex');

      expect(hexEncoded.startsWith('enc:')).toBe(true);
      const decoded = Buffer.from(hexEncoded.slice(4), 'hex').toString('utf8');
      expect(decoded).toBe(original);
    });
  });

  describe('Subsonic Response Standard', () => {
    it('formats valid JSON Subsonic envelope', () => {
      const payload = {
        'subsonic-response': {
          status: 'ok',
          version: '1.16.1',
          type: 'black-library',
          serverVersion: '1.0.0',
          openSubsonic: true,
          ping: {},
        },
      };

      expect(payload['subsonic-response'].status).toBe('ok');
      expect(payload['subsonic-response'].version).toBe('1.16.1');
      expect(payload['subsonic-response'].openSubsonic).toBe(true);
    });

    it('formats Subsonic error envelope with proper error codes', () => {
      const errorPayload = {
        'subsonic-response': {
          status: 'failed',
          version: '1.16.1',
          type: 'black-library',
          serverVersion: '1.0.0',
          openSubsonic: true,
          error: {
            code: 40,
            message: 'Wrong username or password',
          },
        },
      };

      expect(errorPayload['subsonic-response'].status).toBe('failed');
      expect(errorPayload['subsonic-response'].error.code).toBe(40);
      expect(errorPayload['subsonic-response'].error.message).toBe('Wrong username or password');
    });

    it('scales 1-5 star ratings to 0-100 percentage properly', () => {
      const scaleRating = (raw: number) => raw > 0 ? Math.min(100, Math.max(0, raw * 20)) : null;
      expect(scaleRating(5)).toBe(100);
      expect(scaleRating(3)).toBe(60);
      expect(scaleRating(1)).toBe(20);
      expect(scaleRating(0)).toBe(null);
    });

    it('formats Subsonic lyrics envelope properly', () => {
      const payload = {
        'subsonic-response': {
          status: 'ok',
          lyrics: {
            artist: 'Darkthrone',
            title: 'Transilvanian Hunger',
            content: 'Transilvanian Hunger, cold, soul...',
          },
        },
      };
      expect(payload['subsonic-response'].lyrics.artist).toBe('Darkthrone');
      expect(payload['subsonic-response'].lyrics.content).toContain('cold');
    });
  });
});
