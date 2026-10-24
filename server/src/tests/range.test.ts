import { describe, it, expect } from 'vitest';
import { parseByteRange } from '../streaming/range.js';

const SIZE = 1000;

describe('HTTP byte range parsing', () => {
  it('returns null when no Range header is present', () => {
    expect(parseByteRange(undefined, SIZE)).toBeNull();
  });

  it('parses a closed byte range', () => {
    expect(parseByteRange('bytes=0-499', SIZE)).toEqual({ start: 0, end: 499 });
    expect(parseByteRange('bytes=100-199', SIZE)).toEqual({ start: 100, end: 199 });
  });

  it('parses an open-ended range', () => {
    expect(parseByteRange('bytes=900-', SIZE)).toEqual({ start: 900, end: 999 });
  });

  it('parses a suffix range', () => {
    expect(parseByteRange('bytes=-200', SIZE)).toEqual({ start: 800, end: 999 });
  });

  it('clamps an end offset beyond the file size', () => {
    expect(parseByteRange('bytes=900-5000', SIZE)).toEqual({ start: 900, end: 999 });
  });

  it('marks out-of-bounds ranges as unsatisfiable', () => {
    expect(parseByteRange('bytes=1000-1200', SIZE)).toEqual({ unsatisfiable: true });
    expect(parseByteRange('bytes=500-400', SIZE)).toEqual({ unsatisfiable: true });
    expect(parseByteRange('bytes=-0', SIZE)).toEqual({ unsatisfiable: true });
  });

  it('ignores malformed ranges instead of crashing', () => {
    expect(parseByteRange('items=0-10', SIZE)).toBeNull();
    expect(parseByteRange('bytes=abc-def', SIZE)).toBeNull();
  });

  it('treats multi-range requests as the first range only', () => {
    expect(parseByteRange('bytes=0-99,200-299', SIZE)).toEqual({ start: 0, end: 99 });
  });
});
