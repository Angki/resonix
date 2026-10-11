import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

// Load .env from server directory or root
dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const envSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default('file:./data/library.db'),
  APP_BASE_URL: z.string().default('http://127.0.0.1:3000'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters long'),
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(16, 'CREDENTIAL_ENCRYPTION_KEY must be at least 16 characters long'),
  LASTFM_API_KEY: z.string().optional().default(''),
  LASTFM_API_SECRET: z.string().optional().default(''),
  LASTFM_USERNAME: z.string().optional().default(''),
  LASTFM_PASSWORD: z.string().optional().default(''),
  LASTFM_SESSION_KEY: z.string().optional().default(''),
  FFMPEG_PATH: z.string().optional().default(''),
  MUSICBEE_DISCOVERY_PATH: z.string().default('C:/Users/angki/Music'),
  LIBRARY_ROOTS_JSON: z.string().default('["D:/Music/RAW BLACK METAL","D:/Music/GORE","D:/Music/NOISE","D:/Music/DUNGEON SYNTHS"]'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

let libraryRoots: string[] = [];
try {
  libraryRoots = JSON.parse(parsedEnv.data.LIBRARY_ROOTS_JSON);
} catch {
  libraryRoots = [
    'D:/Music/RAW BLACK METAL',
    'D:/Music/GORE',
    'D:/Music/NOISE',
    'D:/Music/DUNGEON SYNTHS',
  ];
}

export const config = {
  ...parsedEnv.data,
  libraryRoots: libraryRoots.map(r => path.normalize(r.trim())),
  cacheDir: path.join(rootDir, 'cache'),
  artworkCacheDir: path.join(rootDir, 'cache', 'artwork'),
  dataDir: path.join(rootDir, 'data'),
  rootDir,
};
