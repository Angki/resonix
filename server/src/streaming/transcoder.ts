import { spawn, execSync, exec, ChildProcessWithoutNullStreams } from 'child_process';
import { Readable } from 'stream';
import { config } from '../config.js';

let ffmpegAvailable: boolean | null = null;
let ffmpegVersionString: string = '';
let activeTranscodesCount = 0;
const MAX_CONCURRENT_TRANSCODES = 3;

export function checkFfmpegAvailability(): { available: boolean; version: string } {
  if (ffmpegAvailable !== null) {
    return { available: ffmpegAvailable, version: ffmpegVersionString };
  }

  const binary = config.FFMPEG_PATH || 'ffmpeg';
  try {
    const output = execSync(`"${binary}" -version`, { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
    ffmpegAvailable = true;
    const firstLine = output.split('\n')[0] || 'FFmpeg available';
    ffmpegVersionString = firstLine.trim();
  } catch {
    ffmpegAvailable = false;
    ffmpegVersionString = 'FFmpeg not detected on PATH or FFMPEG_PATH';
  }

  return { available: ffmpegAvailable, version: ffmpegVersionString };
}

export interface TranscodeOptions {
  filePath: string;
  startSeconds?: number;
  bitrateKbps?: number;
  format?: 'mp3' | 'aac' | 'opus';
}

export function startAudioTranscode(options: TranscodeOptions): {
  stream: Readable;
  kill: () => void;
  contentType: string;
} {
  const { available } = checkFfmpegAvailability();
  if (!available) {
    throw new Error('FFmpeg is not available on this server. Direct stream should be used.');
  }

  if (activeTranscodesCount >= MAX_CONCURRENT_TRANSCODES) {
    throw new Error('Server transcode capacity reached. Please try direct playback or wait.');
  }

  const binary = config.FFMPEG_PATH || 'ffmpeg';
  const bitrate = options.bitrateKbps || 320;
  const startSec = Math.max(0, options.startSeconds || 0);

  // Array of arguments to prevent shell interpolation
  const args: string[] = [];

  if (startSec > 0) {
    args.push('-ss', startSec.toString());
  }

  args.push(
    '-i', options.filePath,
    '-vn',
    '-c:a', 'libmp3lame',
    '-b:a', `${bitrate}k`,
    '-f', 'mp3',
    'pipe:1'
  );

  activeTranscodesCount++;
  const proc = spawn(binary, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  let killed = false;
  const kill = () => {
    if (!killed) {
      killed = true;
      try {
        if (process.platform === 'win32' && proc.pid) {
          // Asynchronous non-blocking taskkill on Windows prevents event loop freeze
          exec(`taskkill /pid ${proc.pid} /t /f`, () => {});
        } else {
          proc.kill('SIGTERM');
        }
      } catch {
        try {
          proc.kill();
        } catch {
          // ignore
        }
      }
      activeTranscodesCount = Math.max(0, activeTranscodesCount - 1);
    }
  };

  proc.on('close', () => {
    if (!killed) {
      killed = true;
      activeTranscodesCount = Math.max(0, activeTranscodesCount - 1);
    }
  });

  proc.on('error', () => {
    kill();
  });

  return {
    stream: proc.stdout,
    kill,
    contentType: 'audio/mpeg',
  };
}
