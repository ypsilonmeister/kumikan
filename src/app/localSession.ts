import { HostController } from './hostController';
import { hintFor, type GameSession } from './session';
import type { SessionEvent } from './events';
import { startGame, toPublicGameState } from '../domain/engine';
import { createPlayers, type RandomFn } from '../domain/deck';
import type { GameState, Part, PublicGameState } from '../domain/types';
import type { NetMessage } from '../net/messages';
import type { Transport } from '../net/transport';

/** ローカルモード用。子機がいないので何も送らない。 */
class NullTransport implements Transport {
  send(_msg: NetMessage): void {}
  sendTo(_peerId: number, _msg: NetMessage): void {}
  onMessage(): void {}
  onPeerChange(): void {}
  close(): void {}
}

/**
 * ローカルモード = 子機ゼロのホスト。HostController を再利用して重複ロジックを排する。
 * 手番プレイヤーが同一端末で交互に操作するため、viewerId は手番のたびに変わる。
 */
export class LocalSession implements GameSession {
  readonly mode = 'local' as const;

  private readonly host: HostController;
  /** HostController から返ってくる最新の正準状態。 */
  private latest: GameState;
  /** publishState で作った最新の公開状態（hint 用）。 */
  private latestView: PublicGameState | null = null;

  constructor(
    initial: GameState,
    private readonly emit: (e: SessionEvent) => void,
  ) {
    this.latest = initial;
    this.host = new HostController(initial, new NullTransport(), {
      onState: (state) => {
        this.latest = state;
        this.publishState();
      },
      onFusion: (event) => {
        this.emit({ type: 'fusion', event });
      },
      onActionResult: (result) => this.emit({ type: 'action-result', result }),
    });
    // 初期状態を即時配信（App が game 画面へ遷移する前に view が確定する）。
    this.publishState();
  }

  submit(partId: string, fieldPartId?: string): void {
    this.host.submit(this.currentPlayerId(), partId, fieldPartId);
  }

  pass(): void {
    this.host.pass(this.currentPlayerId());
  }

  hint(): Part | null {
    return hintFor(this.latestView);
  }

  close(): void {
    // ローカルは外部リソース（接続）を持たないので何もしない。
  }

  /** 手番プレイヤー視点の公開状態を保持し、state イベントとして配信する。 */
  private publishState(): void {
    // ローカルは手番プレイヤーが操作主体なので viewerId は手番のたびに変わる。
    const viewerId = this.latest.turnOrder[this.latest.currentTurnIndex] ?? 0;
    this.latestView = toPublicGameState(this.latest, viewerId);
    this.emit({ type: 'state', view: this.latestView, viewerId });
  }

  private currentPlayerId(): number {
    return this.latest.turnOrder[this.latest.currentTurnIndex] ?? 0;
  }

}

/** ロビーの設定からローカルセッションを開始する。random はテスト用に差し替え可能。 */
export function createLocalSession(
  names: string[],
  handSize: number,
  emit: (e: SessionEvent) => void,
  random: RandomFn = Math.random,
): LocalSession {
  return new LocalSession(startGame(createPlayers(names), handSize, random), emit);
}
