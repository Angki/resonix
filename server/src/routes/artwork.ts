import { FastifyInstance } from 'fastify';
import { getArtworkThumbnail } from '../library/artwork.js';
import { prisma } from '../db.js';

const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="#18181b">
  <rect width="256" height="256" fill="#18181b"/>
  <circle cx="128" cy="128" r="64" fill="#27272a" stroke="#3f3f46" stroke-width="4"/>
  <circle cx="128" cy="128" r="20" fill="#991b1b"/>
  <circle cx="128" cy="128" r="6" fill="#18181b"/>
</svg>`;

export async function artworkRoutes(app: FastifyInstance) {
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { size } = (req.query as { size?: string }) || {};

    const targetSize = size === '96' ? 96 : size === '512' ? 512 : 256;
    const thumb = await getArtworkThumbnail(id, targetSize);

    if (!thumb) {
      reply.header('Content-Type', 'image/svg+xml');
      reply.header('Cache-Control', 'public, max-age=3600');
      return reply.send(FALLBACK_SVG);
    }

    reply.header('Content-Type', thumb.contentType);
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(thumb.buffer);
  });

  app.get('/track/:trackId', async (req, reply) => {
    const { trackId } = req.params as { trackId: string };
    const { size } = (req.query as { size?: string }) || {};

    const track = await prisma.track.findUnique({
      where: { id: trackId },
      select: { artworkId: true, album: { select: { artworkId: true } } },
    });

    const artworkId = track?.artworkId || track?.album?.artworkId;
    if (!artworkId) {
      reply.header('Content-Type', 'image/svg+xml');
      reply.header('Cache-Control', 'public, max-age=3600');
      return reply.send(FALLBACK_SVG);
    }

    const targetSize = size === '96' ? 96 : size === '512' ? 512 : 256;
    const thumb = await getArtworkThumbnail(artworkId, targetSize);

    if (!thumb) {
      reply.header('Content-Type', 'image/svg+xml');
      reply.header('Cache-Control', 'public, max-age=3600');
      return reply.send(FALLBACK_SVG);
    }

    reply.header('Content-Type', thumb.contentType);
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(thumb.buffer);
  });
}
