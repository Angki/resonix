import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getHealthOverview,
  getHealthIssueDetails,
  getIgnoredHealthIssues,
  ignoreHealthIssue,
  isHealthIssueType,
  unignoreHealthIssues,
  verifyLibraryFiles,
} from '../health/healthService.js';
import { captureHealthSnapshot, getHealthSnapshots, MAX_HEALTH_SNAPSHOTS } from '../health/snapshots.js';
import { verifyArtworkIntegrity } from '../health/artworkIntegrity.js';
import {
  getContentScanState,
  requestContentScanCancellation,
  startContentDuplicateScan,
} from '../health/contentScan.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health/overview', async (req) => {
    const query = (req.query || {}) as { refresh?: string };
    const refresh = query.refresh === 'true' || query.refresh === '1';
    return getHealthOverview(refresh);
  });

  app.get('/health/issues/:type', async (req, reply) => {
    const { type } = req.params as { type: string };
    if (!isHealthIssueType(type)) {
      return reply.status(404).send({ error: `Unknown health issue type: ${type}` });
    }

    const query = (req.query || {}) as { limit?: string; offset?: string };
    const parsedLimit = query.limit !== undefined ? parseInt(query.limit, 10) : undefined;
    const parsedOffset = query.offset !== undefined ? parseInt(query.offset, 10) : undefined;

    return getHealthIssueDetails(type, {
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      offset: Number.isFinite(parsedOffset) ? parsedOffset : undefined,
    });
  });

  app.get('/health/ignored', async () => {
    const ignored = await getIgnoredHealthIssues(true);
    return { total: ignored.length, ignored };
  });

  app.post('/health/ignore', async (req, reply) => {
    if (req.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin access required to ignore health issues' });
    }

    const schema = z.object({
      type: z.string().min(1),
      signature: z.string().min(1).max(512),
      label: z.string().max(200).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const result = await ignoreHealthIssue(parsed.data.type, parsed.data.signature, parsed.data.label);
    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }
    return result;
  });

  app.post('/health/unignore', async (req, reply) => {
    if (req.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin access required to restore health issues' });
    }

    const schema = z.object({
      type: z.string().optional(),
      signature: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const result = await unignoreHealthIssues(parsed.data.type, parsed.data.signature);
    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }
    return result;
  });

  app.post('/health/verify', async (req, reply) => {
    const schema = z.object({
      rootId: z.string().optional(),
      limit: z.coerce.number().int().positive().optional(),
      offset: z.coerce.number().int().min(0).optional(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    return verifyLibraryFiles(parsed.data);
  });

  app.get('/health/snapshots', async () => {
    const snapshots = await getHealthSnapshots(true);
    return { snapshots, max: MAX_HEALTH_SNAPSHOTS };
  });

  app.post('/health/snapshots', async (req, reply) => {
    if (req.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin access required to capture health snapshots' });
    }
    return captureHealthSnapshot('manual');
  });

  app.post('/health/verify-artwork', async (req, reply) => {
    const schema = z.object({
      limit: z.coerce.number().int().positive().optional(),
      offset: z.coerce.number().int().min(0).optional(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    return verifyArtworkIntegrity(parsed.data);
  });

  app.get('/health/deep-scan', async () => getContentScanState());

  app.post('/health/deep-scan', async (req, reply) => {
    if (req.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin access required to run a deep duplicate scan' });
    }
    return startContentDuplicateScan();
  });

  app.post('/health/deep-scan/cancel', async (req, reply) => {
    if (req.user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin access required to cancel a deep duplicate scan' });
    }
    return { success: requestContentScanCancellation() };
  });
}
