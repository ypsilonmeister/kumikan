import fs from 'fs';

const IDC_ARGS = {
  '⿰': 2, '⿱': 2, '⿴': 2, '⿵': 2, '⿶': 2, '⿷': 2, '⿸': 2, '⿹': 2, '⿺': 2, '⿻': 2,
  '⿲': 3, '⿳': 3
};

function parseIDS(tokens) {
  if (tokens.length === 0) return null;
  const token = tokens.shift();
  if (IDC_ARGS[token] !== undefined) {
    const numArgs = IDC_ARGS[token];
    const args = [];
    for (let i = 0; i < numArgs; i++) {
      const arg = parseIDS(tokens);
      if (!arg) return null;
      args.push(arg);
    }
    return { type: 'idc', idc: token, args };
  } else {
    if (token === '&') {
      let entity = '&';
      while (tokens.length > 0 && tokens[0] !== ';') {
        entity += tokens.shift();
      }
      if (tokens.length > 0) {
        entity += tokens.shift();
      }
      return { type: 'terminal', value: entity };
    }
    return { type: 'terminal', value: token };
  }
}

function parseIDSString(str) {
  const tokens = Array.from(str);
  return parseIDS(tokens);
}

function serializeIDS(node) {
  if (!node) return '';
  if (node.type === 'terminal') {
    return node.value;
  }
  return node.idc + node.args.map(serializeIDS).join('');
}

function isValidPart(part) {
  if (part === 'さんずい') return true;
  const chars = Array.from(part);
  if (chars.length !== 1) return false;
  const code = chars[0].codePointAt(0);

  // 許可する範囲:
  // CJK部首補助: U+2E80 - U+2EFF
  // 康煕部首: U+2F00 - U+2FDF
  // CJK統合漢字: U+4E00 - U+9FFF
  // CJK統合漢字拡張A: U+3400 - U+4DBF
  // CJK統合漢字拡張B: U+20000 - U+2A6DF
  const isRadical = (code >= 0x2E80 && code <= 0x2EFF) || (code >= 0x2F00 && code <= 0x2FDF);
  const isKanji = (code >= 0x4E00 && code <= 0x9FFF) || 
                  (code >= 0x3400 && code <= 0x4DBF) || 
                  (code >= 0x20000 && code <= 0x2A6DF);
  return isRadical || isKanji;
}

