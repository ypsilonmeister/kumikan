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
  /** fieldPartId 省略時はタップ（合体できる場札を自動選択）。 */
  onSubmit: (part: Part, fieldPartId?: string) => void;
  onPass: () => void;
  onHint: () => void;
  onRestart: () => void;
  /** 効果音がミュート中か。 */
  muted: boolean;
  onToggleMute: () => void;
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
  muted,
  onToggleMute,
}: GameScreenProps) {
  const [draggingPartId, setDraggingPartId] = useState<string | null>(null);
  const [overFieldId, setOverFieldId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  // 各場札の DOM をドラッグ当たり判定のために保持。
  const fieldRefs = useRef(new Map<string, HTMLDivElement>());

  const isFinished = view.phase === 'finished';
  const winner = view.players.find((player) => player.id === view.winnerId);
  const currentPlayer = view.players.find((player) => player.id === view.currentPlayerId);
  const viewer = view.players.find((player) => player.id === viewerId);
  const isMyTurn = view.currentPlayerId === viewerId;
  const canAct = !isFinished && isMyTurn && view.field.length > 0;
  const draggedPart = useMemo(
    () => view.hand.find((part) => part.id === draggingPartId) ?? null,
    [draggingPartId, view.hand],
  );

  // 同じ種類の場札はひとまとめに（先頭カードを代表に、枚数だけ持つ）。
  // パスで場札が増えても見た目が散らからないよう重ね表示する。
  const fieldGroups = useMemo(() => {
    const groups: { id: string; rep: Part; count: number }[] = [];
    const indexByKind = new Map<string, number>();
    for (const part of view.field) {
      const at = indexByKind.get(part.kind);
      if (at === undefined) {
        indexByKind.set(part.kind, groups.length);
        groups.push({ id: part.id, rep: part, count: 1 });
      } else {
        groups[at].count += 1;
      }
    }
    return groups;
  }, [view.field]);

  // 進行中のポインタジェスチャ。再レンダーに影響されないよう ref で持つ。
  const gesture = useRef<{
    pointerId: number;
    part: Part;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);

  /** 座標がどの場札の上か判定し、その場札 id を返す（無ければ null）。 */
  function fieldIdAtPoint(x: number, y: number): string | null {
    for (const [id, el] of fieldRefs.current) {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return id;
      }
    }
    return null;
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
      setOverFieldId(fieldIdAtPoint(event.clientX, event.clientY));
    }

    function onUp(event: PointerEvent) {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) return;

      const dropFieldId = g.dragging ? fieldIdAtPoint(event.clientX, event.clientY) : null;
      const wasTap = !g.dragging;
      gesture.current = null;
      setDraggingPartId(null);
      setOverFieldId(null);
      setGhost(null);

      if (!canAct) return;
      if (dropFieldId) {
        // 特定の場札にドロップ → その場札と合体。
        onSubmit(g.part, dropFieldId);
      } else if (wasTap) {
        // その場タップ → 合体できる場札を自動選択。
        onSubmit(g.part);
      }
    }

    function onCancel() {
      gesture.current = null;
      setDraggingPartId(null);
      setOverFieldId(null);
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
  const fieldKey = view.field.map((part) => part.id).join('|');
  useEffect(() => {
    gesture.current = null;
    setDraggingPartId(null);
    setOverFieldId(null);
    setGhost(null);
  }, [view.currentPlayerId, fieldKey, canAct]);

  return (
    <main className={`game-shell${!isFinished && isMyTurn ? ' is-my-turn' : ''}`}>
      <header className="game-header">
        <div>
          <p className={`turn-badge${!isFinished && isMyTurn ? ' is-mine' : ''}`}>
            {isFinished ? 'ゲーム終了' : isMyTurn ? '🟢 あなたの番です' : `${currentPlayer?.name ?? ''} の番`}
          </p>
          <h1>{isFinished ? `${winner?.name ?? '勝者'} の勝ち` : currentPlayer?.name}</h1>
        </div>
        <div className="header-actions">
          <button
            className="ghost-action icon-action"
            type="button"
            onClick={onToggleMute}
            aria-pressed={muted}
            title={muted ? '音を出す' : '音を消す'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button className="ghost-action" type="button" onClick={onRestart}>
            終了する
          </button>
        </div>
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

      <section className="table-area" aria-label="場">
        <FuseAnimation kanji={fusion} />
        <div className={`notice notice--${notice.kind}`}>{notice.text}</div>

        <div className="field-layout">
          <div className="deck-counter" aria-label={`山札 ${view.deckCount}枚`}>
            <span>山札</span>
            <strong>{view.deckCount}</strong>
          </div>
          <div className="field-row" aria-label="場札">
            {fieldGroups.map((group) => (
              <FieldCard
                key={group.id}
                ref={(el) => {
                  if (el) fieldRefs.current.set(group.id, el);
                  else fieldRefs.current.delete(group.id);
                }}
                part={group.rep}
                count={group.count}
                active={overFieldId === group.id && !!draggingPartId}
                canDrop={canAct && !!draggedPart}
              />
            ))}
            {view.field.length === 0 && <FieldCard part={null} />}
          </div>
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