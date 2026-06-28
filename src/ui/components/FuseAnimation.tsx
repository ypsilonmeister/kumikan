import type { Kanji } from '../../domain/types';

interface FuseAnimationProps {
  kanji: Kanji | null;
}

export function FuseAnimation({ kanji }: FuseAnimationProps) {
  if (!kanji) {
    return null;
  }

  // 演出は「左パーツ → 中央フラッシュ → 右パーツ」。
  // 現状レシピは 2 パーツだが、from が 2 個でなくても破綻しないようにする。
  const [left, right] = kanji.from;

  return (
    <div className="fusion" aria-live="polite">
      {left !== undefined && <span className="fusion__part">{left}</span>}
      <span className="fusion__flash">{kanji.char}</span>
      {right !== undefined && <span className="fusion__part">{right}</span>}
    </div>
  );
}
