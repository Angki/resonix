export type ByteRange = { start: number; end: number } | { unsatisfiable: true } | null;

/**
 * Parses a single HTTP Range header (RFC 7233). Multi-range requests fall back
 * to the first range, which is what audio players expect in practice.
 */
export function parseByteRange(header: string | undefined, fileSize: number): ByteRange {
  if (!header) return null;

  const match = /^bytes=\s*(\d*)\s*-\s*(\d*)/i.exec(header.trim());
  if (!match) return null;

  const [, startText, endText] = match;
  if (!startText && !endText) return null;

  if (!startText) {
    const suffixLength = parseInt(endText, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0 || fileSize <= 0) {
      return { unsatisfiable: true };
    }
    return { start: Math.max(0, fileSize - suffixLength), end: fileSize - 1 };
  }

  const start = parseInt(startText, 10);
  if (!Number.isFinite(start)) return null;

  let end = endText ? parseInt(endText, 10) : fileSize - 1;
  if (!Number.isFinite(end)) return null;
  if (end >= fileSize) end = fileSize - 1;

  if (start < 0 || start >= fileSize || start > end) {
    return { unsatisfiable: true };
  }

  return { start, end };
}
