import { forwardRef } from 'react';
import type { Part } from '../../domain/types';
import { partDisplay } from '../partAssets';

interface FieldCardProps {
  part: Part | null;
  /** ドラッグ中のカードが場札上に重なっている。 */
  active?: boolean;
  /** ドロップ受け入れ可能（手番＋ドラッグ中）。 */
  canDrop?: boolean;
  /** 同じ種類の場札の枚数。2以上なら重ね表示＋枚数バッジを出す。 */
  count?: number;
}

export const FieldCard = forwardRef<HTMLDivElement, FieldCardProps>(function FieldCard(
  { part, active = false, canDrop = false, count = 1 },
  ref,
) {
  const stacked = count > 1;
  const display = part ? partDisplay(part.kind) : null;
  return (
    <div
      ref={ref}
      className={`field-card${active ? ' is-active-drop' : ''}${canDrop ? ' can-drop' : ''}${stacked ? ' is-stacked' : ''}`}
      aria-live="polite"
    >
      {part && display ? (
        <>
          {display.imageUrl ? (
            <img className="field-card__img" src={display.imageUrl} alt={display.label} draggable={false} />
          ) : (
            <strong className={[...display.label].length > 1 ? 'is-word' : ''}>{display.label}</strong>
          )}
          {stacked && (
            <span className="field-card__count" aria-label={`${count}枚`}>
              ×{count}
            </span>
          )}
        </>
      ) : (
        <span className="field-card__empty">場札なし</span>
      )}
    </div>
  );
});
