/**
 * 単体では読みが分かりにくい部首の「よみ」。
 * カード表示でグリフと併記して、子どもでも識別できるようにする。
 * （しんにょう等は font により形が変わって見えるため、よみで明示する）
 */
const PART_READINGS: Record<string, string> = {
  '辶': 'しんにょう',
  '亻': 'にんべん',
  '忄': 'りっしんべん',
  '囗': 'くにがまえ',
  '艹': 'くさかんむり',
  '禾': 'のぎへん',
  'さんずい': 'さんずい',
};

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

/** 部首画像ファイル名を、配信 base を考慮した URL に変換する。 */
function partImageUrl(file: string): string {
  // import.meta.env.BASE_URL は末尾スラッシュ付き（例: "/kumikan/"）。
  return `${import.meta.env.BASE_URL}parts/${file}`;
}

/** 部首によみがあれば返す（無ければ null）。 */
export function partReading(kind: string): string | null {
  return PART_READINGS[kind] ?? null;
}

/** パーツの表示情報。kind から表示ラベル・よみ・画像 URL を解決する。 */
export interface PartDisplay {
  /** 主表示。よみのある部首はよみ、それ以外は kind のグリフ。 */
  label: string;
  reading?: string;
  /** 部首画像の URL（public/parts/ 配下）。あれば文字でなく画像で表示。 */
  imageUrl?: string;
}

export function partDisplay(kind: string): PartDisplay {
  const reading = PART_READINGS[kind] ?? undefined;
  const imageFile = PART_IMAGES[kind];
  return {
    label: reading ?? kind,
    reading,
    imageUrl: imageFile ? partImageUrl(imageFile) : undefined,
  };
}
