import fs from 'fs';
import path from 'path';
import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db.js';
import { isPathAllowed } from '../library/paths.js';
import { startAudioTranscode } from './transcoder.js';

export const MIME_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.alac': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.wav': 'audio/wav',
  '.aiff': 'audio/aiff',
  '.wma': 'audio/x-ms-wma',
  '.wv': 'audio/x-wavpack',
  '.ape': 'audio/x-ape',
  '.dsf': 'audio/x-dsf',
  '.dff': 'audio/x-dff',
  '.mka': 'audio/x-matroska',
};

export async function handleStreamRequest(
  req: FastifyRequest<{ Params: { trackId: string }; Querystring: { transcode?: string; offset?: string; bitrate?: string; format?: string } }>,
  reply: FastifyReply
) {
  const { trackId } = req.params;
  const track = await prisma.track.findUnique({
    where: { id: trackId },
  });

  if (!track) {
    return reply.status(404).send({ error: 'Track not found' });
  }

  const allowed = await isPathAllowed(track.fullPath);
  if (!allowed) {
    return reply.status(403).send({ error: 'Access denied: File outside authorized library roots' });
  }

  if (!fs.existsSync(track.fullPath)) {
    await prisma.track.update({
      where: { id: trackId },
      data: { isUnavailable: true },
    });
    return reply.status(404).send({ error: 'Media file missing or currently unavailable' });
  }

  const ext = path.extname(track.fullPath).toLowerCase();
  const nonBrowserFormats = ['.wma', '.dsf', '.dff', '.ape'];
  const shouldTranscode = req.query.transcode === 'true' || nonBrowserFormats.includes(ext);

  // Transcoded stream path
  if (shouldTranscode) {
    const rawFormat = (req.query.format || 'mp3').toLowerCase();
    const validFormat = (['mp3', 'opus', 'aac'].includes(rawFormat) ? rawFormat : 'mp3') as 'mp3' | 'opus' | 'aac';
    const fallbackContentType = validFormat === 'opus' ? 'audio/opus' : (validFormat === 'aac' ? 'audio/aac' : 'audio/mpeg');

    if (req.method === 'HEAD') {
      reply.raw.setHeader('Content-Type', fallbackContentType);
      reply.raw.setHeader('Content-Disposition', 'inline');
      reply.raw.setHeader('Accept-Ranges', 'none');
      reply.raw.setHeader('X-Transcoded-Stream', 'true');
      return reply.status(200).send();
    }

    const startOffset = parseFloat(req.query.offset || '0') || 0;
    const bitrate = parseInt(req.query.bitrate || '320', 10) || 320;

    try {
      const { stream, kill, contentType } = startAudioTranscode({
        filePath: track.fullPath,
        startSeconds: startOffset,
        bitrateKbps: bitrate,
        format: validFormat,
      });

      req.raw.on('close', () => {
        kill();
      });

      reply.raw.setHeader('Content-Type', contentType);
      reply.raw.setHeader('Content-Disposition', 'inline');
      reply.raw.setHeader('X-Content-Type-Options', 'nosniff');
      reply.raw.setHeader('Cache-Control', 'no-cache, no-store');
      reply.raw.setHeader('X-Transcoded-Stream', 'true');
      reply.raw.setHeader('X-Transcode-Offset', startOffset.toString());

      return reply.send(stream);
    } catch (e: any) {
      return reply.status(500).send({ error: `Transcode failed: ${e.message}` });
    }
  }

  // Direct Range Stream (RFC 7233)
  const stat = fs.statSync(track.fullPath);
  const fileSize = stat.size;
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  const range = req.headers.range;

  if (req.method === 'HEAD') {
    reply.raw.setHeader('Accept-Ranges', 'bytes');
    reply.raw.setHeader('Content-Type', mimeType);
    reply.raw.setHeader('Content-Length', fileSize);
    reply.raw.setHeader('Content-Disposition', 'inline');
    reply.raw.setHeader('X-Content-Type-Options', 'nosniff');
    return reply.status(200).send();
  }

  if (!range) {
    reply.raw.setHeader('Accept-Ranges', 'bytes');
    reply.raw.setHeader('Content-Type', mimeType);
    reply.raw.setHeader('Content-Length', fileSize);
    reply.raw.setHeader('Content-Disposition', 'inline');
    reply.raw.setHeader('X-Content-Type-Options', 'nosniff');
    return reply.send(fs.createReadStream(track.fullPath));
  }

  // Parse HTTP Range header
  const parts = range.replace(/bytes=/, '').split('-');
  let start = parseInt(parts[0], 10);
  let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

  if (isNaN(start)) {
    // Suffix byte range: bytes=-500 (last 500 bytes)
    start = fileSize - end;
    end = fileSize - 1;
  }

  if (isNaN(end) || end >= fileSize) {
    end = fileSize - 1;
  }

  if (start >= fileSize || start < 0 || start > end) {
    reply.raw.setHeader('Content-Range', `bytes */${fileSize}`);
    reply.raw.setHeader('Content-Disposition', 'inline');
    return reply.status(416).send({ error: 'Requested Range Not Satisfiable' });
  }

  const chunkSize = end - start + 1;
  reply.status(206).headers({
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': mimeType,
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=3600',
  });

  const stream = fs.createReadStream(track.fullPath, { start, end });
  return reply.send(stream);
}
