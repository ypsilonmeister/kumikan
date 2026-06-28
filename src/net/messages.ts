import type { PublicGameState } from '../domain/types';

/**
 * DataChannel 上を流れるメッセージ。
 *
 * 状態の「真実」は常に STATE_SYNC（全体スナップショット）で配信し、
 * 子機はそれを描画するだけにする（ホスト権威モデル）。
 * SUBMIT_RESULT は合体演出のトリガ専用で、状態同期には使わない。
 */
export type NetMessage =
  // Host → Guest
  | { type: 'WELCOME'; payload: { playerId: number; state: PublicGameState } }
  | { type: 'STATE_SYNC'; payload: PublicGameState }
  | {
      type: 'SUBMIT_RESULT';
      payload: { playerId: number; field: string; part: string; result: string | null };
    }
  | { type: 'GAME_OVER'; payload: { winnerId: number | null } }
  // Guest → Host
  | { type: 'HELLO'; payload: Record<string, never> }
  | { type: 'JOIN'; payload: { name: string } }
  | { type: 'ACTION_SUBMIT'; payload: { partId: string; fieldPartId?: string } }
  | { type: 'ACTION_PASS'; payload: Record<string, never> };

export function serialize(msg: NetMessage): string {
  return JSON.stringify(msg);
}

export function deserialize(text: string): NetMessage {
  return JSON.parse(text) as NetMessage;
}
