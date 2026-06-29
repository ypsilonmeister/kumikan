import { forwardRef } from 'react';
import type { Part } from '../../domain/types';
import { partImageUrl } from '../partImage';

interface FieldCardProps {
  part: Part | null;
  /** ドラッグ中のカードが場札上に重なっている。 */
  active?: boolean;
  /** ドロップ受け入れ可能（手番＋ドラッグ中）。 */
  canDrop?: boolean;
}

export const FieldCard = forwardRef<HTMLDivElement, FieldCardProps>(function FieldCard(
  { part, active = false, canDrop = false },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`field-card${active ? ' is-active-drop' : ''}${canDrop ? ' can-drop' : ''}`}
      aria-live="polite"
    >
      {part ? (
        part.image ? (
          <img className="field-card__img" src={partImageUrl(part.image)} alt={part.label} draggable={false} />
        ) : (
          <strong className={[...part.label].length > 1 ? 'is-word' : ''}>{part.label}</strong>
        )
      ) : (
        <span className="field-card__empty">場札なし</span>
      )}
    </div>
  );
});
