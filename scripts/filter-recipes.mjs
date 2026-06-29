// Gemini の提案レシピ（recipes_suggested.md）から、パズルに適した良質なものだけを
// 抽出する。基準: 両パーツが「認識できるパーツ」であること。
//
// 認識できるパーツ =
//   1) 既存辞書に登場するパーツ
//   2) 教育漢字として単体で読める字（提案データ内で「結果」になっている漢字）
//   3) よみのある部首（PART_READINGS 相当）
//
// サロゲートペア（𠂇 等）や正体不明の字形断片（龶 等）を含むレシピは除外する。
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mdPath = join(root, 'scripts', 'recipes_suggested.md');
const recipesPath = join(root, 'src', 'domain', 'recipes.ts');
const kyoikuPath = join(root, 'scripts', 'kyoiku.csv');

// --- 教育漢字 1026 字（単体で読める＝パーツとして許容）---
const kyoikuCsv = await readFile(kyoikuPath, 'utf8');
const kyoiku = new Set(
  kyoikuCsv
    .trim()
    .split(/\r?\n/)
    .slice(1) // ヘッダ除去
    .map((line) => line.split(',')[0]),
);

// --- 既存辞書のパーツと既存キーを取得 ---
const recipesSrc = await readFile(recipesPath, 'utf8');
const rawBlock = recipesSrc.slice(
  recipesSrc.indexOf('RAW_KANJI_RECIPES'),
  recipesSrc.indexOf('};', recipesSrc.indexOf('RAW_KANJI_RECIPES')),
);
const existingKeys = new Set();
const existingParts = new Set();
for (const m of rawBlock.matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)) {
  const [a, b] = m[1].split(',');
  const sorted = [a, b].sort().join(',');
  existingKeys.add(sorted);
  existingParts.add(a);
  existingParts.add(b);
}

// よみのある部首（recipes.ts の PART_READINGS と一致させる）
const readingRadicals = ['辶', '亻', '忄', '囗', '艹', '禾', 'さんずい'];

// --- 提案 md をパース（TypeScript コピペ列から 'a,b': 'kanji' を取る）---
const md = await readFile(mdPath, 'utf8');
const suggestions = [];
for (const m of md.matchAll(/`'([^']+)'\s*:\s*'([^']+)',`/g)) {
  const key = m[1];
  const kanji = m[2];
  suggestions.push({ key, kanji });
}

// 結果として現れる漢字（=単体で読める学習漢字）を許容パーツに含める。
// 提案の結果 + 既存辞書の結果の両方を「読める単体漢字」とみなす。
const existingResults = [];
for (const m of rawBlock.matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)) {
  existingResults.push(m[2]);
}
const resultKanji = new Set([...suggestions.map((s) => s.kanji), ...existingResults]);

// サロゲートペア（BMP 外）や CJK 拡張領域の断片を弾く。
function isSurrogate(str) {
  for (const ch of str) {
    if (ch.codePointAt(0) > 0xffff) return true;
  }
  return false;
}

// 許容パーツ集合 = 教育漢字 ∪ 既存パーツ ∪ 結果漢字 ∪ よみ部首
const allowed = new Set([...kyoiku, ...existingParts, ...resultKanji, ...readingRadicals]);

function partOk(part) {
  if (isSurrogate(part)) return false;
  if (allowed.has(part)) return true;
  return false;
}

const accepted = [];
const rejected = [];
const seen = new Set();
for (const { key, kanji } of suggestions) {
  const [a, b] = key.split(',');
  const sorted = [a, b].sort().join(',');
  if (existingKeys.has(sorted) || seen.has(sorted)) continue; // 重複・既存は除外
  if (partOk(a) && partOk(b)) {
    accepted.push({ key, kanji });
    seen.add(sorted);
  } else {
    rejected.push({ key, kanji, why: [a, b].filter((p) => !partOk(p)).join('/') });
  }
}

console.log('提案総数:', suggestions.length);
console.log('採用:', accepted.length);
console.log('除外:', rejected.length);
console.log('\n--- 採用レシピ（recipes.ts 追記用）---');
const lines = accepted.map(({ key, kanji }) => `  '${key}': '${kanji}',`).join('\n');
await writeFile(join(root, 'scripts', 'accepted_recipes.txt'), lines + '\n', 'utf8');
console.log('→ scripts/accepted_recipes.txt に書き出し');

console.log('\n--- 除外サンプル（先頭30件、理由=表示不可/未知のパーツ）---');
for (const r of rejected.slice(0, 30)) {
  console.log(`  ${r.kanji}: ${r.key}  (除外パーツ: ${r.why})`);
}
