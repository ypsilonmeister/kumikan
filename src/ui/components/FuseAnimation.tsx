/** 合体演出の表示データ。パーツは表示用文字列（部首はよみ）に解決済み。 */
export interface FusionDisplay {
  char: string;
  parts: string[];
}

interface FuseAnimationProps {
  fusion: FusionDisplay | null;
}

export function FuseAnimation({ fusion }: FuseAnimationProps) {
  if (!fusion) {
    return null;
  }

  // 演出は「左パーツ → 中央フラッシュ → 右パーツ」。
  // 現状レシピは 2 パーツだが、from が 2 個でなくても破綻しないようにする。
  // 部首は読みで表示（カードと一致させる）。
  const [left, right] = fusion.parts;

  const cls = (text: string) => `fusion__part${[...text].length > 1 ? ' is-word' : ''}`;

  return (
    <div className="fusion" aria-live="polite">
      {left !== undefined && <span className={cls(left)}>{left}</span>}
      <span className="fusion__flash">{fusion.char}</span>
      {right !== undefined && <span className={cls(right)}>{right}</span>}
    </div>
  );
}
