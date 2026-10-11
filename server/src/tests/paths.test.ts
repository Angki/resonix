import { describe, it, expect } from 'vitest';
import { normalizePath, isSubdirectoryOf, isSupportedAudio } from '../library/paths.js';

describe('Path and Security Validation', () => {
  it('normalizes Windows backslashes and drive letters', () => {
    const p1 = normalizePath('d:\\Music\\RAW BLACK METAL\\Band\\track.mp3');
    const p2 = normalizePath('D:/Music/RAW BLACK METAL/Band/track.mp3');
    expect(p1.toLowerCase()).toBe(p2.toLowerCase());
    expect(p1.startsWith('D:/')).toBe(true);
  });

  it('correctly determines valid subdirectory relationship', () => {
    const parent = 'D:/Music/GORE';
    const child = 'D:/Music/GORE/Band/Album/01.mp3';
    expect(isSubdirectoryOf(parent, child)).toBe(true);
  });

  it('rejects path traversal attempts outside parent directory', () => {
    const parent = 'D:/Music/GORE';
    const traversal = 'D:/Music/GORE/../../Windows/System32/cmd.exe';
    expect(isSubdirectoryOf(parent, traversal)).toBe(false);

    const sisterDir = 'D:/Music/GORE_FAKE/track.mp3';
    expect(isSubdirectoryOf(parent, sisterDir)).toBe(false);
  });

  it('validates supported audio file extensions', () => {
    expect(isSupportedAudio('track.mp3')).toBe(true);
    expect(isSupportedAudio('song.flac')).toBe(true);
    expect(isSupportedAudio('audio.m4a')).toBe(true);
    expect(isSupportedAudio('sound.wav')).toBe(true);
    expect(isSupportedAudio('track.opus')).toBe(true);
    expect(isSupportedAudio('malicious.exe')).toBe(false);
    expect(isSupportedAudio('script.js')).toBe(false);
    expect(isSupportedAudio('cover.jpg')).toBe(false);
  });
});
