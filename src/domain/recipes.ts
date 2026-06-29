const RAW_KANJI_RECIPES: Record<string, string> = {
  '一,口': '日',
  '一,日': '旦',
  '亻,半': '伴',
  '亻,可': '何',
  '亻,木': '休',
  '亻,本': '体',
  '亻,寺': '侍',
  '亻,言': '信',
  '力,口': '加',
  '十,口': '古',
  '口,鳥': '鳴',
  '囗,井': '囲',
  '囗,口': '回',
  '囗,古': '固',
  '囗,大': '因',
  '囗,木': '困',
  '囗,玉': '国',
  '土,也': '地',
  '可,さんずい': '河',
  'さんずい,去': '法',
  'さんずい,工': '江',
  'さんずい,毎': '海',
  'さんずい,羊': '洋',
  'さんずい,青': '清',
  '吾,言': '語',
  '女,台': '始',
  '女,市': '姉',
  '女,子': '好',
  '女,未': '妹',
  '寸,木': '村',
  '忄,亡': '忙',
  '忄,生': '性',
  '忄,青': '情',
  '心,音': '意',
  '日,寺': '時',
  '日,生': '星',
  '日,月': '明',
  '日,青': '晴',
  '木,交': '校',
  '木,木': '林',
  '木,目': '相',
  '木,公': '松',
  '木,几': '机',
  '木,月': '棚',
  '木,毎': '梅',
  '火,丁': '灯',
  '火,山': '炭',
  '火,田': '畑',
  '田,力': '男',
  '禾,斗': '科',
  '禾,火': '秋',
  '糸,田': '細',
  '糸,色': '絶',
  '糸,冬': '終',
  '糸,者': '緒',
  '艹,化': '花',
  '艹,早': '草',
  '艹,田': '苗',
  '言,十': '計',
  '言,寸': '討',
  '言,己': '記',
  '言,方': '訪',
  '言,寺': '詩',
  '言,売': '読',
  '貝,反': '販',
  '貝,才': '財',
  '辶,斤': '近',
  '辶,車': '連',
  '辶,首': '道',
  '辶,束': '速',
  '辶,甬': '通',
  '辶,周': '週',
  '辶,軍': '運',
  '車,云': '転',
  '金,十': '針',
  '金,同': '銅',
  '金,失': '鉄',
  '金,艮': '銀',
  '門,口': '問',
  '門,日': '間',
  '門,耳': '聞',
  '雨,下': '雫',
  '雨,田': '雷',
  '雨,云': '雲',
  '馬,戸': '駅',
};

export function recipeKey(kindA: string, kindB: string): string {
  return [kindA, kindB].sort().join(',');
}

export const KANJI_RECIPES: Record<string, string> = Object.fromEntries(
  Object.entries(RAW_KANJI_RECIPES).map(([key, value]) => {
    const [kindA, kindB] = key.split(',');
    return [recipeKey(kindA, kindB), value];
  }),
);

export function checkCombination(kindA: string, kindB: string): string | null {
  return KANJI_RECIPES[recipeKey(kindA, kindB)] ?? null;
}

export function recipeParts(): string[] {
  return Object.keys(KANJI_RECIPES).flatMap((key) => key.split(','));
}

/**
 * 単体では読みが分かりにくい部首の「よみ」。
 * カード表示でグリフと併記して、子どもでも識別できるようにする。
 * （しんにょう等は font により形が変わって見えるため、よみで明示する）
 */
export const PART_READINGS: Record<string, string> = {
  '辶': 'しんにょう',
  '亻': 'にんべん',
  '忄': 'りっしんべん',
  '囗': 'くにがまえ',
  '艹': 'くさかんむり',
  '禾': 'のぎへん',
  'さんずい': 'さんずい',
};

/** 部首によみがあれば返す（無ければ null）。 */
export function partReading(kind: string): string | null {
  return PART_READINGS[kind] ?? null;
}

/**
 * 単体では字形が崩れやすい部首の画像（public/parts/ 配下のファイル名）。
 * 表示時に画像を優先することで、フォント依存の見え方の差をなくす。
 */
const PART_IMAGES: Record<string, string> = {
  '辶': 'shinnyou.svg',
  '亻': 'ninben.svg',
  '忄': 'risshinben.svg',
  '囗': 'kunigamae.svg',
  '艹': 'kusakanmuri.svg',
  '禾': 'nogihen.svg',
};

/** 部首の画像ファイル名があれば返す（無ければ null）。 */
export function partImageFile(kind: string): string | null {
  return PART_IMAGES[kind] ?? null;
}


