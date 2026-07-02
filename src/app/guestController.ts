import type { PublicGameState } from '../domain/types';
import { netMessage, type NetMessage } from '../net/messages';
import type { Transport } from '../net/transport';
import type { ActionResult, FusionEvent } from './events';

export interface GuestCallbacks {
  /** ホストから配信された確定状態を描画する。 */
  onState: (state: PublicGameState) => void;
  /** 自分の playerId が確定したとき（WELCOME）。 */
  onWelcome: (playerId: number) => void;
  /** 合体演出。 */
  onFusion: (event: FusionEvent) => void;
  /** 成功/失敗/パスの結果。 */
  onActionResult?: (result: ActionResult) => void;
}

/**
 * 子機ロジック。engine は呼ばず、ホストへ入力を送り、STATE_SYNC を描画するだけ。
 * 状態の真実は常にホストが持つ（ホスト権威モデル）。
 */
export class GuestController {
  private playerId: number | null = null;
  private disposed = false;

  constructor(
    private readonly transport: Transport,
    private readonly callbacks: GuestCallbacks,
    private readonly name: string,
  ) {
    transport.onMessage((msg) => this.handleMessage(msg));
  }

  /**
   * 接続確立後に呼ぶ。HELLO を送ってホストに WELCOME の（再）送信を促す。
   * open イベントと受信ハンドラ登録の前後関係に依存せず初期同期を確実にする。
   */
  start(): void {
    if (this.disposed) return;
    this.transport.send(netMessage({ type: 'HELLO', payload: {} }));
  }

  submit(partId: string, fieldPartId?: string): void {
    if (this.disposed) return;
    this.transport.send(netMessage({ type: 'ACTION_SUBMIT', payload: { partId, fieldPartId } }));
  }

  pass(): void {
    if (this.disposed) return;
    this.transport.send(netMessage({ type: 'ACTION_PASS', payload: {} }));
  }

  /** ロビーへ戻る等で破棄。以降のコールバック・送信を止め、接続を閉じる。 */
  close(): void {
    this.disposed = true;
    this.transport.close();
  }

  private handleMessage(msg: NetMessage): void {
    if (this.disposed) return;

    switch (msg.type) {
      case 'WELCOME':
        this.playerId = msg.payload.playerId;
        this.callbacks.onWelcome(msg.payload.playerId);
        this.callbacks.onState(msg.payload.state);
        // ホストの受信ハンドラが確実に立っている（WELCOME が届いた）ので、
        // ここで初めて JOIN を送り、取りこぼしを防ぐ。
        this.transport.send(netMessage({ type: 'JOIN', payload: { name: this.name } }));
        break;
      case 'STATE_SYNC':
        this.callbacks.onState(msg.payload);
        break;
      case 'SUBMIT_RESULT':
        if (msg.payload.result) {
          this.callbacks.onFusion({
            playerId: msg.payload.playerId,
            char: msg.payload.result,
            from: [msg.payload.field, msg.payload.part],
          });
        }
        break;
      case 'ACTION_RESULT':
        this.callbacks.onActionResult?.(msg.payload);
        break;
      default:
        break; // GAME_OVER は STATE_SYNC の phase で描画済み。
    }
  }

  get myPlayerId(): number | null {
    return this.playerId;
  }
}
