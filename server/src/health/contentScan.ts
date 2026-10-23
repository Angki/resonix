import crypto from 'crypto';
import fs from 'fs';
import pLimit from 'p-limit';
import { prisma } from '../db.js';
import { formatHealthTrack } from './healthService.js';

const SCAN_PAGE_SIZE = 750;
const SIGNATURE_BYTES = 64 * 1024;
const MAX_GROUPS = 500;
const MAX_GROUP_TRACKS = 50;
const MAX_GROUPED_TRACKS = 5000;
const MAX_VERIFY_BYTES = 8 * 1024 * 1024 * 1024;

export type ContentScanTrack = ReturnType<typeof formatHealthTrack> & { rootName: string | null };

interface CandidateTrack {
  id: string;
  title: string;
  artistName: string;
  albumTitle: string;
  albumId: string | null;
  duration: number;
  fileSize: number;
  relativePath: string;
  rootName: string | null;
  fullPath: string;
}

interface RawDuplicateGroup {
  signature: string;
  matchType: 'exact' | 'signature';
  trackCount: number;
  truncated: boolean;
  totalBytes: number;
  tracks: CandidateTrack[];
}

export interface ContentDuplicateGroup {
  signature: string;
  matchType: 'exact' | 'signature';
  trackCount: number;
  truncated: boolean;
  totalBytes: number;
  tracks: ContentScanTrack[];
}

export interface ContentScanState {
  isRunning: boolean;
  phase: 'idle' | 'indexing' | 'verifying' | 'complete' | 'cancelled';
  startedAt: string | null;
  finishedAt: string | null;
  totalTracks: number;
  processedTracks: number;
  candidateGroups: number;
  groupsFound: number;
  verifiedGroups: number;
  errorCount: number;
  errors: string[];
  groups: ContentDuplicateGroup[];
  truncated: boolean;
}

function idleState(): ContentScanState {
  return {
    isRunning: false,
    phase: 'idle',
    startedAt: null,
    finishedAt: null,
    totalTracks: 0,
    processedTracks: 0,
    candidateGroups: 0,
    groupsFound: 0,
    verifiedGroups: 0,
    errorCount: 0,
    errors: [],
    groups: [],
    truncated: false,
  };
}

let state: ContentScanState = idleState();
let cancelRequested = false;

export function getContentScanState(): ContentScanState {
  return state;
}

export function startContentDuplicateScan(): ContentScanState {
  if (state.isRunning) return state;

  cancelRequested = false;
  state = { ...idleState(), isRunning: true, phase: 'indexing', startedAt: new Date().toISOString() };
  void runContentScan().catch((error: any) => {
    state.errorCount += 1;
    state.errors.push(`Fatal scan error: ${error?.message || error}`);
    finish(cancelRequested ? 'cancelled' : 'complete');
  });

  return state;
}

export function requestContentScanCancellation(): boolean {
  if (!state.isRunning) return false;
  cancelRequested = true;
  return true;
}

function finish(phase: 'complete' | 'cancelled') {
  state.phase = phase;
  state.isRunning = false;
  state.finishedAt = new Date().toISOString();
}

async function readAt(handle: fs.promises.FileHandle, buffer: Buffer, position: number): Promise<void> {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, position + offset);
    if (bytesRead <= 0) throw new Error('Unexpected end of file while hashing');
    offset += bytesRead;
  }
}

/** Fast content signature: file size plus hashes of the head and tail. Read-only. */
export async function computeContentSignature(fullPath: string, size: number): Promise<string> {
  const handle = await fs.promises.open(fullPath, 'r');
  try {
    const headLength = Math.min(SIGNATURE_BYTES, size);
    const head = Buffer.alloc(headLength);
    await readAt(handle, head, 0);

    let tail = Buffer.alloc(0);
    if (size > headLength) {
      const tailLength = Math.min(SIGNATURE_BYTES, size - headLength);
      tail = Buffer.alloc(tailLength);
      await readAt(handle, tail, size - tailLength);
    }

    return crypto.createHash('sha1').update(String(size)).update(head).update(tail).digest('hex');
  } finally {
    await handle.close();
  }
}

