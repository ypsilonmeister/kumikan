import type { PointerEvent } from 'react';
import type { Part } from '../../domain/types';

interface CardProps {
  part: Part;
  selected?: boolean;
  disabled?: boolean;
  dragging?: boolean;
  /** ポインタ操作の起点。タップ/ドラッグの判定は呼び出し側が行う。 */
  onPointerDown?: (part: Part, event: PointerEvent<HTMLButtonElement>) => void;
}

export function Card({ part, selected = false, disabled = false, dragging = false, onPointerDown }: CardProps) {
  // 1 文字（漢字グリフ）は大きく、複数文字（よみ）は小さく表示する。
  const isWord = [...part.label].length > 1;
  return (
    <button
      className={`kanji-card${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`}
      type="button"
      disabled={disabled}
      // ドラッグ中の誤スクロール防止。タッチでも pointermove を受け取れるようにする。
      style={{ touchAction: 'none' }}
      onPointerDown={(event) => onPointerDown?.(part, event)}
      aria-label={`${part.label} のカード`}
    >
      <span className={isWord ? 'is-word' : ''}>{part.label}</span>
    </button>
  );
}
