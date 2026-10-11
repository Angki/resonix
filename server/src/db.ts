import { PrismaClient } from '@prisma/client';
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

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function ensureDefaultSettings() {
  // Optimize SQLite for high concurrency and zero locking timeouts
  try {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 10000;');
    await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
  } catch (e) {
    console.warn('SQLite PRAGMA setup error:', e);
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
