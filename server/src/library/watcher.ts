import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import { prisma } from '../db.js';
import { normalizePath, isSupportedAudio } from './paths.js';
import { parseAudioMetadata } from './metadata.js';
import { findFolderArtworkInDir, getOrCreateArtworkRecord } from './artwork.js';
import { parseFolderLayout, buildAlbumFolderKey } from './folderLayout.js';

let watcher: any = null;
const pendingFiles = new Set<string>();
let debounceTimer: NodeJS.Timeout | null = null;

async function processPendingFiles() {
  if (pendingFiles.size === 0) return;
  const filesToProcess = Array.from(pendingFiles);
  pendingFiles.clear();

  console.log(`[Auto-Watcher] Processing ${filesToProcess.length} changed audio file(s)...`);

  const roots = await prisma.libraryRoot.findMany({ where: { isEnabled: true } });
  const rootCache = roots.map(r => ({
    id: r.id,
    normPath: normalizePath(r.path),
    rawPath: r.path,
  }));

  const affectedRootIds = new Set<string>();

  for (const filePath of filesToProcess) {
    try {
      const normPath = normalizePath(filePath);
      const root = rootCache.find(r => normPath.startsWith(r.normPath));
      if (!root) continue;

      affectedRootIds.add(root.id);

      // Check if file still exists (could be deleted)
      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(filePath);
      } catch {
        // File was deleted
        await prisma.track.updateMany({
          where: { fullPath: normPath },
          data: { isUnavailable: true },
        });
        console.log(`[Auto-Watcher] Marked removed: ${path.basename(filePath)}`);
        continue;
      }

      if (!stat.isFile()) continue;

      const rel = path.relative(root.rawPath, filePath);
      const filename = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const fileSize = BigInt(stat.size);
      const mtimeMs = BigInt(Math.floor(stat.mtimeMs));

      const layout = parseFolderLayout(rel);
      const meta = await parseAudioMetadata(filePath, layout);

      // Folder artwork
      const folderArtPath = await findFolderArtworkInDir(path.dirname(filePath));
      let artworkId: string | undefined = undefined;

      if (meta.picture) {
        artworkId = await getOrCreateArtworkRecord(
          meta.picture.data,
          'embedded',
          meta.picture.format,
          filePath
        );
      } else if (folderArtPath) {
        try {
          const buf = await fs.promises.readFile(folderArtPath);
          artworkId = await getOrCreateArtworkRecord(buf, 'folder', 'image/jpeg', folderArtPath);
        } catch {
          // ignore
        }
      }

      // Artist upsert
      let artistId: string | undefined = undefined;
      if (meta.artistName) {
        const artist = await prisma.artist.upsert({
          where: { name: meta.artistName },
          update: {},
          create: {
            name: meta.artistName,
            normalizedName: meta.artistName.toLowerCase(),
          },
        });
        artistId = artist.id;
      }

      // Album linking
      let albumId: string | undefined = undefined;
      if (layout.artistFolder && layout.albumFolder) {
        const folderKey = buildAlbumFolderKey(root.id, layout.artistFolder, layout.albumFolder);
        const existingByKey = await prisma.album.findUnique({ where: { folderKey } });
        if (existingByKey) {
          albumId = existingByKey.id;
          if (artworkId && !existingByKey.artworkId) {
            await prisma.album.update({ where: { id: albumId }, data: { artworkId } }).catch(() => {});
          }
        } else {
          try {
            const created = await prisma.album.create({
              data: {
                title: meta.albumTitle,
                normalizedTitle: meta.albumTitle.toLowerCase(),
                artistId: artistId || null,
                year: meta.year || layout.year || null,
                artworkId: artworkId || null,
                folderKey,
              },
            });
            albumId = created.id;
          } catch {
            const match = await prisma.album.findFirst({ where: { title: meta.albumTitle } });
            if (match) albumId = match.id;
          }
        }
      } else if (meta.albumTitle) {
        const match = await prisma.album.findFirst({
          where: { title: meta.albumTitle, ...(artistId ? { artistId } : {}) },
        });
        if (match) {
          albumId = match.id;
        } else {
          try {
            const created = await prisma.album.create({
              data: {
                title: meta.albumTitle,
                normalizedTitle: meta.albumTitle.toLowerCase(),
                artistId: artistId || null,
                year: meta.year || null,
                artworkId: artworkId || null,
              },
            });
            albumId = created.id;
          } catch {
            // ignore
          }
        }
      }

      // Track upsert
      await prisma.track.upsert({
        where: { fullPath: normPath },
        update: {
          relativePath: rel,
          filename,
          extension: ext,
          fileSize,
          mtimeMs,
          title: meta.title,
          trackNumber: meta.trackNumber,
          discNumber: meta.discNumber,
          duration: meta.duration,
          year: meta.year,
          genre: meta.genre,
          composer: meta.composer,
          comment: meta.comment,
          codec: meta.codec,
          bitrate: meta.bitrate,
          sampleRate: meta.sampleRate,
          bitDepth: meta.bitDepth,
          channels: meta.channels,
          isLossless: meta.isLossless,
          isUnavailable: false,
          artistId,
          artistName: meta.artistName,
          albumId,
          albumTitle: meta.albumTitle,
          albumArtist: meta.albumArtist || layout.artistFolder || null,
          folderArtist: layout.artistFolder || null,
          folderAlbum: layout.albumFolder || null,
          folderPath: layout.folderPath || null,
          artworkId,
        },
        create: {
          fullPath: normPath,
          relativePath: rel,
          filename,
          extension: ext,
          fileSize,
          mtimeMs,
          title: meta.title,
          trackNumber: meta.trackNumber,
          discNumber: meta.discNumber,
          duration: meta.duration,
          year: meta.year,
          genre: meta.genre,
          composer: meta.composer,
          comment: meta.comment,
          codec: meta.codec,
          bitrate: meta.bitrate,
          sampleRate: meta.sampleRate,
          bitDepth: meta.bitDepth,
          channels: meta.channels,
          isLossless: meta.isLossless,
          isUnavailable: false,
          rootId: root.id,
          artistId,
          artistName: meta.artistName,
          albumId,
          albumTitle: meta.albumTitle,
          albumArtist: meta.albumArtist || layout.artistFolder || null,
          folderArtist: layout.artistFolder || null,
          folderAlbum: layout.albumFolder || null,
          folderPath: layout.folderPath || null,
          artworkId,
        },
      });

      console.log(`[Auto-Watcher] Indexed: ${meta.artistName} - ${meta.title}`);
    } catch (err: any) {
      console.warn(`[Auto-Watcher] Failed indexing ${filePath}:`, err.message);
    }
  }

  // Update track counts for affected roots
  for (const rootId of affectedRootIds) {
    const count = await prisma.track.count({ where: { rootId, isUnavailable: false } });
    await prisma.libraryRoot.update({
      where: { id: rootId },
      data: { trackCount: count, lastScannedAt: new Date() },
    }).catch(() => {});
  }
}

