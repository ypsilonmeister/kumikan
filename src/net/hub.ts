import type { NetMessage } from './messages';
import type { RtcConnection } from './rtcConnection';
import type { MessageHandler, PeerChangeHandler, Transport } from './transport';

/**
 * Star トポロジでホストが複数の子機接続を束ねる Transport 実装。
 * ホストから見れば「全員へブロードキャスト / 特定子機へ送信」だけになる。
 *
 * ホスト自身は peerId 0。子機は addGuest 時に渡された peerId（= playerId）。
 */
export class Hub implements Transport {
  private readonly guests = new Map<number, RtcConnection>();
  private messageHandler: MessageHandler | null = null;
  private peerChangeHandler: PeerChangeHandler | null = null;

  addGuest(peerId: number, conn: RtcConnection): void {
    this.guests.set(peerId, conn);

    conn.onMessage((msg) => this.messageHandler?.(msg, peerId));
    conn.onOpen(() => this.peerChangeHandler?.(peerId, true));
    conn.onClose(() => {
      this.guests.delete(peerId);
      this.peerChangeHandler?.(peerId, false);
    });

    // addGuest 時点で既に open 済みなら、open イベントを取りこぼさないよう通知。
    if (conn.isOpen) {
      this.peerChangeHandler?.(peerId, true);
    }
  }

  /** 全子機へ配信。 */
  send(msg: NetMessage): void {
    for (const conn of this.guests.values()) {
      conn.send(msg);
    }
  }

  sendTo(peerId: number, msg: NetMessage): void {
    this.guests.get(peerId)?.send(msg);
  }

  onMessage(cb: MessageHandler): void {
    this.messageHandler = cb;
  }

  onPeerChange(cb: PeerChangeHandler): void {
    this.peerChangeHandler = cb;
  }

  close(): void {
    for (const conn of this.guests.values()) {
      conn.close();
    }
    this.guests.clear();
  }
}
