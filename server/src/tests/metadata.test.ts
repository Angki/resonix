import { describe, it, expect } from 'vitest';
import { cleanTitle, parseVinylOrTrackNumber, parseReplayGain } from '../library/metadata.js';

describe('Metadata Cleaning and Parsing', () => {
  describe('cleanTitle', () => {
    it('strips redundant track number prefixes with explicit separators', () => {
      expect(cleanTitle(undefined, '01. ColdWorld - Scars.mp3', 'ColdWorld')).toBe('Scars');
      expect(cleanTitle(undefined, '01 - ColdWorld - Scars.flac', 'ColdWorld')).toBe('Scars');
      expect(cleanTitle(undefined, '01) Scars.mp3')).toBe('Scars');
      expect(cleanTitle(undefined, '01_Scars.mp3')).toBe('Scars');
      expect(cleanTitle(undefined, '01 Scars.mp3')).toBe('Scars');
    });

    it('strips vinyl side notations', () => {
      expect(cleanTitle(undefined, 'A1. ColdWorld - Scars.mp3', 'ColdWorld')).toBe('Scars');
      expect(cleanTitle(undefined, 'B2 - Autumn Shades.mp3')).toBe('Autumn Shades');
      expect(cleanTitle(undefined, 'C1. The Wind.mp3')).toBe('The Wind');
      expect(cleanTitle(undefined, 'D2 - Escape II.mp3')).toBe('Escape II');
    });

    it('strips redundant artist prefixes with various delimiters', () => {
      expect(cleanTitle('ColdWorld - Scars', 'Scars.mp3', 'ColdWorld')).toBe('Scars');
      expect(cleanTitle('ColdWorld – Scars', 'Scars.mp3', 'ColdWorld')).toBe('Scars');
      expect(cleanTitle('ColdWorld : Scars', 'Scars.mp3', 'ColdWorld')).toBe('Scars');
      expect(cleanTitle('ColdWorld - 01. Scars', 'Scars.mp3', 'ColdWorld')).toBe('Scars');
    });

    it('preserves genuine song titles that start with numbers', () => {
      expect(cleanTitle('15 traxxx', '06. 15 traxxx.mp3')).toBe('15 traxxx');
      expect(cleanTitle('2 MILLION TONS (OF SHIT)', 'track.mp3')).toBe('2 MILLION TONS (OF SHIT)');
      expect(cleanTitle('99 Problems', 'track.mp3')).toBe('99 Problems');
      expect(cleanTitle('4 Weeks Decomposed', 'track.mp3')).toBe('4 Weeks Decomposed');
      expect(cleanTitle('27 Inch Dick', 'track.mp3')).toBe('27 Inch Dick');
      expect(cleanTitle('500 000 000 000 Tracks', 'track.mp3')).toBe('500 000 000 000 Tracks');
    });

    it('strips trailing audio extensions', () => {
      expect(cleanTitle('Track.wav.mp3', 'Track.wav.mp3')).toBe('Track');
      expect(cleanTitle('Track.flac', 'Track.flac')).toBe('Track');
      expect(cleanTitle('Track.wv', 'Track.wv')).toBe('Track');
      expect(cleanTitle('Track.ape', 'Track.ape')).toBe('Track');
      expect(cleanTitle('Track.dsf', 'Track.dsf')).toBe('Track');
      expect(cleanTitle('Track.dff', 'Track.dff')).toBe('Track');
      expect(cleanTitle('Track.mka', 'Track.mka')).toBe('Track');
    });
  });

  describe('parseReplayGain', () => {
    it('parses numeric and object ReplayGain tags', () => {
      expect(
        parseReplayGain({
          replaygain_track_gain: { dB: -7.25 },
          replaygain_album_gain: { dB: -6.5 },
          replaygain_track_peak: { ratio: 0.987 },
        })
      ).toEqual({ trackGain: -7.25, albumGain: -6.5, trackPeak: 0.987 });

      expect(parseReplayGain({ replaygain_track_gain: 3.5, replaygain_track_peak: 1.2 })).toEqual({
        trackGain: 3.5,
        trackPeak: 1.2,
      });
    });

    it('parses string ReplayGain values with units', () => {
      expect(
        parseReplayGain({
          replaygain_track_gain: '+2.31 dB',
          replaygain_album_gain: '-4.80 dB',
          replaygain_track_peak: '0.999877',
        })
      ).toEqual({ trackGain: 2.31, albumGain: -4.8, trackPeak: 0.999877 });
    });

    it('returns an empty object when tags are missing or invalid', () => {
      expect(parseReplayGain({})).toEqual({});
      expect(parseReplayGain({ replaygain_track_gain: 'n/a', replaygain_track_peak: 'loud' })).toEqual({});
    });
  });

  describe('parseVinylOrTrackNumber', () => {
    it('parses vinyl side notations to correct track and disc numbers', () => {
      expect(parseVinylOrTrackNumber('A1. Title.mp3')).toEqual({ trackNumber: 1, discNumber: 1 });
      expect(parseVinylOrTrackNumber('A2. Title.mp3')).toEqual({ trackNumber: 2, discNumber: 1 });
      expect(parseVinylOrTrackNumber('B1. Title.mp3')).toEqual({ trackNumber: 1, discNumber: 2 });
      expect(parseVinylOrTrackNumber('C2. Title.mp3')).toEqual({ trackNumber: 2, discNumber: 3 });
      expect(parseVinylOrTrackNumber('D1. Title.mp3')).toEqual({ trackNumber: 1, discNumber: 4 });
    });

    it('parses multi-disc formats like 1-01 and CD2-04', () => {
      expect(parseVinylOrTrackNumber('1-01. Title.mp3')).toEqual({ trackNumber: 1, discNumber: 1 });
      expect(parseVinylOrTrackNumber('2-05. Title.mp3')).toEqual({ trackNumber: 5, discNumber: 2 });
      expect(parseVinylOrTrackNumber('CD1-03 Title.mp3')).toEqual({ trackNumber: 3, discNumber: 1 });
    });

    it('parses standard leading track numbers', () => {
      expect(parseVinylOrTrackNumber('01. Title.mp3')).toEqual({ trackNumber: 1 });
      expect(parseVinylOrTrackNumber('12 - Title.mp3')).toEqual({ trackNumber: 12 });
    });
  });
});
