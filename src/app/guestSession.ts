import { GuestController } from './guestController';
import { GuestTransport } from '../net/guestTransport';
import { hintFor, type GameSession } from './session';
import type { SessionEvent } from './events';
import type { Part, PublicGameState } from '../domain/types';
import type { RtcConnection } from '../net/rtcConnection';

/**
 * ゲストモード。engine は持たず、ホストへ入力を送り STATE_SYNC を描画するだけ。
 * viewerId は WELCOME で確定した自分の playerId。
 */
export class GuestSession implements GameSession {
  readonly mode = 'guest' as const;

  private readonly controller: GuestController;
  /** WELCOME で確定するまでは 0。 */
  private playerId = 0;
  /** 描画する最新の公開状態（hint 用）。 */
  private latestView: PublicGameState | null = null;

  constructor(name: string, conn: RtcConnection, emit: (e: SessionEvent) => void) {
    this.controller = new GuestController(
      new GuestTransport(conn),
      {
        // GuestController は WELCOME 時に onWelcome → onState の順で呼ぶので
        // onState の時点で playerId は確定済み。
        onWelcome: (playerId) => {
          this.playerId = playerId;
        },
        onState: (state) => {
          this.latestView = state;
          emit({ type: 'state', view: state, viewerId: this.playerId });
        },
        onFusion: (event) => emit({ type: 'fusion', event }),
        onActionResult: (result) => emit({ type: 'action-result', result }),
      },
      name,
    );
    this.controller.start(); // HELLO を送り初期同期を促す。
  }

  submit(partId: string, fieldPartId?: string): void {
    this.controller.submit(partId, fieldPartId);
  }

  pass(): void {
    this.controller.pass();
  }

  hint(): Part | null {
    return hintFor(this.latestView);
  }

  close(): void {
    this.controller.close();
  }
}

/** ロビーの設定からゲストセッションを開始する。 */
export function createGuestSession(
  name: string,
  conn: RtcConnection,
  emit: (e: SessionEvent) => void,
): GuestSession {
  return new GuestSession(name, conn, emit);
}
