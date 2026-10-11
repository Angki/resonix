import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const src = path.join(root, 'client', 'dist');
const dest = path.join(root, 'server', 'public');

if (fs.existsSync(src)) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`Copied client build from ${src} to ${dest}`);
} else {
  console.warn(`Source folder ${src} does not exist. Skipping copy.`);
}
