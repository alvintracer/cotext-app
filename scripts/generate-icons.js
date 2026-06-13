import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgPath = path.resolve('public/favicon.svg');
const outDir = path.resolve('public');

async function generate() {
  const sizes = [192, 512];
  
  for (const size of sizes) {
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(path.join(outDir, `icon-${size}x${size}.png`));
    console.log(`Generated icon-${size}x${size}.png`);
  }

  // Apple touch icon
  await sharp(svgPath)
    .resize(180, 180)
    .png()
    .toFile(path.join(outDir, `apple-touch-icon.png`));
  console.log(`Generated apple-touch-icon.png`);
}

generate().catch(console.error);
