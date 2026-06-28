// PWA アイコン生成スクリプト（public/favicon.svg を元に PNG を書き出す）。
// 使い方: node scripts/gen-icons.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');

const bg = '#1f6f5b';
const fg = '#f4f2ed';

// 通常アイコン: 角丸の四角に「漢」。
function squareSvg(size, glyphRatio) {
  const fontSize = Math.round(size * glyphRatio);
  const y = Math.round(size * 0.585);
  const radius = Math.round(size * 0.1875);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>
    <text x="50%" y="${y}" text-anchor="middle" fill="${fg}"
      font-family="'Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif" font-weight="900"
      font-size="${fontSize}">漢</text>
  </svg>`;
}

// maskable: セーフゾーン確保のため背景全面 + グリフ小さめ。
function maskableSvg(size) {
  const fontSize = Math.round(size * 0.5);
  const y = Math.round(size * 0.66);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${bg}"/>
    <text x="50%" y="${y}" text-anchor="middle" fill="${fg}"
      font-family="'Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif" font-weight="900"
      font-size="${fontSize}">漢</text>
  </svg>`;
}

async function render(svg, file) {
  await sharp(Buffer.from(svg)).png().toFile(join(outDir, file));
  console.log('wrote', file);
}

await mkdir(outDir, { recursive: true });
await render(squareSvg(192, 0.6), 'icon-192.png');
await render(squareSvg(512, 0.6), 'icon-512.png');
await render(maskableSvg(512), 'icon-512-maskable.png');
await render(squareSvg(180, 0.62), 'apple-touch-icon.png');
console.log('done');
