import type { LyricsLine } from '../lyrics/lyricsService.js';

export interface PlayQueueState {
  ids: string[];
  currentId: string | null;
  position: number;
  changedBy: string | null;
}

export interface OpenSubsonicStructuredLyrics {
  displayArtist?: string;
  displayTitle?: string;
  lang: string;
  synced: boolean;
  line: Array<{ value: string; start?: number }>;
}

const EMPTY_QUEUE: PlayQueueState = { ids: [], currentId: null, position: 0, changedBy: null };

export function normalizePlayQueue(raw: unknown): PlayQueueState {
  let value = raw;

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return { ...EMPTY_QUEUE, ids: [] };
    }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...EMPTY_QUEUE, ids: [] };
  }

  const input = value as Record<string, unknown>;
  const ids = Array.isArray(input.ids)
    ? input.ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];

  const currentId =
    typeof input.currentId === 'string' && ids.includes(input.currentId) ? input.currentId : null;

  const rawPosition = Number(input.position);
  const position = Number.isFinite(rawPosition) && rawPosition > 0 ? Math.round(rawPosition) : 0;

  const changedBy = typeof input.changedBy === 'string' && input.changedBy ? input.changedBy : null;

  return { ids, currentId, position, changedBy };
}

export function buildPlayQueuePayload(queue: PlayQueueState, songs: Array<Record<string, any>>) {
  const songMap = new Map(songs.map((song) => [song.id, song]));
  const entry = queue.ids.map((id) => songMap.get(id)).filter(Boolean);

  return {
    playQueue: {
      entry,
      current: queue.currentId || undefined,
      position: queue.position,
      changedBy: queue.changedBy || undefined,
    },
  };
}

export function buildStructuredLyrics(input: {
  artist?: string;
  title?: string;
  lines: LyricsLine[];
  plainLyrics: string;
  hasSyncedLyrics: boolean;
}): { structuredLyrics: OpenSubsonicStructuredLyrics[] } {
  const base = {
    displayArtist: input.artist,
    displayTitle: input.title,
    lang: 'und',
  };

  if (input.hasSyncedLyrics && input.lines.length > 0) {
    return {
      structuredLyrics: [
        {
          ...base,
          synced: true,
          line: input.lines.map((line) => ({
            value: line.text,
            start: Math.round(line.time * 1000),
          })),
        },
      ],
    };
  }

  const plainLines = input.plainLyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (plainLines.length === 0) {
    return { structuredLyrics: [] };
  }

  return {
    structuredLyrics: [
      {
        ...base,
        synced: false,
        line: plainLines.map((value) => ({ value })),
      },
    ],
  };
}

export interface BookmarkState {
  trackId: string;
  position: number;
  comment: string | null;
  created: string | null;
}

export function normalizeBookmarks(raw: unknown): BookmarkState[] {
  let value = raw;

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  const result: BookmarkState[] = [];
  for (const [trackId, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const bookmark = entry as Record<string, unknown>;
    const position = Number(bookmark.position);
    if (!Number.isFinite(position) || position < 0) continue;
    result.push({
      trackId,
      position: Math.round(position),
      comment: typeof bookmark.comment === 'string' && bookmark.comment ? bookmark.comment : null,
      created: typeof bookmark.created === 'string' && bookmark.created ? bookmark.created : null,
    });
  }

  return result;
}

export type FolderChildInput =
  | {
      kind: 'album';
      id: string;
      parent: string | null;
      title: string;
      artist?: string | null;
      year?: number | null;
      coverArt?: string | null;
      songCount?: number;
      created?: string | null;
    }
  | { kind: 'song'; song: Record<string, any> };

export function buildFolderChild(input: FolderChildInput, parentName?: string | null): Record<string, any> {
  if (input.kind === 'song') {
    return { ...input.song, parent: input.song.parent ?? parentName ?? undefined };
  }

  return {
    id: input.id,
    parent: input.parent || undefined,
    isDir: true,
    title: input.title,
    name: input.title,
    album: input.title,
    artist: input.artist || undefined,
    year: input.year || undefined,
    coverArt: input.coverArt || input.id,
    songCount: input.songCount ?? 0,
    created: input.created || undefined,
  };
}
