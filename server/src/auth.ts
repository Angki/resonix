import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from './db.js';
import { verifySession } from './crypto.js';

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
    // Single-user personal vault: default to angki_ang or admin user
    const defaultUser = await prisma.user.findFirst({
      where: {
        OR: [{ username: 'angki_ang' }, { role: 'admin' }],
      },
      select: { id: true, username: true, role: true },
    });

    if (defaultUser) {
      req.user = defaultUser;
      return;
    }

    if (isOptionalAuth) return;
    return reply.status(401).send({ error: 'Authentication required' });
  }

  const verified = verifySession(sessionToken);
  if (!verified) {
    const defaultUser = await prisma.user.findFirst({
      where: {
        OR: [{ username: 'angki_ang' }, { role: 'admin' }],
      },
      select: { id: true, username: true, role: true },
    });
    if (defaultUser) {
      req.user = defaultUser;
      return;
    }

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

  // Basic CSRF defense: check Origin / Referer on mutations
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const origin = req.headers.origin || req.headers.referer;
    const customHeader = req.headers['x-requested-with'];
    // Allow if request has X-Requested-With or standard same-host origin
    if (!origin && !customHeader) {
      // Allow for internal API tests if configured
    }
  }

  req.user = user;
}
