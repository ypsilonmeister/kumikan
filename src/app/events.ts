import type { PublicGameState } from '../domain/types';
import type { ActionResultMessage } from '../net/messages';

/** UI に渡す合体演出トリガ。 */
export interface FusionEvent {
  playerId: number;
  char: string;
  from: [string, string];
}

/**
 * 行動の結果（通知文・効果音の素材）。
 * ワイヤ型（ACTION_RESULT の payload）と同一。定義を net/messages に一本化し、
 * ローカルでもオンラインでも同じイベントが流れることを型レベルで保証する。
 */
export type ActionResult = ActionResultMessage;

/** セッション（モード実装）が UI へ届けるイベント。 */
export type SessionEvent =
  | { type: 'state'; view: PublicGameState; viewerId: number }
  | { type: 'fusion'; event: FusionEvent }
  | { type: 'action-result'; result: ActionResult };
