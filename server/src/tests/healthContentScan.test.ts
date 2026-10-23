import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeContentSignature } from '../health/contentScan.js';

const HEAD_BYTES = 64 * 1024;

function makeBuffer(tail?: Buffer): Buffer {
  const buffer = Buffer.alloc(HEAD_BYTES * 3, 0x42);
  if (tail) tail.copy(buffer, buffer.length - tail.length);
  return buffer;
}

describe('content duplicate signatures', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'resonix-content-scan-'));
  });

  afterAll(async () => {
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('is deterministic for the same file', async () => {
    const file = path.join(dir, 'same.mp3');
    const buffer = makeBuffer();
    await fs.promises.writeFile(file, buffer);

    const first = await computeContentSignature(file, buffer.length);
    const second = await computeContentSignature(file, buffer.length);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{40}$/);
  });

  it('distinguishes files with identical size and head but different tails', async () => {
    const firstFile = path.join(dir, 'first.mp3');
    const secondFile = path.join(dir, 'second.mp3');
    const firstBuffer = makeBuffer(Buffer.from('AAAAAAAA'));
    const secondBuffer = makeBuffer(Buffer.from('BBBBBBBB'));
    await fs.promises.writeFile(firstFile, firstBuffer);
    await fs.promises.writeFile(secondFile, secondBuffer);

    const first = await computeContentSignature(firstFile, firstBuffer.length);
    const second = await computeContentSignature(secondFile, secondBuffer.length);
    expect(first).not.toBe(second);
  });

  it('handles files smaller than the head window', async () => {
    const file = path.join(dir, 'tiny.mp3');
    const buffer = Buffer.from('small but valid test payload');
    await fs.promises.writeFile(file, buffer);

    const signature = await computeContentSignature(file, buffer.length);
    expect(signature).toMatch(/^[0-9a-f]{40}$/);
  });
});
