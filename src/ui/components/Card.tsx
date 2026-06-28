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
      <span>{part.label}</span>
    </button>
  );
}
