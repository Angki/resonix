import { describe, it, expect } from 'vitest';
import {
  canPerformInitialSetup,
  isLoopbackAddress,
  isPlaceholderSecret,
  parseTrustProxy,
} from '../security/network.js';

describe('Security Hardening Helpers', () => {
  describe('isLoopbackAddress', () => {
    it('accepts IPv4 loopback addresses from the whole 127.0.0.0/8 range', () => {
      expect(isLoopbackAddress('127.0.0.1')).toBe(true);
      expect(isLoopbackAddress('127.4.5.6')).toBe(true);
    });

    it('accepts IPv6 loopback and IPv4-mapped loopback', () => {
      expect(isLoopbackAddress('::1')).toBe(true);
      expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    });

    it('rejects non-loopback and missing addresses', () => {
      expect(isLoopbackAddress('192.168.1.20')).toBe(false);
      expect(isLoopbackAddress('::ffff:192.168.1.20')).toBe(false);
      expect(isLoopbackAddress(undefined)).toBe(false);
      expect(isLoopbackAddress('')).toBe(false);
    });
  });

  describe('parseTrustProxy', () => {
    it('parses boolean values', () => {
      expect(parseTrustProxy('false')).toBe(false);
      expect(parseTrustProxy('true')).toBe(true);
    });

    it('parses hop counts', () => {
      expect(parseTrustProxy('2')).toBe(2);
    });

    it('keeps an explicit proxy address list', () => {
      expect(parseTrustProxy('127.0.0.1,::1')).toBe('127.0.0.1,::1');
    });
  });

  describe('isPlaceholderSecret', () => {
    it('rejects the shipped compose placeholders', () => {
      expect(isPlaceholderSecret('change_me_to_a_secure_random_string_min_32_chars!')).toBe(true);
      expect(isPlaceholderSecret('change_me_to_another_secure_key_min_32_chars!')).toBe(true);
    });

    it('rejects common placeholder wording in any case', () => {
      expect(isPlaceholderSecret('CHANGEME-super-secret-value')).toBe(true);
      expect(isPlaceholderSecret('your_session_secret_here_123456')).toBe(true);
    });

    it('accepts a normal high-entropy value', () => {
      expect(isPlaceholderSecret('9f8a7c6d5e4b3a2918273645f6e7d8c9')).toBe(false);
    });
  });

  describe('canPerformInitialSetup', () => {
    it('allows a direct local connection without a token in PERSONAL mode', () => {
      expect(
        canPerformInitialSetup({
          remoteAddress: '127.0.0.1',
          tokenValid: false,
          profile: 'PERSONAL',
        })
      ).toBe(true);
    });

    it('requires a valid bootstrap token for remote connections', () => {
      expect(
        canPerformInitialSetup({
          remoteAddress: '203.0.113.10',
          tokenValid: false,
          profile: 'PERSONAL',
        })
      ).toBe(false);
      expect(
        canPerformInitialSetup({
          remoteAddress: '203.0.113.10',
          tokenValid: true,
          profile: 'PERSONAL',
        })
      ).toBe(true);
    });

    it('always requires a token in PUBLIC mode, even from loopback', () => {
      expect(
        canPerformInitialSetup({
          remoteAddress: '127.0.0.1',
          tokenValid: false,
          profile: 'PUBLIC',
        })
      ).toBe(false);
    });
  });
});
