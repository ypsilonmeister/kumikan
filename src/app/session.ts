import { findPlayablePart } from '../domain/engine';
import type { Part, PublicGameState } from '../domain/types';

/**
 * ゲームモード（ローカル/ホスト/ゲスト）を UI から見た共通契約。
 * UI はこのインターフェースと SessionEvent だけを知り、モード分岐を持たない。
 */
export interface GameSession {
  /** モード固有の見た目制御（手番通知音はオンラインのみ等）に使う。 */
  readonly mode: 'local' | 'host' | 'guest';
  submit(partId: string, fieldPartId?: string): void;
  pass(): void;
  /** いま出せる手札パーツ（無ければ null）。最新の公開状態から判定する。 */
  hint(): Part | null;
  close(): void;
}

/** 最新の公開状態からヒント対象を求める共通実装。 */
export function hintFor(view: PublicGameState | null): Part | null {
  if (!view) return null;
  return findPlayablePart(view.field, view.hand);
}