function hashFile(fullPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(fullPath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function enrichGroups(rawGroups: RawDuplicateGroup[]): Promise<ContentDuplicateGroup[]> {
  const ids = [...new Set(rawGroups.flatMap((group) => group.tracks.map((track) => track.id)))];
  if (ids.length === 0) return [];

  const rows = await prisma.track.findMany({
    where: { id: { in: ids } },
    include: { root: { select: { name: true } } },
  });
  const byId = new Map<string, ContentScanTrack>();
  for (const row of rows) {
    const formatted = formatHealthTrack({ ...row, rootName: row.root?.name });
    byId.set(row.id, { ...formatted, rootName: row.root?.name ?? null });
  }

  return rawGroups
    .map((group) => ({
      signature: group.signature,
      matchType: group.matchType,
      trackCount: group.trackCount,
      truncated: group.truncated,
      totalBytes: group.totalBytes,
      tracks: group.tracks
        .map((track) => byId.get(track.id))
        .filter((track): track is ContentScanTrack => Boolean(track)),
    }))
    .filter((group) => group.tracks.length > 1);
}

async function runContentScan() {
  // Byte-identical files must share an exact size, so files without a size twin are skipped.
  const sizeCollisions = `(
    SELECT fileSize FROM Track
    WHERE isUnavailable = 0 AND fileSize > 0
    GROUP BY fileSize HAVING COUNT(*) > 1
  )`;

  const totalRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS cnt FROM Track t
     JOIN ${sizeCollisions} s ON s.fileSize = t.fileSize
     WHERE t.isUnavailable = 0`
  );
  state.totalTracks = Number(totalRows[0]?.cnt || 0);

  const bySignature = new Map<string, CandidateTrack[]>();
  const signatureGate = pLimit(16);
  let cursor: string | undefined;

  while (true) {
    if (cancelRequested) {
      finish('cancelled');
      return;
    }

    const batch = await prisma.$queryRawUnsafe<any[]>(
      `SELECT t.id, t.fullPath, t.relativePath, t.fileSize, t.title, t.artistName,
              t.albumTitle, t.duration, t.albumId, r.name AS rootName
       FROM Track t
       JOIN ${sizeCollisions} s ON s.fileSize = t.fileSize
       LEFT JOIN LibraryRoot r ON r.id = t.rootId
       WHERE t.isUnavailable = 0 AND (? = '' OR t.id > ?)
       ORDER BY t.id ASC LIMIT ${SCAN_PAGE_SIZE}`,
      cursor ?? '',
      cursor ?? ''
    );

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    const results = await Promise.all(
      batch.map((track) =>
        signatureGate(async () => {
          const size = Number(track.fileSize || 0);
          if (size <= 0) return null;
          try {
            const signature = await computeContentSignature(track.fullPath, size);
            const candidate: CandidateTrack = {
              id: track.id,
              title: track.title,
              artistName: track.artistName,
              albumTitle: track.albumTitle,
              albumId: track.albumId,
              duration: Number(track.duration || 0),
              fileSize: size,
              relativePath: track.relativePath,
              rootName: track.rootName || null,
              fullPath: track.fullPath,
            };
            return { signature, candidate };
          } catch (error: any) {
            state.errorCount += 1;
            if (state.errors.length < 20) {
              state.errors.push(`${track.relativePath}: ${error?.message || 'read failed'}`);
            }
            return null;
          }
        })
      )
    );

    for (const result of results) {
      if (!result) continue;
      const list = bySignature.get(result.signature) || [];
      list.push(result.candidate);
      bySignature.set(result.signature, list);
    }
    state.processedTracks += batch.length;
  }

  if (cancelRequested) {
    finish('cancelled');
    return;
  }

  state.phase = 'verifying';
  const candidateGroups = [...bySignature.entries()].filter(([, tracks]) => tracks.length > 1);
  state.candidateGroups = candidateGroups.length;

  const verifyGate = pLimit(4);
  const found: RawDuplicateGroup[] = [];
  let verifyBytes = 0;
  let groupedTracks = 0;

  for (const [contentSignature, tracks] of candidateGroups) {
    if (cancelRequested) break;
    if (found.length >= MAX_GROUPS || groupedTracks >= MAX_GROUPED_TRACKS) {
      state.truncated = true;
      break;
    }

    const selected = tracks.slice(0, MAX_GROUP_TRACKS);
    const groupBytes = selected.reduce((sum, track) => sum + track.fileSize, 0);
    const totalBytes = tracks.reduce((sum, track) => sum + track.fileSize, 0);
    const truncated = tracks.length > selected.length;

    if (verifyBytes + groupBytes <= MAX_VERIFY_BYTES) {
      verifyBytes += groupBytes;
      const hashed = await Promise.all(
        selected.map((track) =>
          verifyGate(async () => {
            try {
              return { track, hash: await hashFile(track.fullPath) };
            } catch (error: any) {
              state.errorCount += 1;
              if (state.errors.length < 20) {
                state.errors.push(`${track.relativePath}: ${error?.message || 'hash failed'}`);
              }
              return null;
            }
          })
        )
      );

      const verified = hashed.filter((entry): entry is { track: CandidateTrack; hash: string } => Boolean(entry));
      if (verified.length > 1) {
        state.verifiedGroups += 1;
        const byHash = new Map<string, CandidateTrack[]>();
        for (const { track, hash } of verified) {
          const list = byHash.get(hash) || [];
          list.push(track);
          byHash.set(hash, list);
        }

        for (const [hash, hashTracks] of byHash) {
          if (hashTracks.length < 2) continue;
          if (found.length >= MAX_GROUPS || groupedTracks >= MAX_GROUPED_TRACKS) {
            state.truncated = true;
            break;
          }
          const subgroupBytes = hashTracks.reduce((sum, track) => sum + track.fileSize, 0);
          found.push({
            signature: `${hash.slice(0, 12)}-${hashTracks[0].id.slice(0, 8)}`,
            matchType: 'exact',
            trackCount: hashTracks.length,
            truncated: false,
            totalBytes: subgroupBytes,
            tracks: hashTracks,
          });
          groupedTracks += hashTracks.length;
        }
      }
      state.groupsFound = found.length;
      continue;
    }

    found.push({
      signature: contentSignature,
      matchType: 'signature',
      trackCount: tracks.length,
      truncated,
      totalBytes,
      tracks: selected,
    });
    groupedTracks += selected.length;
    state.groupsFound = found.length;
  }

  found.sort((a, b) => b.totalBytes - a.totalBytes);
  try {
    state.groups = await enrichGroups(found);
  } catch (error: any) {
    state.errorCount += 1;
    state.errors.push(`Failed to load duplicate metadata: ${error?.message || error}`);
    state.groups = [];
  }
  state.groupsFound = state.groups.length;
  finish(cancelRequested ? 'cancelled' : 'complete');
}
