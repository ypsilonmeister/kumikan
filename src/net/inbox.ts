import type { NetMessage } from './messages';

/**
 * handler 登録前に到着したメッセージを保留し、登録時にまとめて流す小さなキュー。
 *
 * 手動コピペ接続では、DataChannel open 直後にホストが WELCOME を即送信する一方、
 * ゲスト側の受信 handler 登録が一瞬遅れることがある。その間の着信を取りこぼすと
 * ゲストが初期同期できずに詰むため、ここで吸収する。
 */
export class Inbox {
  private handler: ((msg: NetMessage) => void) | null = null;
  private pending: NetMessage[] = [];

  /** 受信したメッセージを配送する。handler 未登録なら保留する。 */
  deliver(msg: NetMessage): void {
    if (this.handler) {
      this.handler(msg);
    } else {
      this.pending.push(msg);
    }
  }

  /** handler を登録し、保留分を順に flush する。 */
  setHandler(handler: (msg: NetMessage) => void): void {
    this.handler = handler;
    const queued = this.pending;
    this.pending = [];
    for (const msg of queued) {
      handler(msg);
    }
  }

  /** 破棄時に保留分を捨てる。 */
  clear(): void {
    this.handler = null;
    this.pending = [];
  }
}
