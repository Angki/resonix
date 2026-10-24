import fs from 'fs';
import path from 'path';
import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db.js';
import { isPathAllowed } from '../library/paths.js';
import { startAudioTranscode } from './transcoder.js';
import { parseByteRange } from './range.js';

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
  req: FastifyRequest<{
    Params: { trackId: string };
    Querystring: {
      transcode?: string;
      offset?: string;
      timeOffset?: string;
      bitrate?: string;
      maxBitRate?: string;
      format?: string;
      download?: string;
    };
  }>,
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

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(track.fullPath);
  } catch {
    await prisma.track.update({
      where: { id: trackId },
      data: { isUnavailable: true },
    });
    return reply.status(404).send({ error: 'Media file missing or currently unavailable' });
  }
  if (!stat.isFile()) {
    return reply.status(404).send({ error: 'Media file missing or currently unavailable' });
  }

  const isDownload = req.query.download === 'true' || req.query.download === '1';
  const filename = path.basename(track.fullPath).replace(/["\\\r\n]/g, '_');
  const disposition = isDownload ? `attachment; filename="${filename}"` : 'inline';

  const ext = path.extname(track.fullPath).toLowerCase();
  const nonBrowserFormats = ['.wma', '.dsf', '.dff', '.ape'];
  const shouldTranscode =
    !isDownload && (req.query.transcode === 'true' || nonBrowserFormats.includes(ext));

  // Transcoded stream path
  if (shouldTranscode) {
    const rawFormat = (req.query.format || 'mp3').toLowerCase();
    const validFormat = (['mp3', 'opus', 'aac'].includes(rawFormat) ? rawFormat : 'mp3') as 'mp3' | 'opus' | 'aac';
    const fallbackContentType = validFormat === 'opus' ? 'audio/opus' : (validFormat === 'aac' ? 'audio/aac' : 'audio/mpeg');

    if (req.method === 'HEAD') {
      reply.raw.setHeader('Content-Type', fallbackContentType);
      reply.raw.setHeader('Content-Disposition', disposition);
      reply.raw.setHeader('Accept-Ranges', 'none');
      reply.raw.setHeader('X-Transcoded-Stream', 'true');
      return reply.status(200).send();
    }

    const startOffset = parseFloat(req.query.timeOffset || req.query.offset || '0') || 0;
    const bitrate = parseInt(req.query.maxBitRate || req.query.bitrate || '320', 10) || 320;

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
      reply.raw.setHeader('Content-Disposition', disposition);
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
  const fileSize = stat.size;
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  const sendFile = (start?: number, end?: number) => {
    const stream = fs.createReadStream(track.fullPath, { start, end });
    stream.on('error', (err) => {
      req.log.error({ err, trackId }, 'Audio read stream failed');
      if (!reply.raw.headersSent) {
        reply.status(500).send({ error: 'Failed to read media file' });
      } else {
        reply.raw.destroy();
      }
    });
    return reply.send(stream);
  };

  if (req.method === 'HEAD') {
    reply.raw.setHeader('Accept-Ranges', 'bytes');
    reply.raw.setHeader('Content-Type', mimeType);
    reply.raw.setHeader('Content-Length', fileSize);
    reply.raw.setHeader('Content-Disposition', disposition);
    reply.raw.setHeader('X-Content-Type-Options', 'nosniff');
    return reply.status(200).send();
  }

  const range = parseByteRange(req.headers.range, fileSize);

  if (range === null) {
    reply.raw.setHeader('Accept-Ranges', 'bytes');
    reply.raw.setHeader('Content-Type', mimeType);
    reply.raw.setHeader('Content-Length', fileSize);
    reply.raw.setHeader('Content-Disposition', disposition);
    reply.raw.setHeader('X-Content-Type-Options', 'nosniff');
    return sendFile();
  }

  if ('unsatisfiable' in range) {
    reply.raw.setHeader('Content-Range', `bytes */${fileSize}`);
    reply.raw.setHeader('Content-Disposition', disposition);
    return reply.status(416).send({ error: 'Requested Range Not Satisfiable' });
  }

  const { start, end } = range;
  const chunkSize = end - start + 1;
  reply.status(206).headers({
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': mimeType,
    'Content-Disposition': disposition,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': isDownload ? 'private, max-age=0' : 'public, max-age=3600',
  });

  return sendFile(start, end);
}
