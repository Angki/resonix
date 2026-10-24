import fs from 'fs';
import path from 'path';
import pLimit from 'p-limit';
import { prisma } from '../db.js';
import { normalizePath, isSupportedAudio } from './paths.js';
import { parseAudioMetadata, ExtractedMetadata } from './metadata.js';
import { findFolderArtwork, findFolderArtworkInDir, getOrCreateArtworkRecord } from './artwork.js';
import { parseFolderLayout, buildAlbumFolderKey, FolderLayout } from './folderLayout.js';
import { healthEvents } from '../health/events.js';

export interface ScanStatus {
  isRunning: boolean;
  isCancelled: boolean;
  startedAt?: Date;
  finishedAt?: Date;
  currentRoot?: string;
  currentFolder?: string;
  totalFilesFound: number;
  tracksProcessed: number;
  tracksAdded: number;
  tracksUpdated: number;
  errorsCount: number;
  errorMessages: string[];
}

type ParsedItem =
  | { status: 'unchanged'; id: string; filePath: string; normPath: string }
  | { status: 'error'; filePath: string; error: string }
  | {
      status: 'needs_write';
      filePath: string;
      normPath: string;
      rel: string;
      layout: FolderLayout;
      stat: fs.Stats;
      mtimeMs: bigint;
      fileSize: bigint;
      meta: ExtractedMetadata;
      folderArt: string | null;
      existing?: { id: string; fullPath: string; mtimeMs: bigint; fileSize: bigint };
    };

let activeScan: ScanStatus = {
  isRunning: false,
  isCancelled: false,
  totalFilesFound: 0,
  tracksProcessed: 0,
  tracksAdded: 0,
  tracksUpdated: 0,
  errorsCount: 0,
  errorMessages: [],
};

let cancelRequested = false;

export function getScanStatus(): ScanStatus {
  return { ...activeScan };
}

export function requestScanCancellation(): boolean {
  if (!activeScan.isRunning) return false;
  cancelRequested = true;
  activeScan.isCancelled = true;
  return true;
}