async function run() {
  // 1. 既存のレシピを recipes.ts からパース
  console.log('Parsing existing recipes from recipes.ts...');
  const recipesTs = fs.readFileSync('src/domain/recipes.ts', 'utf8');
  const existingRecipes = new Map(); // 漢字 -> [p1, p2]
  const existingPairs = new Set(); // "p1,p2" (sorted)
  
  // 'A,B': 'C' または "A,B": "C"
  const recipeRegex = /['"]([^'",]+),([^'",]+)['"]\s*:\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = recipeRegex.exec(recipesTs)) !== null) {
    const [, p1, p2, kanji] = match;
    existingRecipes.set(kanji.trim(), [p1.trim(), p2.trim()]);
    existingPairs.add([p1.trim(), p2.trim()].sort().join(','));
  }
  console.log(`Loaded ${existingRecipes.size} existing recipes from recipes.ts.`);

  // 2. 教育漢字の読み込み
  const kyoikuCsv = fs.readFileSync('scripts/kyoiku.csv', 'utf8');
  const kyoikuLines = kyoikuCsv.split('\n').map(l => l.trim()).filter(Boolean);
  const kyoikuKanji = new Set();
  const kanjiGrade = {};

  for (let i = 1; i < kyoikuLines.length; i++) {
    const [kanji, gradeStr] = kyoikuLines[i].split(',');
    if (kanji && gradeStr) {
      kyoikuKanji.add(kanji.trim());
      kanjiGrade[kanji.trim()] = parseInt(gradeStr, 10);
    }
  }
  console.log(`Loaded ${kyoikuKanji.size} education kanji.`);

  // 3. IDSの読み込み
  const idsText = fs.readFileSync('scripts/ids.txt', 'utf8');
  const idsLines = idsText.split('\n').map(l => l.trim()).filter(Boolean);
  const kanjiToIdsTree = {};
  const idsStrToKanji = {};

  for (const line of idsLines) {
    if (line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const kanji = parts[1].trim();
    const idsStr = parts[2].trim();

    const tree = parseIDSString(idsStr);
    if (!tree) continue;

    kanjiToIdsTree[kanji] = tree;

    // 逆引き登録
    const serialized = serializeIDS(tree);
    
    const existing = idsStrToKanji[serialized];
    if (!existing) {
      idsStrToKanji[serialized] = kanji;
    } else {
      const existingIsKyoiku = kyoikuKanji.has(existing);
      const newIsKyoiku = kyoikuKanji.has(kanji);
      if (newIsKyoiku && !existingIsKyoiku) {
        idsStrToKanji[serialized] = kanji;
      } else if (newIsKyoiku && existingIsKyoiku) {
        const existingGrade = kanjiGrade[existing] || 99;
        const newGrade = kanjiGrade[kanji] || 99;
        if (newGrade < existingGrade) {
          idsStrToKanji[serialized] = kanji;
        }
      }
    }
  }
  console.log(`Loaded IDS database. Reverse map size: ${Object.keys(idsStrToKanji).length}`);

  // 4. 簡略化処理
  function simplify(node, targetKanji) {
    if (!node) return null;
    if (node.type === 'terminal') {
      return node;
    }
    node.args = node.args.map(n => simplify(n, targetKanji));

    const serialized = serializeIDS(node);
    const resolvedKanji = idsStrToKanji[serialized];
    
    if (resolvedKanji && resolvedKanji !== targetKanji) {
      return { type: 'terminal', value: resolvedKanji };
    }
    return node;
  }

  // 5. レシピの抽出と分類
  const suggestedRecipes = [];
  const cannotDecompose = [];

  for (const kanji of kyoikuKanji) {
    const tree = kanjiToIdsTree[kanji];
    if (!tree) {
      cannotDecompose.push({ kanji, reason: 'No IDS data' });
      continue;
    }

    const simplified = simplify(JSON.parse(JSON.stringify(tree)), kanji);

    if (simplified.type === 'idc' && IDC_ARGS[simplified.idc] === 2) {
      const [arg1, arg2] = simplified.args;
      if (arg1.type === 'terminal' && arg2.type === 'terminal') {
        let val1 = arg1.value;
        let val2 = arg2.value;

        // さんずい (氵) の特別処理
        if (val1 === '氵') val1 = 'さんずい';
        if (val2 === '氵') val2 = 'さんずい';

        // 有効なパーツかチェック
        if (!isValidPart(val1) || !isValidPart(val2)) {
          cannotDecompose.push({
            kanji,
            reason: `Invalid parts: ${val1}, ${val2}`,
            originalIds: serializeIDS(tree),
            simplified: serializeIDS(simplified)
          });
          continue;
        }

        const isExisting = existingRecipes.has(kanji);
        let status = 'new'; // new, existing_match, existing_mismatch
        if (isExisting) {
          const [ep1, ep2] = existingRecipes.get(kanji);
          const existingKey = [ep1, ep2].sort().join(',');
          const proposedKey = [val1, val2].sort().join(',');
          if (existingKey === proposedKey) {
            status = 'existing_match';
          } else {
            status = 'existing_mismatch';
          }
        }

        suggestedRecipes.push({
          kanji,
          grade: kanjiGrade[kanji] || 99,
          parts: [val1, val2],
          idc: simplified.idc,
          status,
          existingParts: isExisting ? existingRecipes.get(kanji) : null
        });
        continue;
      }
    }
    cannotDecompose.push({ 
      kanji, 
      reason: 'Cannot decompose into 2 simple characters', 
      originalIds: serializeIDS(tree),
      simplified: serializeIDS(simplified) 
    });
  }

  console.log(`Total processed: ${kyoikuKanji.size}`);
  console.log(`Suggested Recipes (total): ${suggestedRecipes.length}`);
  console.log(`- New Recipes: ${suggestedRecipes.filter(r => r.status === 'new').length}`);
  console.log(`- Existing Match: ${suggestedRecipes.filter(r => r.status === 'existing_match').length}`);
  console.log(`- Existing Mismatch: ${suggestedRecipes.filter(r => r.status === 'existing_mismatch').length}`);
  console.log(`Could not decompose: ${cannotDecompose.length}`);

  // 6. 学年ごとにソート
  suggestedRecipes.sort((a, b) => {
    if (a.grade !== b.grade) return a.grade - b.grade;
    return a.kanji.localeCompare(b.kanji);
  });

  const sourceMetadata = fs.existsSync('scripts/data_sources.json')
    ? JSON.parse(fs.readFileSync('scripts/data_sources.json', 'utf8'))
    : null;

  // 保存用オブジェクトの構築
  const outputData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      generator: 'scripts/process_kanji.mjs',
      sourceMetadata,
      note: 'recipes は IDS から機械抽出した未フィルタ候補です。辞書へ直接追加する前に scripts/filter-recipes.mjs の出力や目視で確認してください。',
    },
    summary: {
      totalKyoikuKanji: kyoikuKanji.size,
      suggestedTotal: suggestedRecipes.length,
      newRecipes: suggestedRecipes.filter(r => r.status === 'new').length,
      existingMatch: suggestedRecipes.filter(r => r.status === 'existing_match').length,
      existingMismatch: suggestedRecipes.filter(r => r.status === 'existing_mismatch').length,
      cannotDecompose: cannotDecompose.length
    },
    recipes: suggestedRecipes
  };

  fs.writeFileSync('scripts/recipes_suggested.json', JSON.stringify(outputData, null, 2));
  fs.writeFileSync('scripts/cannot_decompose.json', JSON.stringify(cannotDecompose, null, 2));

  // Markdown レポートの作成
  let md = '# 小学校教育漢字 合成レシピ提案データ\n\n';
  md += 'このファイルは、ゲームの漢字辞書（`recipes.ts`）に小学6年生までの漢字を追加・拡充するために、IDSデータベースから自動抽出した未フィルタ候補データです。\n';
  md += '字形断片や子ども向けカードにしづらいパーツも含まれるため、辞書へ直接追加せず、`scripts/filter-recipes.mjs` の出力や目視レビューを通してください。\n\n';

  if (sourceMetadata) {
    md += '## データ出典\n\n';
    md += `生成日時: ${sourceMetadata.generatedAt}\n\n`;
    md += '| データ | リポジトリ | commit | ファイル | ライセンス |\n';
    md += '| :--- | :--- | :--- | :--- | :--- |\n';
    for (const [key, source] of Object.entries(sourceMetadata.sources ?? {})) {
      const shortCommit = source.commit ? source.commit.slice(0, 12) : 'unknown';
      const license = source.license?.spdxId || source.license?.name || 'unknown';
      md += `| ${key} | ${source.repository ?? ''} | ${shortCommit} | ${source.path ?? ''} | ${license} |\n`;
    }
    md += '\n';
  }

  md += '## 統計\n\n';
  md += `| 項目 | 件数 | 割合 |\n`;
  md += `| :--- | :---: | :---: |\n`;
  md += `| 対象教育漢字 | ${kyoikuKanji.size} 字 | 100% |\n`;
  md += `| 抽出されたレシピ (合計) | ${suggestedRecipes.length} 字 | ${(suggestedRecipes.length / kyoikuKanji.size * 100).toFixed(1)}% |\n`;
  md += `| ── 新規追加候補 (New) | **${suggestedRecipes.filter(r => r.status === 'new').length}** 字 | - |\n`;
  md += `| ── 既存定義と一致 (Match) | ${suggestedRecipes.filter(r => r.status === 'existing_match').length} 字 | - |\n`;
  md += `| ── 既存定義と不一致 (Mismatch) | ${suggestedRecipes.filter(r => r.status === 'existing_mismatch').length} 字 | - |\n`;
  md += `| 分解できなかった漢字 | ${cannotDecompose.length} 字 | ${(cannotDecompose.length / kyoikuKanji.size * 100).toFixed(1)}% |\n\n`;

  md += '> [!NOTE]\n';
  md += '> **既存定義と不一致 (Mismatch)** の例は、例えば自動抽出では `時 = 日 + 寺` となったが、既存辞書で異なるパーツが定義されているケースなどです。\n';
  md += '> `New` は既存辞書に未登録という意味であり、品質保証済みという意味ではありません。`scripts/accepted_recipes.txt` または目視レビュー済みの候補だけを追加してください。\n\n';

  md += '## 新規追加レシピ候補 (New) 一覧\n\n';
  md += '学年順の機械抽出候補です。TypeScriptコード列は確認作業用で、未レビューのまま一括追加しないでください。\n\n';

  for (let grade = 1; grade <= 6; grade++) {
    const list = suggestedRecipes.filter(r => r.grade === grade && r.status === 'new');
    if (list.length === 0) continue;

    md += `### 小学${grade}年生 (新規 ${list.length} 件)\n\n`;
    md += '| 漢字 | パーツ1 | パーツ2 | 配置関係 | TypeScriptコピペ用 |\n';
    md += '| :---: | :---: | :---: | :---: | :--- |\n';
    for (const r of list) {
      const relation = getRelationName(r.idc);
      const tsCode = `'${r.parts[0]},${r.parts[1]}': '${r.kanji}',`;
      md += `| **${r.kanji}** | ${r.parts[0]} | ${r.parts[1]} | ${relation} | \`${tsCode}\` |\n`;
    }
    md += '\n';
  }

  md += '## 既存の定義と不一致 (Mismatch) 一覧\n\n';
  md += '既存の辞書に登録されていますが、自動分解結果と異なるものです。既存の定義が正しい（または直感的）である場合が多いため、確認用としてご活用ください。\n\n';
  
  const mismatchList = suggestedRecipes.filter(r => r.status === 'existing_mismatch');
  if (mismatchList.length > 0) {
    md += '| 漢字 | 既存のパーツ | 抽出されたパーツ | 配置 | 既存の定義 |\n';
    md += '| :---: | :---: | :---: | :---: | :--- |\n';
    for (const r of mismatchList) {
      const relation = getRelationName(r.idc);
      md += `| **${r.kanji}** | \`${r.existingParts.join(',')}\` | \`${r.parts.join(',')}\` | ${relation} | |\n`;
    }
    md += '\n';
  } else {
    md += '不一致のレシピはありません。\n\n';
  }

  md += '## 既存の定義と一致 (Match) 一覧\n\n';
  md += 'すでに `recipes.ts` に正しく登録されている漢字です。\n\n';
  const matchList = suggestedRecipes.filter(r => r.status === 'existing_match');
  md += matchList.map(r => r.kanji).join(' ');
  md += '\n';

  fs.writeFileSync('scripts/recipes_suggested.md', md);
  console.log('Saved updated recipes_suggested.md and recipes_suggested.json');
}

function getRelationName(idc) {
  switch (idc) {
    case '⿰': return '左右 (⿰)';
    case '⿱': return '上下 (⿱)';
    case '⿴': return '全囲 (⿴)';
    case '⿵': return '上囲 (⿵)';
    case '⿶': return '下囲 (⿶)';
    case '⿷': return '左囲 (⿷)';
    case '⿸': return '左上囲 (⿸)';
    case '⿹': return '右上囲 (⿹)';
    case '⿺': return '左下囲 (⿺)';
    case '⿻': return '交差 (⿻)';
    default: return idc;
  }
}

run();