export async function startLibraryWatcher() {
  if (watcher) {
    await watcher.close();
  }

  const roots = await prisma.libraryRoot.findMany({ where: { isEnabled: true } });
  const validPaths = roots.map(r => r.path).filter(p => fs.existsSync(p));

  if (validPaths.length === 0) {
    console.log('[Auto-Watcher] No active library roots found to watch.');
    return;
  }

  console.log(`[Auto-Watcher] Starting live folder watcher for ${validPaths.length} collection roots...`);

  watcher = chokidar.watch(validPaths, {
    ignored: /(^|[\/\\])\..|node_modules|\.tmp$|\.part$/i,
    persistent: true,
    ignoreInitial: true, // initial scan is done by scanner
    depth: 6,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 250,
    },
  });

  const queueChange = (filePath: string) => {
    if (isSupportedAudio(filePath)) {
      pendingFiles.add(filePath);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        processPendingFiles().catch(err => console.error('[Auto-Watcher] Error:', err));
      }, 4000);
    }
  };

  watcher.on('add', queueChange);
  watcher.on('change', queueChange);
  watcher.on('unlink', queueChange);
  watcher.on('error', (err: any) => console.warn('[Auto-Watcher] Watcher error:', err));
}

export async function stopLibraryWatcher() {
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
}
