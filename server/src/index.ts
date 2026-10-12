import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { config } from './config.js';
import { prisma, ensureDefaultSettings } from './db.js';
import { authenticate } from './auth.js';
import { processScrobbleQueue } from './lastfm/api.js';
import { startLibraryWatcher, stopLibraryWatcher } from './library/watcher.js';

import { authRoutes } from './routes/auth.js';
import { libraryRoutes } from './routes/library.js';
import { tracksRoutes } from './routes/tracks.js';
import { streamRoutes } from './routes/stream.js';
import { artworkRoutes } from './routes/artwork.js';
import { playbackRoutes } from './routes/playback.js';
import { playlistsRoutes } from './routes/playlists.js';
import { musicBeeRoutes } from './routes/musicbee.js';
import { lastFmRoutes } from './routes/lastfm.js';
import { settingsRoutes } from './routes/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prevent unhandled background errors from crashing the daemon
process.on('uncaughtException', (err) => {
  console.error('[Black-Library] Uncaught exception captured (preventing crash):', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Black-Library] Unhandled promise rejection captured (preventing crash):', reason);
});

const app = Fastify({
  trustProxy: true,
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'warn',
  },
});

// Register Plugins
await app.register(cookie, {
  secret: config.SESSION_SECRET,
  parseOptions: {},
});

await app.register(cors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
});

await app.register(rateLimit, {
  max: 3000,
  timeWindow: '1 minute',
  allowList: ['127.0.0.1', '::1', 'localhost'],
  keyGenerator: (req) => {
    const rawIp = req.ip || req.raw.socket?.remoteAddress || '127.0.0.1';
    return typeof rawIp === 'string' ? rawIp : '127.0.0.1';
  },
});

// Authentication hook for /api routes
app.addHook('onRequest', async (req, reply) => {
  if (req.url.startsWith('/api')) {
    await authenticate(req, reply);
  }
});

// Register API Route Modules
app.register(authRoutes, { prefix: '/api/auth' });
app.register(libraryRoutes, { prefix: '/api/library' });
app.register(tracksRoutes, { prefix: '/api/tracks' });
app.register(streamRoutes, { prefix: '/api/stream' });
app.register(artworkRoutes, { prefix: '/api/artwork' });
app.register(playbackRoutes, { prefix: '/api/playback' });
app.register(playlistsRoutes, { prefix: '/api/playlists' });
app.register(musicBeeRoutes, { prefix: '/api/musicbee' });
app.register(lastFmRoutes, { prefix: '/api/lastfm' });
app.register(settingsRoutes, { prefix: '/api/settings' });

// Static Frontend Serving in Production
const publicPath = path.resolve(__dirname, '../public');
if (fs.existsSync(publicPath)) {
  await app.register(fastifyStatic, {
    root: publicPath,
    prefix: '/',
  });

  // SPA fallback for HTML5 history routing
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) {
      return reply.status(404).send({ error: 'API endpoint not found' });
    }
    const indexFile = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexFile)) {
      reply.type('text/html');
      return reply.send(fs.createReadStream(indexFile));
    }
    return reply.status(404).send('Not Found');
  });
}

// Background scrobble queue runner (every 60 seconds)
setInterval(() => {
  processScrobbleQueue().catch(err => {
    console.error('Scrobble background cycle error:', err);
  });
}, 60000);

// Server startup
async function start() {
  try {
    await ensureDefaultSettings();
    startLibraryWatcher().catch(err => console.warn('Watcher startup failed:', err));

    await app.listen({
      host: config.HOST,
      port: config.PORT,
    });

    console.log(`\n======================================================`);
    console.log(`🔥 BLACK LIBRARY SERVER ACTIVE`);
    console.log(`📡 URL: http://${config.HOST}:${config.PORT}`);
    console.log(`🔒 Mode: Tailscale-ready (Listen on ${config.HOST})`);
    console.log(`📂 Collections: ${config.libraryRoots.join(', ')}`);
    console.log(`======================================================\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();

// Graceful shutdown
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    console.log(`Received ${signal}, closing server...`);
    await stopLibraryWatcher();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}
