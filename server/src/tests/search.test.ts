import { describe, it, expect } from 'vitest';
import { normalizeField, buildTrackSearch, buildAlbumSearch } from '../routes/tracks.js';

describe('Search Functionality', () => {
  describe('normalizeField', () => {
    it('normalizes valid search fields case-insensitively', () => {
      expect(normalizeField('album')).toBe('album');
      expect(normalizeField('ALBUM')).toBe('album');
      expect(normalizeField('Artist')).toBe('artist');
      expect(normalizeField('TITLE')).toBe('title');
    });

    it('falls back to "all" for unknown or missing fields', () => {
      expect(normalizeField(undefined)).toBe('all');
      expect(normalizeField('')).toBe('all');
      expect(normalizeField('random')).toBe('all');
      expect(normalizeField('genre')).toBe('all');
    });
  });

  describe('buildTrackSearch', () => {
    it('returns empty array for empty search query', () => {
      expect(buildTrackSearch('', 'all')).toEqual([]);
      expect(buildTrackSearch(undefined, 'all')).toEqual([]);
    });

    it('builds album-only search conditions', () => {
      const conditions = buildTrackSearch('Darkthrone', 'album');
      expect(conditions).toHaveLength(1);
      expect(conditions[0].OR).toEqual([
        { albumTitle: { contains: 'Darkthrone' } },
        { folderAlbum: { contains: 'Darkthrone' } },
      ]);
    });

    it('builds artist-only search conditions', () => {
      const conditions = buildTrackSearch('Burzum', 'artist');
      expect(conditions).toHaveLength(1);
      expect(conditions[0].OR).toEqual([
        { artistName: { contains: 'Burzum' } },
        { albumArtist: { contains: 'Burzum' } },
        { folderArtist: { contains: 'Burzum' } },
      ]);
    });

    it('builds title-only search conditions', () => {
      const conditions = buildTrackSearch('Transilvanian', 'title');
      expect(conditions).toHaveLength(1);
      expect(conditions[0].OR).toEqual([
        { title: { contains: 'Transilvanian' } },
        { filename: { contains: 'Transilvanian' } },
      ]);
    });

    it('builds all-field search conditions', () => {
      const conditions = buildTrackSearch('Hunger', 'all');
      expect(conditions).toHaveLength(1);
      expect(conditions[0].OR).toEqual([
        { title: { contains: 'Hunger' } },
        { artistName: { contains: 'Hunger' } },
        { albumArtist: { contains: 'Hunger' } },
        { albumTitle: { contains: 'Hunger' } },
        { folderAlbum: { contains: 'Hunger' } },
        { folderArtist: { contains: 'Hunger' } },
        { filename: { contains: 'Hunger' } },
      ]);
    });

    it('tokenizes multi-word queries into AND conditions', () => {
      const conditions = buildTrackSearch('Black Metal Krieg', 'title');
      expect(conditions).toHaveLength(3);
      expect(conditions[0].OR[0].title.contains).toBe('Black');
      expect(conditions[1].OR[0].title.contains).toBe('Metal');
      expect(conditions[2].OR[0].title.contains).toBe('Krieg');
    });
  });

  describe('buildAlbumSearch', () => {
    it('builds album title search query', () => {
      const conditions = buildAlbumSearch('A Blaze', 'album');
      expect(conditions).toHaveLength(2);
      expect(conditions[0].OR[0].title.contains).toBe('A');
    });

    it('builds album artist search query', () => {
      const conditions = buildAlbumSearch('Mayhem', 'artist');
      expect(conditions).toHaveLength(1);
      expect(conditions[0].OR[0].artist.name.contains).toBe('Mayhem');
    });

    it('builds album song title search query', () => {
      const conditions = buildAlbumSearch('Freezing', 'title');
      expect(conditions).toHaveLength(1);
      expect(conditions[0].tracks.some.isUnavailable).toBe(false);
    });

    it('builds combined search query across title, artist, and songs', () => {
      const conditions = buildAlbumSearch('Moon', 'all');
      expect(conditions).toHaveLength(1);
      expect(conditions[0].OR).toHaveLength(3);
    });
  });
});
