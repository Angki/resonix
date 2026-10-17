import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { lyricsService } from '../lyrics/lyricsService.js';

export async function lyricsRoutes(app: FastifyInstance) {
  // 1. Get lyrics for a track (cached / sidecar / embedded / online)
  app.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    if (!id) {
      return reply.status(400).send({ error: 'Track ID is required' });
    }
    const result = await lyricsService.getLyrics(id, false);
    return result;
  });

  // 2. Force re-fetch from online ignoring cache
  app.post('/:id/refetch', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = req.params;
    if (!id) {
      return reply.status(400).send({ error: 'Track ID is required' });
    }
    const result = await lyricsService.getLyrics(id, true);
    return result;
  });
}
