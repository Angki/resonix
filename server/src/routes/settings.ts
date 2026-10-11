import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { checkFfmpegAvailability } from '../streaming/transcoder.js';
import { config } from '../config.js';

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/', async (req, reply) => {
    const settings = await prisma.setting.findMany();
    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      // Mask any API secrets if stored in settings
      if (s.key === 'lastFmApiSecret') {
        settingsMap[s.key] = s.value ? '••••••••' : '';
      } else {
        settingsMap[s.key] = s.value;
      }
    }

    const ffmpeg = checkFfmpegAvailability();

    return {
      settings: settingsMap,
      system: {
        host: config.HOST,
        port: config.PORT,
        appBaseUrl: config.APP_BASE_URL,
        ffmpegAvailable: ffmpeg.available,
        ffmpegVersion: ffmpeg.version,
        defaultLibraryRoots: config.libraryRoots,
        musicbeePath: config.MUSICBEE_DISCOVERY_PATH,
        tailscaleGuidance: 'Run `tailscale serve --bg http://127.0.0.1:3000` to stream privately to other devices.',
      },
    };
  });

  app.post('/', async (req, reply) => {
    const role = req.user?.role;
    if (role !== 'admin') {
      return reply.status(403).send({ error: 'Admin access required to modify settings' });
    }

    const bodySchema = z.record(z.string());
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid settings object' });

    for (const [key, value] of Object.entries(parsed.data)) {
      if (key === 'lastFmApiSecret' && value === '••••••••') {
        continue; // do not overwrite with mask
      }

      await prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }

    return { success: true };
  });
}
