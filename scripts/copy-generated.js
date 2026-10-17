import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const genSrc = path.join(root, 'server', 'src', 'generated');
const genDest = path.join(root, 'server', 'dist', 'generated');

if (fs.existsSync(genSrc)) {
  fs.mkdirSync(genDest, { recursive: true });
  try {
    fs.cpSync(genSrc, genDest, { recursive: true, force: true });
    console.log(`Copied generated prisma from ${genSrc} to ${genDest}`);
  } catch (err) {
    if (err.code === 'EPIPE' || err.code === 'EBUSY' || err.errno === 32) {
      console.warn(`[WARN] Generated files in ${genDest} are currently locked by a running node process; using existing generated build.`);
    } else {
      throw err;
    }
  }
}
