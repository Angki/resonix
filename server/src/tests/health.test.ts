import { describe, it, expect } from 'vitest';
import {
  HEALTH_ISSUE_TYPES,
  HEALTH_ISSUE_META,
  isHealthIssueType,
  isIgnorableIssueType,
  issueSignature,
  trackMissingFields,
  suspiciousAudioReasons,
  computeHealthScore,
} from '../health/healthService.js';

describe('Library Health diagnostics', () => {
  describe('issue registry', () => {
    it('exposes metadata for every issue type', () => {
      expect(HEALTH_ISSUE_TYPES).toHaveLength(8);
      for (const type of HEALTH_ISSUE_TYPES) {
        expect(HEALTH_ISSUE_META[type].label.length).toBeGreaterThan(0);
        expect(['critical', 'warning', 'info']).toContain(HEALTH_ISSUE_META[type].severity);
      }
    });

    it('recognizes valid issue types only', () => {
      expect(isHealthIssueType('duplicates')).toBe(true);
      expect(isHealthIssueType('missing-artwork')).toBe(true);
      expect(isHealthIssueType('bogus')).toBe(false);
      expect(isHealthIssueType('')).toBe(false);
    });

    it('marks only non-structural issues as ignorable', () => {
      expect(isIgnorableIssueType('roots')).toBe(false);
      expect(isIgnorableIssueType('unavailable')).toBe(false);
      expect(isIgnorableIssueType('duplicates')).toBe(true);
      expect(isIgnorableIssueType('metadata-gaps')).toBe(true);
    });
  });

  describe('issueSignature', () => {
    it('is deterministic and hex encoded', () => {
      const a = issueSignature('duplicates', ['Song', 'Artist', 240]);
      const b = issueSignature('duplicates', ['Song', 'Artist', 240]);
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{20}$/);
    });

    it('separates namespaces and part order', () => {
      expect(issueSignature('duplicates', ['a', 'b'])).not.toBe(issueSignature('split-albums', ['a', 'b']));
      expect(issueSignature('duplicates', ['a', 'b'])).not.toBe(issueSignature('duplicates', ['b', 'a']));
    });

    it('treats null and undefined parts as empty strings', () => {
      expect(issueSignature('duplicate-artists', [null])).toBe(issueSignature('duplicate-artists', [undefined]));
    });
  });

  describe('trackMissingFields', () => {
    it('reports every missing metadata field', () => {
      expect(trackMissingFields({ genre: null, year: null, trackNumber: null })).toEqual([
        'genre',
        'year',
        'trackNumber',
      ]);
      expect(trackMissingFields({ genre: '   ', year: undefined, trackNumber: undefined })).toEqual([
        'genre',
        'year',
        'trackNumber',
      ]);
    });

    it('returns an empty list for complete metadata', () => {
      expect(trackMissingFields({ genre: 'Black Metal', year: 1994, trackNumber: 1 })).toEqual([]);
    });
  });

  describe('suspiciousAudioReasons', () => {
    it('accepts healthy audio properties', () => {
      expect(
        suspiciousAudioReasons({ duration: 215, bitrate: 320, sampleRate: 44100, fileSize: 8 * 1024 * 1024 })
      ).toEqual([]);
    });

    it('flags zero duration, missing technical data and tiny files', () => {
      expect(
        suspiciousAudioReasons({ duration: 0, bitrate: null, sampleRate: null, fileSize: 4096 })
      ).toEqual(['zero-duration', 'missing-bitrate', 'missing-sample-rate', 'tiny-file']);
    });

    it('flags extreme duration separately from zero duration', () => {
      const reasons = suspiciousAudioReasons({
        duration: 4 * 60 * 60,
        bitrate: 128,
        sampleRate: 44100,
        fileSize: 1024 * 1024,
      });
      expect(reasons).toEqual(['extreme-duration']);
    });

    it('ignores zero file size', () => {
      expect(
        suspiciousAudioReasons({ duration: 180, bitrate: 192, sampleRate: 48000, fileSize: 0 })
      ).toEqual([]);
    });
  });

  describe('computeHealthScore', () => {
    it('returns 100 for a library without issues', () => {
      expect(
        computeHealthScore({
          totalTracks: 1000,
          totalAlbums: 100,
          missingGenre: 0,
          missingYear: 0,
          missingArtworkAlbums: 0,
          missingTrackNumber: 0,
          unavailableTracks: 0,
        })
      ).toBe(100);
    });

    it('weights artwork and unavailable tracks more heavily', () => {
      const baseline = {
        totalTracks: 100,
        totalAlbums: 10,
        missingGenre: 0,
        missingYear: 0,
        missingArtworkAlbums: 0,
        missingTrackNumber: 0,
        unavailableTracks: 0,
      };
      const artworkPenalty = 100 - computeHealthScore({ ...baseline, missingArtworkAlbums: 10 });
      const unavailablePenalty = 100 - computeHealthScore({ ...baseline, unavailableTracks: 10 });
      expect(unavailablePenalty).toBeGreaterThan(artworkPenalty);
    });

    it('clamps the score to zero', () => {
      expect(
        computeHealthScore({
          totalTracks: 10,
          totalAlbums: 0,
          missingGenre: 10000,
          missingYear: 10000,
          missingArtworkAlbums: 1000,
          missingTrackNumber: 10000,
          unavailableTracks: 10000,
        })
      ).toBe(0);
    });

    it('handles an empty library without dividing by zero', () => {
      expect(
        computeHealthScore({
          totalTracks: 0,
          totalAlbums: 0,
          missingGenre: 0,
          missingYear: 0,
          missingArtworkAlbums: 0,
          missingTrackNumber: 0,
          unavailableTracks: 0,
        })
      ).toBe(100);
    });
  });
});
