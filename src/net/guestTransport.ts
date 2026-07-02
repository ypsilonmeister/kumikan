import type { NetMessage } from './messages';
import type { RtcConnection } from './rtcConnection';
import type { MessageHandler, PeerChangeHandler, Transport } from './transport';

/**
 * 子機側の Transport 実装。1 本の RtcConnection をそのまま包む。
 * 子機から見た相手は常にホスト（peerId 0）なので、sendTo は send に丸める。
 */
export class GuestTransport implements Transport {
  constructor(private readonly conn: RtcConnection) {}

  send(msg: NetMessage): void {
    this.conn.send(msg);
  }

  /** 子機の宛先はホストのみなので peerId は無視して送る。 */
  sendTo(_peerId: number, msg: NetMessage): void {
    this.conn.send(msg);
  }

  onMessage(cb: MessageHandler): void {
    // ホスト（peerId 0）からの受信として届ける。
    this.conn.onMessage((msg) => cb(msg, 0));
  }

  onPeerChange(_cb: PeerChangeHandler): void {
    // 子機は相手の増減を扱わない（ホスト権威モデル）。
  }

  close(): void {
    this.conn.close();
  }
}
