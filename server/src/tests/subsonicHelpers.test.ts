import { describe, it, expect } from 'vitest';
import {
  buildStructuredLyrics,
  normalizePlayQueue,
  buildPlayQueuePayload,
  buildFolderChild,
  normalizeBookmarks,
} from '../routes/subsonicHelpers.js';

describe('Subsonic helper payloads', () => {
  it('converts synced lyrics into OpenSubsonic structured lines in milliseconds', () => {
    const result = buildStructuredLyrics({
      artist: 'Darkthrone',
      title: 'Transilvanian Hunger',
      lines: [
        { time: 1.5, text: 'Cold winds' },
        { time: 62.25, text: 'Soul' },
      ],
      plainLyrics: 'Cold winds\nSoul',
      hasSyncedLyrics: true,
    });

    expect(result.structuredLyrics).toHaveLength(1);
    expect(result.structuredLyrics[0].synced).toBe(true);
    expect(result.structuredLyrics[0].displayArtist).toBe('Darkthrone');
    expect(result.structuredLyrics[0].line).toEqual([
      { value: 'Cold winds', start: 1500 },
      { value: 'Soul', start: 62250 },
    ]);
  });

  it('splits plain lyrics into unsynced structured lines', () => {
    const result = buildStructuredLyrics({
      artist: 'A',
      title: 'B',
      lines: [],
      plainLyrics: 'first\nsecond\nthird',
      hasSyncedLyrics: false,
    });

    expect(result.structuredLyrics[0].synced).toBe(false);
    expect(result.structuredLyrics[0].line).toEqual([{ value: 'first' }, { value: 'second' }, { value: 'third' }]);
  });

  it('returns no structured lyrics when neither synced nor plain text exists', () => {
    const result = buildStructuredLyrics({
      lines: [],
      plainLyrics: '',
      hasSyncedLyrics: false,
    });
    expect(result.structuredLyrics).toEqual([]);
  });

  it('normalizes a saved play queue and drops unknown fields', () => {
    const queue = normalizePlayQueue(
      JSON.stringify({ ids: ['a', 'b', 'c'], currentId: 'b', position: 1200, changedBy: 'phone' })
    );

    expect(queue).toEqual({ ids: ['a', 'b', 'c'], currentId: 'b', position: 1200, changedBy: 'phone' });
  });

  it('repairs an invalid play queue instead of throwing', () => {
    expect(normalizePlayQueue(null)).toEqual({ ids: [], currentId: null, position: 0, changedBy: null });
    expect(normalizePlayQueue('{not-json')).toEqual({ ids: [], currentId: null, position: 0, changedBy: null });
    expect(normalizePlayQueue({ ids: ['a', 2, null], currentId: 'zzz', position: -5 })).toEqual({
      ids: ['a'],
      currentId: null,
      position: 0,
      changedBy: null,
    });
  });

  it('builds a playQueue response keeping only tracks still present', () => {
    const payload = buildPlayQueuePayload(
      { ids: ['a', 'gone', 'c'], currentId: 'c', position: 5000, changedBy: 'web' },
      [
        { id: 'a', title: 'A' },
        { id: 'c', title: 'C' },
      ]
    );

    expect(payload.playQueue.entry.map((s: any) => s.id)).toEqual(['a', 'c']);
    expect(payload.playQueue.current).toBe('c');
    expect(payload.playQueue.position).toBe(5000);
    expect(payload.playQueue.changedBy).toBe('web');
  });

  it('normalizes bookmarks and drops invalid entries', () => {
    expect(normalizeBookmarks('{bad-json')).toEqual([]);
    expect(
      normalizeBookmarks({
        a: { position: 1500, comment: 'resume here', created: '2026-01-01T00:00:00.000Z' },
        b: { position: -10 },
        c: null,
        d: { position: '5000' },
      })
    ).toEqual([
      { trackId: 'a', position: 1500, comment: 'resume here', created: '2026-01-01T00:00:00.000Z' },
      { trackId: 'd', position: 5000, comment: null, created: null },
    ]);
  });

  it('formats an album folder child', () => {
    const child = buildFolderChild(
      {
        kind: 'album',
        id: 'al1',
        parent: 'ar1',
        title: 'Transilvanian Hunger',
        artist: 'Darkthrone',
        year: 1994,
        coverArt: 'art1',
        songCount: 7,
        created: '1994-01-01T00:00:00.000Z',
      },
      null
    );

    expect(child).toMatchObject({
      id: 'al1',
      parent: 'ar1',
      isDir: true,
      title: 'Transilvanian Hunger',
      album: 'Transilvanian Hunger',
      artist: 'Darkthrone',
      year: 1994,
      coverArt: 'art1',
    });
  });
});
