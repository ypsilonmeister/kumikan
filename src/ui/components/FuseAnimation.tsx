import type { Kanji } from '../../domain/types';
import { partReading } from '../../domain/recipes';

interface FuseAnimationProps {
  kanji: Kanji | null;
}

export function FuseAnimation({ kanji }: FuseAnimationProps) {
  if (!kanji) {
    return null;
  }

  // 演出は「左パーツ → 中央フラッシュ → 右パーツ」。
  // 現状レシピは 2 パーツだが、from が 2 個でなくても破綻しないようにする。
  // 部首は読みで表示（カードと一致させる）。
  const [left, right] = kanji.from.map((kind) => partReading(kind) ?? kind);

  const cls = (text: string) => `fusion__part${[...text].length > 1 ? ' is-word' : ''}`;

  return (
    <div className="fusion" aria-live="polite">
      {left !== undefined && <span className={cls(left)}>{left}</span>}
      <span className="fusion__flash">{kanji.char}</span>
      {right !== undefined && <span className={cls(right)}>{right}</span>}
    </div>
  );
}
