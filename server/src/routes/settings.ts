import { FastifyInstance } from 'fastify';
import { spawn } from 'child_process';
import { z } from 'zod';
import { prisma } from '../db.js';
import { checkFfmpegAvailability } from '../streaming/transcoder.js';
import { config } from '../config.js';
import { encryptSecret } from '../crypto.js';

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
    const userId = req.user?.id;
    let hasSubsonicPassword = false;
    if (userId) {
      const sp = await prisma.setting.findUnique({ where: { key: `subsonic_pw_${userId}` } });
      hasSubsonicPassword = !!sp?.value;
    }

    return {
      settings: settingsMap,
      system: {
        host: config.HOST,
        port: config.PORT,
        appBaseUrl: config.APP_BASE_URL,
        ffmpegAvailable: ffmpeg.available,
        ffmpegVersion: ffmpeg.version,
        defaultLibraryRoots: config.libraryRoots,
        playlistDiscoveryPath: config.playlistDiscoveryPath,
        musicbeePath: config.MUSICBEE_DISCOVERY_PATH,
        tailscaleGuidance: 'Run `tailscale serve --bg http://127.0.0.1:3000` to stream privately to other devices.',
      },
      subsonic: {
        enabled: true,
        endpoint: '/rest',
        serverUrl: `http://${config.HOST === '0.0.0.0' ? '127.0.0.1' : config.HOST}:${config.PORT}/rest`,
        passwordConfigured: hasSubsonicPassword,
        supportedApps: ['Symfonium (Android / Android Auto)', 'Feishin (Desktop)', 'DSub', 'Substreamer', 'Amprfine'],
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

  // Set or update Subsonic password for current user
  app.post('/subsonic/password', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const bodySchema = z.object({
      password: z.string().min(4, 'Password must be at least 4 characters'),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    await prisma.setting.upsert({
      where: { key: `subsonic_pw_${userId}` },
      update: { value: encryptSecret(parsed.data.password) },
      create: { key: `subsonic_pw_${userId}`, value: encryptSecret(parsed.data.password) },
    });

    return { success: true, message: 'Subsonic password updated successfully' };
  });

  // Gracefully restart backend server
  app.post('/restart', async (req, reply) => {
    if (req.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin access required to restart server' });
    }

    reply.send({ success: true, message: 'Server backend restarting...' });
    setTimeout(() => {
      try {
        const child = spawn(process.argv[0], process.argv.slice(1), {
          cwd: process.cwd(),
          detached: true,
          stdio: 'inherit',
        });
        child.unref();
      } catch (e) {
        console.error('[Settings] Failed to spawn restart child process:', e);
      }
      process.exit(0);
    }, 600);
  });
}
