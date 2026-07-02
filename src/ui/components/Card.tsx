import type { PointerEvent } from 'react';
import type { Part } from '../../domain/types';
import { partDisplay } from '../partAssets';

interface CardProps {
  part: Part;
  selected?: boolean;
  disabled?: boolean;
  dragging?: boolean;
  /** ポインタ操作の起点。タップ/ドラッグの判定は呼び出し側が行う。 */
  onPointerDown?: (part: Part, event: PointerEvent<HTMLButtonElement>) => void;
}

export function Card({ part, selected = false, disabled = false, dragging = false, onPointerDown }: CardProps) {
  const display = partDisplay(part.kind);
  // 1 文字（漢字グリフ）は大きく、複数文字（よみ）は小さく表示する。
  const isWord = [...display.label].length > 1;
  return (
    <button
      className={`kanji-card${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`}
      type="button"
      disabled={disabled}
      // ドラッグ中の誤スクロール防止。タッチでも pointermove を受け取れるようにする。
      style={{ touchAction: 'none' }}
      onPointerDown={(event) => onPointerDown?.(part, event)}
      aria-label={`${display.label} のカード`}
    >
      {display.imageUrl ? (
        <img className="kanji-card__img" src={display.imageUrl} alt={display.label} draggable={false} />
      ) : (
        <span className={isWord ? 'is-word' : ''}>{display.label}</span>
      )}
    </button>
  );
}
