import { HostController } from './hostController';
import { hintFor, type GameSession } from './session';
import type { SessionEvent } from './events';
import { startGame, toPublicGameState } from '../domain/engine';
import { createPlayers } from '../domain/deck';
import type { GameState, Part, PublicGameState } from '../domain/types';
import { Hub } from '../net/hub';
import type { RtcConnection } from '../net/rtcConnection';

const GUEST_PEER_ID = 1; // 2 台 MVP: ホスト=0、子機=1。

/**
 * ホストモード。権威 HostController を持ち、子機 1 台を Hub 経由で束ねる。
 * ホスト自身は playerId=0 として操作する。
 */
export class HostSession implements GameSession {
  readonly mode = 'host' as const;

  private readonly hub: Hub;
  private readonly host: HostController;
  /** ホスト(0)視点の最新の公開状態（hint 用）。 */
  private latestView: PublicGameState | null = null;

  constructor(initial: GameState, conn: RtcConnection, emit: (e: SessionEvent) => void) {
    this.hub = new Hub();
    this.host = new HostController(initial, this.hub, {
      onState: (state) => {
        this.latestView = toPublicGameState(state, 0);
        emit({ type: 'state', view: this.latestView, viewerId: 0 });
      },
      onFusion: (event) => emit({ type: 'fusion', event }),
      onActionResult: (result) => emit({ type: 'action-result', result }),
    });

    // 先に初期状態を emit してから接続を反映する。
    // addGuest は接続済みなら同期的に welcome+broadcast を発火する。
    // 初期表示→接続反映の順にすることで、broadcast による新しい状態が
    // 初期状態で上書きされないようにする。
    this.latestView = toPublicGameState(initial, 0);
    emit({ type: 'state', view: this.latestView, viewerId: 0 });
    this.hub.addGuest(GUEST_PEER_ID, conn);
  }

  submit(partId: string, fieldPartId?: string): void {
    this.host.submit(0, partId, fieldPartId);
  }

  pass(): void {
    this.host.pass(0);
  }

  hint(): Part | null {
    return hintFor(this.latestView);
  }

  close(): void {
    this.hub.close();
  }
}

/** ロビーの設定からホストセッションを開始する。 */
export function createHostSession(
  hostName: string,
  handSize: number,
  conn: RtcConnection,
  emit: (e: SessionEvent) => void,
): HostSession {
  return new HostSession(startGame(createPlayers([hostName, '相手']), handSize), conn, emit);
}
