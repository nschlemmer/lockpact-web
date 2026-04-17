import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFile } from 'node:fs/promises';

// Source assets (at repo root, one level up from lockpact-web/).
// 1-4.png = pre-rounded (use for PNG favicons + Android).
// 2-4.png = full-bleed square (use for apple-touch-icon; iOS applies its own mask).
const preRounded = '../Logo icons/1-4.png';
const fullBleed = '../Logo icons/2-4.png';

async function resize(src, size, out) {
  await sharp(src).resize(size, size, { fit: 'cover' }).png().toFile(out);
  console.log(`Generated ${out}`);
}

// PNG browser favicons
await resize(preRounded, 16, 'public/favicon-16x16.png');
await resize(preRounded, 32, 'public/favicon-32x32.png');
await resize(preRounded, 96, 'public/favicon-96x96.png');

// Android manifest icons
await resize(preRounded, 192, 'public/android-chrome-192x192.png');
await resize(preRounded, 512, 'public/android-chrome-512x512.png');

// Apple touch icon — full-bleed; iOS adds corner mask automatically
await resize(fullBleed, 180, 'public/apple-touch-icon.png');

// Multi-size favicon.ico (16/32/48) for legacy browsers
const ico16 = await sharp(preRounded).resize(16, 16).png().toBuffer();
const ico32 = await sharp(preRounded).resize(32, 32).png().toBuffer();
const ico48 = await sharp(preRounded).resize(48, 48).png().toBuffer();
const icoBuffer = await pngToIco([ico16, ico32, ico48]);
await writeFile('public/favicon.ico', icoBuffer);
console.log('Generated public/favicon.ico (16/32/48)');
