import { describe, it, expect } from 'vitest';
import { parseMusicBeePlaylistMbp, discoverMusicBeeCandidates } from '../musicbee/parser.js';

describe('MusicBee Integration', () => {
  it('discovers candidates in C:/Users/angki/Music without throwing', () => {
    const candidates = discoverMusicBeeCandidates('C:/Users/angki/Music');
    expect(Array.isArray(candidates)).toBe(true);
    // Should discover libraries like DEATH, GORE, etc.
    const libCandidate = candidates.find(c => c.category === 'library');
    expect(libCandidate).toBeDefined();
  });

  it('safely parses real MusicBee binary playlist ON.mbp', () => {
    const paths = parseMusicBeePlaylistMbp('C:/Users/angki/Music/GORE/Playlists/ON.mbp');
    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);
    // Verified from earlier inspection that it contains tracks from D:/Music/GORE
    expect(paths[0]).toContain('D:/Music/GORE');
  });
});
