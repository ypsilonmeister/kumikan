// 部首パーツの SVG を生成する（public/parts/<name>.svg）。
// 単体では読みにくい部首を、大きなグリフ＋よみ で表示するためのアセット。
// 使い方: node scripts/gen-part-svgs.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'parts');

// kind（照合キー） → { file, reading }
const PARTS = [
  { kind: '辶', file: 'shinnyou', reading: 'しんにょう' },
  { kind: '亻', file: 'ninben', reading: 'にんべん' },
  { kind: '忄', file: 'risshinben', reading: 'りっしんべん' },
  { kind: '囗', file: 'kunigamae', reading: 'くにがまえ' },
  { kind: '艹', file: 'kusakanmuri', reading: 'くさかんむり' },
  { kind: '禾', file: 'nogihen', reading: 'のぎへん' },
];

const FONT =
  "'Hiragino Mincho ProN','Yu Mincho','YuMincho','MS Mincho',serif";

function svg({ kind, reading }) {
  // 200x250（カードの 4:5 比）。上にグリフ、下によみ。
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 250" role="img" aria-label="${reading}">
  <rect width="200" height="250" fill="none"/>
  <text x="100" y="150" text-anchor="middle" font-family="${FONT}" font-weight="700"
    font-size="150" fill="#18211f">${kind}</text>
  <text x="100" y="225" text-anchor="middle" font-family="sans-serif" font-weight="700"
    font-size="26" fill="#6b5b45">${reading}</text>
</svg>
`;
}

await mkdir(outDir, { recursive: true });
for (const part of PARTS) {
  await writeFile(join(outDir, `${part.file}.svg`), svg(part), 'utf8');
  console.log('wrote', `${part.file}.svg`);
}
console.log('done');
