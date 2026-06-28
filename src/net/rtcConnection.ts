import { deserialize, serialize, type NetMessage } from './messages';
import { Inbox } from './inbox';

/**
 * RTCPeerConnection + 1 本の DataChannel を扱う薄いラッパ。1 接続 = 1 ペア。
 *
 * 手動コピペ接続では trickle ICE が使えないため、ICE 収集が完了するまで待って
 * から localDescription を返す（= candidate を SDP に内包させてコピペ 1 往復で
 * 済ませる）。メディアセクションは作らず DataChannel のみ（仕様 3.1）。
 */
export class RtcConnection {
  /** ICE 収集が complete にならない環境向けの上限待ち時間。 */
  private static readonly ICE_TIMEOUT_MS = 12_000;

  private readonly pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  /** handler 登録前に到着したメッセージを取りこぼさないための受信キュー。 */
  private readonly inbox = new Inbox();
  private openHandler: (() => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private closed = false;
  /** close() で pending な ICE 待ちを reject するための登録口。 */
  private rejectIceWait: ((reason: Error) => void) | null = null;

  constructor() {
    // STUN/TURN を使わない LAN 前提（仕様 3 / 3.2 の注記）。
    this.pc = new RTCPeerConnection({ iceServers: [] });
    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.closeHandler?.();
      }
    };
  }

  onMessage(cb: (msg: NetMessage) => void): void {
    // handler 登録前に届いていたメッセージ（WELCOME など）も順に流れる。
    this.inbox.setHandler(cb);
  }

  onOpen(cb: () => void): void {
    this.openHandler = cb;
  }

  onClose(cb: () => void): void {
    this.closeHandler = cb;
  }

  /** ホスト側: DataChannel を生成し、offer を作って ICE 完了まで待つ。 */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const channel = this.pc.createDataChannel('game', { ordered: true });
    this.bindChannel(channel);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return this.waitForIceComplete();
  }

  /** 子機側: 受け取った offer から answer を作って ICE 完了まで待つ。 */
  async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    this.pc.ondatachannel = (event) => this.bindChannel(event.channel);
    await this.pc.setRemoteDescription(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return this.waitForIceComplete();
  }

  /** ホスト側: 子機から返ってきた answer を適用して接続を確立する。 */
  async acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(answer);
  }

  send(msg: NetMessage): void {
    if (this.channel?.readyState === 'open') {
      this.channel.send(serialize(msg));
    }
  }

  get isOpen(): boolean {
    return this.channel?.readyState === 'open';
  }

  close(): void {
    this.closed = true;
    this.rejectIceWait?.(new Error('connection closed'));
    this.inbox.clear();
    this.channel?.close();
    this.pc.close();
  }

  private bindChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.onopen = () => this.openHandler?.();
    channel.onclose = () => this.closeHandler?.();
    channel.onmessage = (event) => {
      let msg: NetMessage;
      try {
        msg = deserialize(event.data as string);
      } catch {
        return; // 壊れたフレームは無視（STATE_SYNC で自己修復される）。
      }
      this.inbox.deliver(msg);
    };
  }

  private waitForIceComplete(): Promise<RTCSessionDescriptionInit> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error('connection closed'));
        return;
      }
      if (this.pc.iceGatheringState === 'complete') {
        resolve(this.localDescription());
        return;
      }

      let timer = 0;
      const cleanup = () => {
        this.pc.removeEventListener('icegatheringstatechange', check);
        if (timer) window.clearTimeout(timer);
        this.rejectIceWait = null;
      };

      const check = () => {
        if (this.pc.iceGatheringState === 'complete') {
          cleanup();
          resolve(this.localDescription());
        }
      };

      // close() から中断できるよう reject を公開。
      this.rejectIceWait = (reason) => {
        cleanup();
        reject(reason);
      };

      // タイムアウト時は、その時点で集まった candidate でフォールバック。
      // LAN ではホスト候補が早期に揃うため、部分的でも接続できることが多い。
      timer = window.setTimeout(() => {
        cleanup();
        try {
          resolve(this.localDescription());
        } catch (error) {
          reject(error instanceof Error ? error : new Error('ICE timeout'));
        }
      }, RtcConnection.ICE_TIMEOUT_MS);

      this.pc.addEventListener('icegatheringstatechange', check);
    });
  }

  private localDescription(): RTCSessionDescriptionInit {
    const desc = this.pc.localDescription;
    if (!desc) {
      throw new Error('localDescription is not ready');
    }
    return { type: desc.type, sdp: desc.sdp };
  }
}
