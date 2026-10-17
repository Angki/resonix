import { PrismaClient } from './generated/prisma/index.js';
import fs from 'fs';
import { config } from './config.js';

if (!fs.existsSync(config.cacheDir)) {
  fs.mkdirSync(config.cacheDir, { recursive: true });
}
if (!fs.existsSync(config.artworkCacheDir)) {
  fs.mkdirSync(config.artworkCacheDir, { recursive: true });
}
if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}
if (!fs.existsSync(config.artistArtDir)) {
  fs.mkdirSync(config.artistArtDir, { recursive: true });
}
if (!fs.existsSync(config.lyricsDir)) {
  fs.mkdirSync(config.lyricsDir, { recursive: true });
}

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function ensureDefaultSettings() {
  // Optimize SQLite for high concurrency and zero locking timeouts
  try {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 30000;');
    await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
    await prisma.$queryRawUnsafe('PRAGMA cache_size = -64000;'); // 64MB page cache
    await prisma.$queryRawUnsafe('PRAGMA temp_store = MEMORY;');
    await prisma.$queryRawUnsafe('PRAGMA mmap_size = 268435456;'); // 256MB memory-mapped file I/O
    await prisma.$queryRawUnsafe('CREATE INDEX IF NOT EXISTS idx_track_albumId ON Track(albumId);');
    await prisma.$queryRawUnsafe('CREATE INDEX IF NOT EXISTS idx_track_isLossless ON Track(isLossless);');
    await prisma.$queryRawUnsafe('CREATE INDEX IF NOT EXISTS idx_track_album_quality ON Track(albumId, isLossless, bitrate, bitDepth, sampleRate);');
    await prisma.$queryRawUnsafe('CREATE INDEX IF NOT EXISTS idx_track_nav ON Track(isUnavailable, rootId, artistName, albumTitle);');
    await prisma.$queryRawUnsafe('CREATE INDEX IF NOT EXISTS idx_track_artist_sort ON Track(isUnavailable, artistName, albumTitle);');
    await prisma.$queryRawUnsafe('CREATE INDEX IF NOT EXISTS idx_track_title ON Track(isUnavailable, title);');
    await prisma.$queryRawUnsafe('CREATE INDEX IF NOT EXISTS idx_track_year ON Track(isUnavailable, year);');
    await prisma.$queryRawUnsafe('CREATE INDEX IF NOT EXISTS idx_track_createdAt ON Track(isUnavailable, createdAt);');
    await prisma.$queryRawUnsafe('CREATE INDEX IF NOT EXISTS idx_track_genre ON Track(isUnavailable, genre);');
    await prisma.$queryRawUnsafe('CREATE INDEX IF NOT EXISTS idx_track_title_nocase ON Track(title COLLATE NOCASE);');
    await prisma.$queryRawUnsafe('CREATE INDEX IF NOT EXISTS idx_track_artist_nocase ON Track(artistName COLLATE NOCASE);');
    await prisma.$queryRawUnsafe('CREATE INDEX IF NOT EXISTS idx_track_root_unavail_album ON Track(rootId, isUnavailable, albumId);');

    // Initialize SQLite FTS5 Full-Text Search Virtual Table
    await prisma.$queryRawUnsafe(`
      CREATE VIRTUAL TABLE IF NOT EXISTS TrackFts USING fts5(
        trackId UNINDEXED,
        title,
        artistName,
        albumTitle,
        genre,
        tokenize = 'unicode61 remove_diacritics 2'
      );
    `);

    // Sync FTS table if empty
    try {
      const ftsCount: any = await prisma.$queryRawUnsafe('SELECT COUNT(*) as cnt FROM TrackFts;');
      const count = Number(ftsCount[0]?.cnt || 0);
      if (count === 0) {
        await prisma.$queryRawUnsafe(`
          INSERT INTO TrackFts(trackId, title, artistName, albumTitle, genre)
          SELECT id, title, artistName, albumTitle, COALESCE(genre, '')
          FROM Track
          WHERE isUnavailable = 0;
        `);
      }
    } catch {
      // ignore
    }

    // Automatic triggers to keep TrackFts synchronized with Track table
    await prisma.$queryRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS trg_track_fts_insert AFTER INSERT ON Track BEGIN
        INSERT INTO TrackFts(trackId, title, artistName, albumTitle, genre)
        VALUES (new.id, new.title, new.artistName, new.albumTitle, COALESCE(new.genre, ''));
      END;
    `);
    await prisma.$queryRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS trg_track_fts_delete AFTER DELETE ON Track BEGIN
        DELETE FROM TrackFts WHERE trackId = old.id;
      END;
    `);
    await prisma.$queryRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS trg_track_fts_update AFTER UPDATE ON Track BEGIN
        DELETE FROM TrackFts WHERE trackId = old.id;
        INSERT INTO TrackFts(trackId, title, artistName, albumTitle, genre)
        VALUES (new.id, new.title, new.artistName, new.albumTitle, COALESCE(new.genre, ''));
      END;
    `);

    await prisma.$queryRawUnsafe('PRAGMA optimize;');
  } catch (e) {
    console.warn('SQLite PRAGMA / FTS5 setup error:', e);
  }

  const defaults = [
    { key: 'minPlayThresholdPercent', value: '50', description: 'Percentage of track duration required to count as a play' },
    { key: 'maxPlayThresholdSeconds', value: '240', description: 'Maximum listening time in seconds before counting as a play (4 mins)' },
    { key: 'transcodeBitrate', value: '320', description: 'Default fallback transcode bitrate in kbps' },
    { key: 'enableLastFmScrobble', value: 'true', description: 'Enable background Last.fm scrobbling' },
    { key: 'libraryRoots', value: JSON.stringify(config.libraryRoots), description: 'Active library root directories' },
    { key: 'musicbeeDiscoveryPath', value: config.MUSICBEE_DISCOVERY_PATH, description: 'Path to MusicBee files' },
  ];

  for (const item of defaults) {
    await prisma.setting.upsert({
      where: { key: item.key },
      update: {},
      create: item,
    });
  }

  // Also seed default library roots into LibraryRoot table if empty
  for (const rootPath of config.libraryRoots) {
    const name = rootPath.split(/[/\\]/).filter(Boolean).pop() || rootPath;
    await prisma.libraryRoot.upsert({
      where: { path: rootPath },
      update: {},
      create: {
        name,
        path: rootPath,
        isEnabled: true,
        isReadOnly: true,
      },
    });
  }
}

/**
 * Perform SQLite maintenance (WAL checkpoint and query planner optimization)
 */
export async function runDatabaseOptimization(): Promise<void> {
  try {
    await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(PASSIVE);');
    await prisma.$queryRawUnsafe('PRAGMA optimize;');
  } catch (err) {
    console.warn('[SQLite] Database maintenance error:', err);
  }
}

