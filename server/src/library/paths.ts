import path from 'path';
import fs from 'fs';
import { prisma } from '../db.js';

export const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.flac',
  '.m4a',
  '.aac',
  '.alac',
  '.ogg',
  '.opus',
  '.wav',
  '.aiff',
  '.wma',
]);

export function normalizePath(p: string): string {
  // Normalize Windows paths, lowercase drive letters, forward slashes for internal consistency
  let resolved = path.resolve(p).replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(resolved)) {
    resolved = resolved[0].toUpperCase() + resolved.slice(1);
  }
  return resolved;
}

export async function getAllowedRoots(): Promise<string[]> {
  const roots = await prisma.libraryRoot.findMany({
    where: { isEnabled: true },
    select: { path: true },
  });
  return roots.map(r => normalizePath(r.path));
}

export function isSubdirectoryOf(parent: string, child: string): boolean {
  const normParent = normalizePath(parent).toLowerCase();
  const normChild = normalizePath(child).toLowerCase();

  if (normParent === normChild) return true;
  const parentWithSlash = normParent.endsWith('/') ? normParent : normParent + '/';
  return normChild.startsWith(parentWithSlash);
}

export async function isPathAllowed(filePath: string): Promise<boolean> {
  const normPath = normalizePath(filePath);
  const roots = await getAllowedRoots();

  for (const root of roots) {
    if (isSubdirectoryOf(root, normPath)) {
      // Check realpath if file exists to prevent symlink bypass
      try {
        if (fs.existsSync(filePath)) {
          const real = normalizePath(fs.realpathSync(filePath));
          if (!isSubdirectoryOf(root, real)) {
            return false;
          }
        }
      } catch {
        return false;
      }
      return true;
    }
  }
  return false;
}

export function isSupportedAudio(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.has(ext);
}