export async function runLibraryScan(specificRootId?: string): Promise<ScanStatus> {
  if (activeScan.isRunning) {
    return activeScan;
  }

  cancelRequested = false;
  activeScan = {
    isRunning: true,
    isCancelled: false,
    startedAt: new Date(),
    totalFilesFound: 0,
    tracksProcessed: 0,
    tracksAdded: 0,
    tracksUpdated: 0,
    errorsCount: 0,
    errorMessages: [],
  };

  (async () => {
    try {
      const roots = await prisma.libraryRoot.findMany({
        where: {
          isEnabled: true,
          ...(specificRootId ? { id: specificRootId } : {}),
        },
      });

      const parseLimit = pLimit(6);

      for (const root of roots) {
        if (cancelRequested) break;
        activeScan.currentRoot = root.name;

        if (!fs.existsSync(root.path)) {
          activeScan.errorsCount++;
          activeScan.errorMessages.push(`Root directory not found: ${root.path}`);
          continue;
        }

        // 1. Recursive file collection
        const fileList: string[] = [];
        async function walk(dir: string): Promise<void> {
          if (cancelRequested) return;
          try {
            activeScan.currentFolder = dir;
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (cancelRequested) return;
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                await walk(full);
              } else if (entry.isFile() && isSupportedAudio(entry.name)) {
                fileList.push(full);
              }
            }
          } catch (e: any) {
            activeScan.errorsCount++;
            activeScan.errorMessages.push(`Error reading dir ${dir}: ${e.message}`);
          }
        }

        await walk(root.path);
        activeScan.totalFilesFound += fileList.length;

        // 2. Fetch existing tracks for this root
        const existingTracks = await prisma.track.findMany({
          where: { rootId: root.id },
          select: { id: true, fullPath: true, mtimeMs: true, fileSize: true },
        });

        const existingMap = new Map<string, typeof existingTracks[0]>();
        for (const t of existingTracks) {
          existingMap.set(normalizePath(t.fullPath).toLowerCase(), t);
        }

        const seenPaths = new Set<string>();

        // 3. Process in chunks: extract metadata in parallel, write to DB sequentially
        const BATCH_SIZE = 25;
        for (let i = 0; i < fileList.length; i += BATCH_SIZE) {
          if (cancelRequested) break;
          const chunk = fileList.slice(i, i + BATCH_SIZE);
          if (chunk.length > 0) {
            activeScan.currentFolder = path.dirname(chunk[0]);
          }

          const parsedChunk: ParsedItem[] = await Promise.all(
            chunk.map(filePath =>
              parseLimit(async (): Promise<ParsedItem> => {
                const normPath = normalizePath(filePath);
                const lowerNorm = normPath.toLowerCase();
                seenPaths.add(lowerNorm);

                try {
                  const stat = await fs.promises.stat(filePath);
                  const mtimeMs = BigInt(Math.floor(stat.mtimeMs));
                  const fileSize = BigInt(stat.size);
                  const existing = existingMap.get(lowerNorm);

                  // Fast incremental skip
                  if (existing && existing.mtimeMs === mtimeMs && existing.fileSize === fileSize) {
                    return { status: 'unchanged', id: existing.id, filePath, normPath };
                  }

                  const rel = path.relative(root.path, filePath).replace(/\\/g, '/');
                  const layout = parseFolderLayout(rel);
                  const meta = await parseAudioMetadata(filePath, layout);

                  let folderArt: string | null = null;
                  if (!meta.picture) {
                    folderArt = await findFolderArtwork(filePath);
                    if (!folderArt && layout.discNumber !== null) {
                      const albumDir = path.dirname(path.dirname(filePath));
                      folderArt = await findFolderArtworkInDir(albumDir);
                    }
                  }

                  return {
                    status: 'needs_write',
                    filePath,
                    normPath,
                    rel,
                    layout,
                    stat,
                    mtimeMs,
                    fileSize,
                    meta,
                    folderArt,
                    existing,
                  };
                } catch (e: any) {
                  return { status: 'error', filePath, error: e.message };
                }
              })
            )
          );

          // Sequential DB writes per chunk (safe on SQLite)
          for (const item of parsedChunk) {
            if (cancelRequested) break;

            if (item.status === 'unchanged') {
              activeScan.tracksProcessed++;
              continue;
            }

            if (item.status === 'error') {
              activeScan.errorsCount++;
              if (activeScan.errorMessages.length < 50) {
                activeScan.errorMessages.push(`Failed ${item.filePath}: ${item.error}`);
              }
              continue;
            }

            if (item.status === 'needs_write') {
              try {
                const { normPath, mtimeMs, fileSize, meta, folderArt, existing, filePath, rel, layout } = item;
                const filename = path.basename(filePath);
                const ext = path.extname(filePath).toLowerCase();

                // Artwork handling
                let artworkId: string | undefined = undefined;
                if (meta.picture) {
                  artworkId = await getOrCreateArtworkRecord(
                    meta.picture.data,
                    'embedded',
                    meta.picture.format
                  );
                } else if (folderArt) {
                  try {
                    const artBuf = await fs.promises.readFile(folderArt);
                    artworkId = await getOrCreateArtworkRecord(
                      artBuf,
                      'folder',
                      'image/jpeg',
                      folderArt
                    );
                  } catch {
                    // ignore
                  }
                }

                // Artist linking
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

                // Album linking - robust lookup to avoid unique constraint collisions
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
                    const existingByTitle = await prisma.album.findFirst({
                      where: {
                        title: meta.albumTitle,
                        ...(artistId ? { artistId } : {}),
                      },
                    });
                    if (existingByTitle) {
                      albumId = existingByTitle.id;
                      await prisma.album.update({
                        where: { id: albumId },
                        data: {
                          folderKey,
                          ...(artworkId && !existingByTitle.artworkId ? { artworkId } : {}),
                        },
                      }).catch(() => {});
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
                        const anyMatch = await prisma.album.findFirst({ where: { title: meta.albumTitle } });
                        if (anyMatch) albumId = anyMatch.id;
                      }
                    }
                  }
                } else if (meta.albumTitle) {
                  const existing = await prisma.album.findFirst({
                    where: {
                      title: meta.albumTitle,
                      ...(artistId ? { artistId } : {}),
                    },
                  });
                  if (existing) {
                    albumId = existing.id;
                    if (artworkId && !existing.artworkId) {
                      await prisma.album.update({ where: { id: albumId }, data: { artworkId } }).catch(() => {});
                    }
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
                      const anyMatch = await prisma.album.findFirst({ where: { title: meta.albumTitle } });
                      if (anyMatch) albumId = anyMatch.id;
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
                    replayGainTrackGain: meta.replayGainTrackGain ?? null,
                    replayGainAlbumGain: meta.replayGainAlbumGain ?? null,
                    replayGainTrackPeak: meta.replayGainTrackPeak ?? null,
                    isUnavailable: false,
                    artistId,
                    artistName: meta.artistName,
                    albumId,
                    albumTitle: meta.albumTitle,
                    albumArtist: meta.albumArtist,
                    folderArtist: layout.artistFolder || null,
                    folderAlbum: layout.albumFolder || null,
                    folderPath: layout.folderPath || null,
                    artworkId,
                  },
                  create: {
                    rootId: root.id,
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
                    replayGainTrackGain: meta.replayGainTrackGain ?? null,
                    replayGainAlbumGain: meta.replayGainAlbumGain ?? null,
                    replayGainTrackPeak: meta.replayGainTrackPeak ?? null,
                    isUnavailable: false,
                    artistId,
                    artistName: meta.artistName,
                    albumId,
                    albumTitle: meta.albumTitle,
                    albumArtist: meta.albumArtist,
                    folderArtist: layout.artistFolder || null,
                    folderAlbum: layout.albumFolder || null,
                    folderPath: layout.folderPath || null,
                    artworkId,
                  },
                });

                if (existing) activeScan.tracksUpdated++;
                else activeScan.tracksAdded++;
                activeScan.tracksProcessed++;
              } catch (e: any) {
                activeScan.errorsCount++;
                if (activeScan.errorMessages.length < 50) {
                  activeScan.errorMessages.push(`DB Write failed for ${item.filePath}: ${e.message}`);
                }
              }
            }
          }

          if (i % (BATCH_SIZE * 4) === 0) {
            const runningCount = await prisma.track.count({
              where: { rootId: root.id, isUnavailable: false },
            });
            await prisma.libraryRoot.update({
              where: { id: root.id },
              data: { trackCount: runningCount },
            }).catch(() => {});
          }
        }

        // 4. Mark removed tracks as unavailable ONLY if scan completed without cancellation
        if (!cancelRequested && activeScan.errorsCount < 50) {
          for (const [normLower, t] of existingMap) {
            if (!seenPaths.has(normLower)) {
              await prisma.track.update({
                where: { id: t.id },
                data: { isUnavailable: true },
              });
            }
          }
        } else {
          console.warn('[Scanner] Scan was cancelled or had errors; skipping unavailability marking to protect library.');
        }

        // Update root count
        const currentCount = await prisma.track.count({
          where: { rootId: root.id, isUnavailable: false },
        });
        await prisma.libraryRoot.update({
          where: { id: root.id },
          data: {
            trackCount: currentCount,
            lastScannedAt: new Date(),
          },
        });
      }
    } catch (e: any) {
      activeScan.errorsCount++;
      activeScan.errorMessages.push(`Global scan error: ${e.message}`);
    } finally {
      activeScan.isRunning = false;
      activeScan.finishedAt = new Date();
      healthEvents.emit('scan-completed', {
        startedAt: activeScan.startedAt,
        finishedAt: activeScan.finishedAt,
        cancelled: activeScan.isCancelled,
        errorsCount: activeScan.errorsCount,
        tracksAdded: activeScan.tracksAdded,
        tracksUpdated: activeScan.tracksUpdated,
      });
    }
  })();

  return activeScan;
}
