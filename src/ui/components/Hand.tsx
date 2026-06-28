import type { PointerEvent } from 'react';
import type { Part } from '../../domain/types';
import { Card } from './Card';

interface HandProps {
  parts: Part[];
  disabled?: boolean;
  draggingPartId?: string | null;
  onPointerDown?: (part: Part, event: PointerEvent<HTMLButtonElement>) => void;
}

export function Hand({ parts, disabled = false, draggingPartId = null, onPointerDown }: HandProps) {
  return (
    <div className="hand" aria-label="手札">
      {parts.map((part) => (
        <Card
          key={part.id}
          part={part}
          disabled={disabled}
          dragging={draggingPartId === part.id}
          onPointerDown={onPointerDown}
        />
      ))}
    </div>
  );
}
