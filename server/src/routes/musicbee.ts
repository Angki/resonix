import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import {
  discoverMusicBeeCandidates,
  previewMusicBeePlaylistImport,
  executeMusicBeePlaylistImport,
} from '../musicbee/parser.js';

export async function musicBeeRoutes(app: FastifyInstance) {
  app.get('/candidates', async () => {
    const setting = await prisma.setting.findUnique({ where: { key: 'musicbeeDiscoveryPath' } });
    const discoveryPath = setting?.value || config.MUSICBEE_DISCOVERY_PATH;
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

    const preview = await previewMusicBeePlaylistImport(parsed.data.filePath);
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

    const result = await executeMusicBeePlaylistImport(userId, parsed.data.filePath);
    return { success: true, ...result };
  });
}
