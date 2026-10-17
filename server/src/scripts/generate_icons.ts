import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

async function main() {
  const svgPath = path.resolve('client/public/icon.svg');
  if (!fs.existsSync(svgPath)) {
    console.error('icon.svg not found at:', svgPath);
    process.exit(1);
  }

  const svgBuffer = fs.readFileSync(svgPath);

  const out192 = path.resolve('client/public/icon-192.png');
  const out512 = path.resolve('client/public/icon-512.png');

  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(out192);
  console.log('Generated:', out192);

  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(out512);
  console.log('Generated:', out512);

  console.log('All PWA icons generated successfully!');
}

main().catch(console.error).finally(() => process.exit(0));
