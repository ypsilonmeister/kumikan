import type { NetMessage } from './messages';

export type MessageHandler = (msg: NetMessage, from: number) => void;
export type PeerChangeHandler = (peerId: number, connected: boolean) => void;

/**
 * ゲームロジックが依存する唯一の通信契約。
 * 手動コピペ接続でも将来の QR 接続でも、この実装を差し替えるだけにする。
 *
 * peerId の規約:
 *   - ホスト自身は 0。
 *   - 子機は接続順に 1, 2, 3...（= playerId と一致させる）。
 */
export interface Transport {
  /** 自分以外へ送る。host=全子機へブロードキャスト、guest=host へ送信。 */
  send(msg: NetMessage): void;
  /** 特定の相手だけに送る（host のみ意味を持つ。guest は host 宛に丸める）。 */
  sendTo(peerId: number, msg: NetMessage): void;
  onMessage(cb: MessageHandler): void;
  onPeerChange(cb: PeerChangeHandler): void;
  close(): void;
}
