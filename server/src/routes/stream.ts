import { FastifyInstance } from 'fastify';
import { handleStreamRequest } from '../streaming/streamer.js';

export async function streamRoutes(app: FastifyInstance) {
  // Fastify automatically exposes HEAD for GET routes
  app.get('/:trackId', async (req, reply) => {
    return handleStreamRequest(req as any, reply);
  });

  app.get('/:trackId/transcode', async (req, reply) => {
    (req.query as any).transcode = 'true';
    return handleStreamRequest(req as any, reply);
  });
}
