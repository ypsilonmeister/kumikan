import { RAW_KANJI_RECIPES } from './recipes.data';

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

/** 1 ゲームで使う既定のレシピ数（山札が膨らみすぎないよう抽選する）。 */
export const RECIPES_PER_GAME = 40;

/**
 * 辞書からランダムに count 個のレシピを選び、それらのパーツ列（重複あり）を返す。
 * これを山札の素にすることで、語彙は豊富に保ちつつ 1 ゲームの山札を適量にする。
 * 同じパーツが複数レシピに出ればその数だけ重複し、組み合わせが成立しやすくなる。
 */
export function pickRecipeParts(count = RECIPES_PER_GAME, random: () => number = Math.random): string[] {
  const keys = Object.keys(KANJI_RECIPES);
  // Fisher-Yates で先頭 count 個を抽選。
  const shuffled = [...keys];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const chosen = shuffled.slice(0, Math.min(count, shuffled.length));
  return chosen.flatMap((key) => key.split(','));
}
