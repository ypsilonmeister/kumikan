import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Kanji, Part, PublicGameState } from '../../domain/types';
import { FieldCard } from '../components/FieldCard';
import { FuseAnimation } from '../components/FuseAnimation';
import { Hand } from '../components/Hand';

interface GameScreenProps {
  view: PublicGameState;
  /** 操作主体（ローカル=現在の手番、オンライン=自分）の playerId。 */
  viewerId: number;
  notice: {
    kind: string;
    text: string;
  };
  fusion: Kanji | null;
  onSubmit: (part: Part) => void;
  onPass: () => void;
  onHint: () => void;
  onRestart: () => void;
}

/** タップとドラッグを分ける移動量しきい値（px）。 */
const DRAG_THRESHOLD = 8;

interface Ghost {
  label: string;
  x: number;
  y: number;
}

export function GameScreen({
  view,
  viewerId,
  notice,
  fusion,
  onSubmit,
  onPass,
  onHint,
  onRestart,
}: GameScreenProps) {
  const [draggingPartId, setDraggingPartId] = useState<string | null>(null);
  const [isOverField, setIsOverField] = useState(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);

  const isFinished = view.phase === 'finished';
  const winner = view.players.find((player) => player.id === view.winnerId);
  const currentPlayer = view.players.find((player) => player.id === view.currentPlayerId);
  const viewer = view.players.find((player) => player.id === viewerId);
  const isMyTurn = view.currentPlayerId === viewerId;
  const canAct = !isFinished && isMyTurn && !!view.field;
  const draggedPart = useMemo(
    () => view.hand.find((part) => part.id === draggingPartId) ?? null,
    [draggingPartId, view.hand],
  );

  // 進行中のポインタジェスチャ。再レンダーに影響されないよう ref で持つ。
  const gesture = useRef<{
    pointerId: number;
    part: Part;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);

  function isOverFieldPoint(x: number, y: number): boolean {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  // Pointer Events ベースのドラッグ（タッチ/マウス/ペン統一）。
  // pointerdown 後は window でジェスチャを追い、要素を跨いでも確実に拾う。
  useEffect(() => {
    function onMove(event: PointerEvent) {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) return;

      const dx = event.clientX - g.startX;
      const dy = event.clientY - g.startY;
      if (!g.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
        return; // まだタップの範囲内。
      }
      g.dragging = true;
      setDraggingPartId(g.part.id);
      setGhost({ label: g.part.label, x: event.clientX, y: event.clientY });
      setIsOverField(isOverFieldPoint(event.clientX, event.clientY));
    }

    function onUp(event: PointerEvent) {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) return;

      const droppedOnField = g.dragging && isOverFieldPoint(event.clientX, event.clientY);
      const wasTap = !g.dragging;
      gesture.current = null;
      setDraggingPartId(null);
      setIsOverField(false);
      setGhost(null);

      // ドラッグして場札に重ねた / その場タップ、どちらも提出として扱う。
      if (canAct && (droppedOnField || wasTap)) {
        onSubmit(g.part);
      }
    }

    function onCancel() {
      gesture.current = null;
      setDraggingPartId(null);
      setIsOverField(false);
      setGhost(null);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [canAct, onSubmit]);

  function beginGesture(part: Part, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!canAct) return;
    gesture.current = {
      pointerId: event.pointerId,
      part,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
  }

  // 盤面（手番・場札）が変わったらドラッグ状態を必ずリセットし、ハイライト残りを防ぐ。
  useEffect(() => {
    gesture.current = null;
    setDraggingPartId(null);
    setIsOverField(false);
    setGhost(null);
  }, [view.currentPlayerId, view.field?.id, canAct]);

  const fieldDropActive = canAct && !!draggingPartId && isOverField;

  return (
    <main className="game-shell">
      <header className="game-header">
        <div>
          <p className="eyebrow">{isFinished ? 'ゲーム終了' : isMyTurn ? 'あなたの番' : '現在の手番'}</p>
          <h1>{isFinished ? `${winner?.name ?? '勝者'} の勝ち` : currentPlayer?.name}</h1>
        </div>
        <button className="ghost-action" type="button" onClick={onRestart}>
          終了する
        </button>
      </header>

      <section className="score-row" aria-label="得点">
        {view.players.map((player) => (
          <article
            className={`score-card${player.id === view.currentPlayerId && !isFinished ? ' is-current' : ''}${player.isYou ? ' is-you' : ''}`}
            key={player.id}
          >
            <div>
              <strong>
                {player.name}
                {player.isYou ? '（あなた）' : ''}
                {!player.connected ? ' ⚠' : ''}
              </strong>
              <span>手札 {player.handCount}枚</span>
            </div>
            <p>{player.score.length}点</p>
            <div className="kanji-stack" aria-label={`${player.name} の完成漢字`}>
              {player.score.map((kanji, index) => (
                <span key={`${kanji.char}-${index}`}>{kanji.char}</span>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className={`table-area${fieldDropActive ? ' is-drop-target' : ''}`} aria-label="場">
        <FuseAnimation kanji={fusion} />
        <div className={`notice notice--${notice.kind}`}>{notice.text}</div>

        <div className="field-layout">
          <div className="deck-counter" aria-label={`山札 ${view.deckCount}枚`}>
            <span>山札</span>
            <strong>{view.deckCount}</strong>
          </div>
          <FieldCard
            ref={fieldRef}
            part={view.field}
            active={fieldDropActive}
            canDrop={canAct && !!draggedPart}
          />
        </div>

        <div className="turn-actions">
          <button type="button" className="secondary-action" disabled={!canAct} onClick={onHint}>
            ヒント
          </button>
          <button type="button" className="secondary-action" disabled={!canAct} onClick={onPass}>
            パス
          </button>
        </div>
      </section>

      <section className="hand-area" aria-label="あなたの手札">
        <div className="section-heading">
          <p className="eyebrow">手札</p>
          <h2>{viewer?.name ?? ''}</h2>
        </div>
        <Hand
          parts={view.hand}
          disabled={!canAct}
          draggingPartId={draggingPartId}
          onPointerDown={beginGesture}
        />
      </section>

      {ghost && (
        <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          <span>{ghost.label}</span>
        </div>
      )}
    </main>
  );
}