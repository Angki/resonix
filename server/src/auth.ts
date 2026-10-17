import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from './db.js';
import { verifySession } from './crypto.js';
import { config } from './config.js';

export interface AuthUser {
  id: string;
  username: string;
  role: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  const url = req.url.split('?')[0];

  // Completely public endpoints that bypass authentication
  if (
    url.startsWith('/api/auth/login') ||
    url.startsWith('/api/auth/setup') ||
    url.startsWith('/api/artwork')
  ) {
    return;
  }

  // Check if first-run setup is required
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    if (url.startsWith('/api/auth/status')) {
      return;
    }
    return reply.status(403).send({
      error: 'First-run setup required',
      needsSetup: true,
    });
  }

  const isOptionalAuth = url.startsWith('/api/auth/status');

  const sessionToken =
    req.cookies.session ||
    (req.headers.authorization?.replace(/^Bearer\s+/i, '')) ||
    (req.query as any)?.token;

  if (!sessionToken) {
    if (isOptionalAuth) return;
    return reply.status(401).send({ error: 'Authentication required' });
  }

  const verified = verifySession(sessionToken);
  if (!verified) {
    if (isOptionalAuth) return;
    return reply.status(401).send({ error: 'Session expired or invalid' });
  }

  const user = await prisma.user.findUnique({
    where: { id: verified.userId },
    select: { id: true, username: true, role: true },
  });

  if (!user) {
    if (isOptionalAuth) return;
    return reply.status(401).send({ error: 'User account not found' });
  }

  req.user = user;

  // Origin / Referer CSRF defense on state-changing requests
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin && !config.allowedOrigins.includes(origin)) {
      // In PERSONAL/LAN mode, allow localhost/127.0.0.1 variants or configured origins
      try {
        const originUrl = new URL(origin);
        const isLocal = originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1';
        if (!isLocal && !config.allowedOrigins.includes(origin)) {
          return reply.status(403).send({ error: 'Cross-origin request blocked by CSRF policy' });
        }
      } catch {
        return reply.status(403).send({ error: 'Malformed Origin header' });
      }
    }
  }
}
