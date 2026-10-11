import { describe, it, expect } from 'vitest';
import { parseFolderLayout, parseAlbumFolderName, parseDiscFolderName, buildAlbumFolderKey } from '../library/folderLayout.js';

describe('parseAlbumFolderName', () => {
  it('parses leading bracket year', () => {
    expect(parseAlbumFolderName('[2022] Ruins of the Moonlight Temple')).toEqual({
      title: 'Ruins of the Moonlight Temple',
      year: 2022,
    });
  });
  it('parses parenthesis and dash forms', () => {
    expect(parseAlbumFolderName('(1994) Transilvanian Hunger')).toEqual({ title: 'Transilvanian Hunger', year: 1994 });
    expect(parseAlbumFolderName('1994 - Transilvanian Hunger')).toEqual({ title: 'Transilvanian Hunger', year: 1994 });
    expect(parseAlbumFolderName('Transilvanian Hunger (1994)')).toEqual({ title: 'Transilvanian Hunger', year: 1994 });
    expect(parseAlbumFolderName('Transilvanian Hunger [1994]')).toEqual({ title: 'Transilvanian Hunger', year: 1994 });
  });
  it('keeps titles that merely contain numbers', () => {
    expect(parseAlbumFolderName('Mountain Rehearsal 10 11 22')).toEqual({ title: 'Mountain Rehearsal 10 11 22', year: null });
    expect(parseAlbumFolderName('[0666] Demo')).toEqual({ title: '[0666] Demo', year: null });
  });
});

describe('parseDiscFolderName', () => {
  it('recognises disc folders', () => {
    expect(parseDiscFolderName('CD1')).toBe(1);
    expect(parseDiscFolderName('Disc 2')).toBe(2);
    expect(parseDiscFolderName('disk_03')).toBe(3);
    expect(parseDiscFolderName('Bonus')).toBeNull();
  });
});

describe('parseFolderLayout', () => {
  it('handles the standard artist/album layout', () => {
    const l = parseFolderLayout('Nansarunai\\[2022] Ruins of the Moonlight Temple\\01. Intro.flac');
    expect(l).toEqual({
      artistFolder: 'Nansarunai',
      albumFolder: '[2022] Ruins of the Moonlight Temple',
      albumTitle: 'Ruins of the Moonlight Temple',
      year: 2022,
      discNumber: null,
      folderPath: 'Nansarunai/[2022] Ruins of the Moonlight Temple',
    });
  });
  it('detects disc subfolders', () => {
    const l = parseFolderLayout('Artist/[2020] Box/CD2/01. a.mp3');
    expect(l.albumFolder).toBe('[2020] Box');
    expect(l.discNumber).toBe(2);
    expect(l.folderPath).toBe('Artist/[2020] Box/CD2');
  });
  it('handles loose files', () => {
    expect(parseFolderLayout('Artist/song.mp3').albumFolder).toBeNull();
    expect(parseFolderLayout('song.mp3').artistFolder).toBeNull();
  });
  it('builds case-insensitive album keys', () => {
    expect(buildAlbumFolderKey('r1', 'Nansarunai', '[2022] Ruins')).toBe(buildAlbumFolderKey('r1', 'NANSARUNAI', '[2022] ruins'));
  });
});
