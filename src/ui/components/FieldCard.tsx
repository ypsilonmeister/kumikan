import { forwardRef } from 'react';
import type { Part } from '../../domain/types';

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
        <>
          <span className="field-card__label">場札</span>
          <strong>{part.label}</strong>
        </>
      ) : (
        <span className="field-card__empty">山札が空です</span>
      )}
    </div>
  );
});
