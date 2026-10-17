import fs from 'fs';
import path from 'path';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { normalizePath } from '../library/paths.js';
import {
  discoverMusicBeeCandidates,
  previewMusicBeePlaylistImport,
  executeMusicBeePlaylistImport,
} from '../musicbee/parser.js';

function validatePlaylistPath(rawPath: string, discoveryPath: string): { valid: boolean; error?: string; normalizedPath: string } {
  if (!rawPath || typeof rawPath !== 'string') {
    return { valid: false, error: 'Path is required', normalizedPath: '' };
  }

  const norm = normalizePath(rawPath);
  const ext = path.extname(norm).toLowerCase();
  const allowedExts = ['.mbp', '.xautopf', '.m3u', '.m3u8'];

  if (!allowedExts.includes(ext)) {
    return { valid: false, error: `Invalid playlist extension. Allowed: ${allowedExts.join(', ')}`, normalizedPath: norm };
  }

  const normDiscovery = normalizePath(discoveryPath);
  const isWithinDiscovery = norm.toLowerCase().startsWith(normDiscovery.toLowerCase());
  const isWithinLibraryRoots = config.libraryRoots.some(r => norm.toLowerCase().startsWith(r.toLowerCase()));

  if (!isWithinDiscovery && !isWithinLibraryRoots) {
    return { valid: false, error: 'Playlist path must reside within playlist discovery directory or library roots', normalizedPath: norm };
  }

  if (!fs.existsSync(norm)) {
    return { valid: false, error: 'File does not exist', normalizedPath: norm };
  }

  try {
    const stat = fs.statSync(norm);
    if (!stat.isFile()) {
      return { valid: false, error: 'Target path is not a file', normalizedPath: norm };
    }
  } catch {
    return { valid: false, error: 'Cannot access target file', normalizedPath: norm };
  }

  return { valid: true, normalizedPath: norm };
}

export async function musicBeeRoutes(app: FastifyInstance) {
  app.get('/candidates', async () => {
    const setting = (await prisma.setting.findUnique({ where: { key: 'playlistDiscoveryPath' } })) ||
                    (await prisma.setting.findUnique({ where: { key: 'musicbeeDiscoveryPath' } }));
    const discoveryPath = setting?.value || config.playlistDiscoveryPath || config.MUSICBEE_DISCOVERY_PATH;
    const candidates = discoverMusicBeeCandidates(discoveryPath);

    const pastImports = await prisma.musicBeeImport.findMany({
      orderBy: { importedAt: 'desc' },
      take: 20,
    });

    return {
      discoveryPath,
      candidates,
      pastImports,
    };
  });

  app.post('/preview', async (req, reply) => {
    const bodySchema = z.object({
      filePath: z.string(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });

    const setting = (await prisma.setting.findUnique({ where: { key: 'playlistDiscoveryPath' } })) ||
                    (await prisma.setting.findUnique({ where: { key: 'musicbeeDiscoveryPath' } }));
    const discoveryPath = setting?.value || config.playlistDiscoveryPath || config.MUSICBEE_DISCOVERY_PATH;
    const validation = validatePlaylistPath(parsed.data.filePath, discoveryPath);
    if (!validation.valid) {
      return reply.status(400).send({ error: validation.error });
    }

    const preview = await previewMusicBeePlaylistImport(validation.normalizedPath);
    return preview;
  });

  app.post('/import', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.status(401).send({ error: 'Auth required' });

    const bodySchema = z.object({
      filePath: z.string(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });

    const setting = (await prisma.setting.findUnique({ where: { key: 'playlistDiscoveryPath' } })) ||
                    (await prisma.setting.findUnique({ where: { key: 'musicbeeDiscoveryPath' } }));
    const discoveryPath = setting?.value || config.playlistDiscoveryPath || config.MUSICBEE_DISCOVERY_PATH;
    const validation = validatePlaylistPath(parsed.data.filePath, discoveryPath);
    if (!validation.valid) {
      return reply.status(400).send({ error: validation.error });
    }

    const result = await executeMusicBeePlaylistImport(userId, validation.normalizedPath);
    return { success: true, ...result };
  });
}
