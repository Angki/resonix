import fs from 'fs';
import path from 'path';
import { prisma } from '../db.js';
import { config } from '../config.js';

export interface LocalArtResult {
  photoPath?: string;
  logoPath?: string;
}

const PHOTO_FILENAMES = [
  'artist.jpg', 'artist.jpeg', 'artist.png', 'artist.webp',
  'band.jpg', 'band.jpeg', 'band.png', 'band.webp',
  'photo.jpg', 'photo.jpeg', 'photo.png',
  'folder.jpg', 'folder.jpeg', 'folder.png',
];

const LOGO_FILENAMES = [
  'logo.png', 'logo.jpg', 'logo.jpeg', 'logo.webp',
  'band_logo.png', 'band_logo.jpg', 'band_logo.webp',
  'bandlogo.png', 'bandlogo.jpg',
];

export async function findLocalArtistArt(artistId: string, artistName: string): Promise<LocalArtResult> {
  const result: LocalArtResult = {};

  // 1. Check MusicBee Artist Pictures cache directory
  if (config.MUSICBEE_DISCOVERY_PATH) {
    const mbArtistPics = path.join(config.MUSICBEE_DISCOVERY_PATH, 'Artist Pictures');
    if (fs.existsSync(mbArtistPics)) {
      for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
        const candidate = path.join(mbArtistPics, `${artistName}${ext}`);
        if (fs.existsSync(candidate)) {
          result.photoPath = candidate;
          break;
        }
      }
    }
  }

  // 2. Fetch sample tracks from this artist to locate artist directory on disk
  const sampleTracks = await prisma.track.findMany({
    where: { artistId, isUnavailable: false },
    take: 3,
    select: { fullPath: true, rootId: true },
  });

  for (const track of sampleTracks) {
    if (!track.fullPath) continue;

    const trackDir = path.dirname(track.fullPath); // e.g. D:/Music/GORE/Butcher ABC/[2017] North Of Hell
    const parentDir = path.dirname(trackDir);      // e.g. D:/Music/GORE/Butcher ABC

    const candidateDirs = [parentDir, trackDir];

    for (const dir of candidateDirs) {
      if (!fs.existsSync(dir)) continue;

      try {
        const files = fs.readdirSync(dir);
        const lowerFileMap = new Map<string, string>();
        for (const f of files) {
          lowerFileMap.set(f.toLowerCase(), f);
        }

        if (!result.photoPath) {
          for (const photoName of PHOTO_FILENAMES) {
            const actualName = lowerFileMap.get(photoName);
            if (actualName) {
              result.photoPath = path.join(dir, actualName);
              break;
            }
          }
        }

        if (!result.logoPath) {
          for (const logoName of LOGO_FILENAMES) {
            const actualName = lowerFileMap.get(logoName);
            if (actualName) {
              result.logoPath = path.join(dir, actualName);
              break;
            }
          }
        }

        if (result.photoPath && result.logoPath) {
          return result;
        }
      } catch (err) {
        console.warn(`[LocalArtFinder] Error scanning directory ${dir}:`, err);
      }
    }
  }

  return result;
}
