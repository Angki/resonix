import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { config } from '../config.js';
import { prisma } from '../db.js';

const ALBUM_ART_CANDIDATES = [
  'cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp',
  'folder.jpg', 'folder.jpeg', 'folder.png',
  'front.jpg', 'front.jpeg', 'front.png',
  'album.jpg', 'album.jpeg', 'album.png',
  'artwork.jpg', 'artwork.jpeg', 'artwork.png',
];

async function exists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Finds cover/folder/front images inside a directory. Read-only. */
export async function findFolderArtworkInDir(dir: string): Promise<string | null> {
  try {
    const files = await fs.promises.readdir(dir);
    const lowerMap = new Map<string, string>();
    for (const f of files) {
      lowerMap.set(f.toLowerCase(), f);
    }

    for (const candidate of ALBUM_ART_CANDIDATES) {
      if (lowerMap.has(candidate)) {
        return path.join(dir, lowerMap.get(candidate)!);
      }
    }

    const imageFiles = files.filter(f => /\.(jpe?g|png|webp)$/i.test(f));
    if (imageFiles.length === 1) {
      return path.join(dir, imageFiles[0]);
    }
  } catch {
    return null;
  }
  return null;
}

export async function findFolderArtwork(trackFilePath: string): Promise<string | null> {
  return findFolderArtworkInDir(path.dirname(trackFilePath));
}

export async function getOrCreateArtworkRecord(
  buffer: Buffer,
  source: 'embedded' | 'folder' | 'musicbee' | 'custom',
  mimeType: string = 'image/jpeg',
  originalPath?: string
): Promise<string> {
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');

  const existing = await prisma.artwork.findUnique({ where: { hash } });
  if (existing) {
    return existing.id;
  }

  // Save master image to cache
  const masterPath = path.join(config.artworkCacheDir, `${hash}_master.bin`);
  if (!(await exists(masterPath))) {
    await fs.promises.writeFile(masterPath, buffer);
  }

  try {
    const created = await prisma.artwork.create({
      data: {
        hash,
        source,
        mimeType,
        filePath: originalPath || masterPath,
      },
    });
    return created.id;
  } catch {
    // If concurrent race condition inserted it, fetch and return
    const raceRecord = await prisma.artwork.findUnique({ where: { hash } });
    if (raceRecord) return raceRecord.id;
    throw new Error(`Failed to create or retrieve artwork with hash ${hash}`);
  }
}

export async function getArtworkThumbnail(
  artworkId: string,
  size: 96 | 256 | 512 = 256
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const artwork = await prisma.artwork.findUnique({ where: { id: artworkId } });
  if (!artwork) return null;

  const thumbFilename = `${artwork.hash}_${size}.webp`;
  const thumbPath = path.join(config.artworkCacheDir, thumbFilename);

  if (await exists(thumbPath)) {
    return {
      buffer: await fs.promises.readFile(thumbPath),
      contentType: 'image/webp',
    };
  }

  // Generate thumbnail from master file or original path
  const masterPath = path.join(config.artworkCacheDir, `${artwork.hash}_master.bin`);
  let sourceBuffer: Buffer | null = null;

  if (await exists(masterPath)) {
    sourceBuffer = await fs.promises.readFile(masterPath);
  } else if (artwork.filePath && (await exists(artwork.filePath))) {
    sourceBuffer = await fs.promises.readFile(artwork.filePath);
  }

  if (!sourceBuffer) return null;

  try {
    const resized = await sharp(sourceBuffer)
      .resize(size, size, { fit: 'cover', position: 'center' })
      .webp({ quality: 85 })
      .toBuffer();

    await fs.promises.writeFile(thumbPath, resized);

    return {
      buffer: resized,
      contentType: 'image/webp',
    };
  } catch {
    return null;
  }
}
