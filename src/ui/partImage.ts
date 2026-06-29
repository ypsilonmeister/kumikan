/** 部首画像ファイル名を、配信 base を考慮した URL に変換する。 */
export function partImageUrl(file: string): string {
  // import.meta.env.BASE_URL は末尾スラッシュ付き（例: "/kumikan/"）。
  return `${import.meta.env.BASE_URL}parts/${file}`;
}
