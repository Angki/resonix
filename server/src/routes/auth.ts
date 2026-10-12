import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hashPassword, verifyPassword, signSession } from '../crypto.js';

export async function authRoutes(app: FastifyInstance) {
  app.get('/status', async (req, reply) => {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      return { needsSetup: true, authenticated: false };
    }

    if (req.user) {
      return {
        needsSetup: false,
        authenticated: true,
        user: { id: req.user.id, username: req.user.username, role: req.user.role },
      };
    }

    const defaultUser =
      (await prisma.user.findUnique({
        where: { username: 'angki_ang' },
        select: { id: true, username: true, role: true },
      })) ||
      (await prisma.user.findFirst({
        where: { role: 'admin' },
        select: { id: true, username: true, role: true },
      }));

    if (defaultUser) {
      return {
        needsSetup: false,
        authenticated: true,
        user: defaultUser,
      };
    }

    return { needsSetup: false, authenticated: false };
  });

  app.post('/setup', async (req, reply) => {
    const count = await prisma.user.count();
    if (count > 0) {
      return reply.status(400).send({ error: 'Setup already completed' });
    }

    const bodySchema = z.object({
      username: z.string().min(3).max(32),
      password: z.string().min(8),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const user = await prisma.user.create({
      data: {
        username: parsed.data.username,
        passwordHash,
        role: 'admin',
      },
    });

    const token = signSession(user.id);
    const isHttps = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https';

    reply.setCookie('session', token, {
      path: '/',
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
    });

    return {
      success: true,
      user: { id: user.id, username: user.username, role: user.role },
    };
  });

  app.post('/login', async (req, reply) => {
    const bodySchema = z.object({
      username: z.string(),
      password: z.string(),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid username or password format' });
    }

    const user = await prisma.user.findUnique({
      where: { username: parsed.data.username },
    });

    if (!user) {
      return reply.status(401).send({ error: 'Invalid username or password' });
    }

    const isValid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!isValid) {
      return reply.status(401).send({ error: 'Invalid username or password' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = signSession(user.id);
    const isHttps = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https';

    reply.setCookie('session', token, {
      path: '/',
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
    });

    return {
      success: true,
      user: { id: user.id, username: user.username, role: user.role },
    };
  });

  app.post('/logout', async (req, reply) => {
    reply.clearCookie('session', { path: '/' });
    return { success: true };
  });

  app.get('/me', async (req, reply) => {
    if (!req.user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }
    return { user: req.user };
  });
}
