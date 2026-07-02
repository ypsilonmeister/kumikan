import { RtcConnection } from '../net/rtcConnection';
import { decodeSignal, encodeSignal } from '../net/sdp';

export type SignalingRole = 'host' | 'guest';
export type SignalingConnection = RtcConnection;
export type SignalingStep = 'offer' | 'answer';

export interface SignalingPeer {
  readonly isOpen: boolean;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit>;
  acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void>;
  onOpen(cb: () => void): void;
  close(): void;
}

export interface SignalingState {
  outgoing: string;
  incoming: string;
  step: SignalingStep;
  error: string | null;
  busy: boolean;
}

interface SignalingDeps<TConn extends SignalingPeer> {
  createConnection: () => TConn;
  encode: (desc: RTCSessionDescriptionInit) => string;
  decode: (text: string) => RTCSessionDescriptionInit;
}

const initialState: SignalingState = {
  outgoing: '',
  incoming: '',
  step: 'offer',
  error: null,
  busy: false,
};

export function createInitialSignalingState(): SignalingState {
  return { ...initialState };
}

export class SignalingController<TConn extends SignalingPeer = SignalingConnection> {
  private conn: TConn | null = null;
  private state = createInitialSignalingState();

  constructor(
    private readonly role: SignalingRole,
    private readonly onState: (state: SignalingState) => void,
    private readonly onConnected: (conn: TConn) => void,
    private readonly deps: SignalingDeps<TConn> = {
      createConnection: () => new RtcConnection() as unknown as TConn,
      encode: encodeSignal,
      decode: decodeSignal,
    },
  ) {}

  start(): void {
    const conn = this.deps.createConnection();
    this.conn = conn;
    conn.onOpen(() => this.onConnected(conn));
    this.emit({ step: 'offer' });

    if (this.role === 'host') {
      this.createOffer();
    }
  }

  setIncoming(value: string): void {
    this.emit({ incoming: value, error: null });
  }

  async guestMakeAnswer(): Promise<void> {
    const conn = this.conn;
    if (!conn) return;

    this.emit({ error: null, busy: true });
    try {
      const answer = await conn.createAnswer(this.deps.decode(this.state.incoming));
      this.emit({ outgoing: this.deps.encode(answer), incoming: '', step: 'answer' });
    } catch {
      this.emit({ error: 'オファーの読み取りに失敗しました。文字列を確認してください。' });
    } finally {
      this.emit({ busy: false });
    }
  }

  async hostAcceptAnswer(): Promise<void> {
    const conn = this.conn;
    if (!conn) return;

    this.emit({ error: null, busy: true });
    try {
      await conn.acceptAnswer(this.deps.decode(this.state.incoming));
    } catch {
      this.emit({ error: 'アンサーの読み取りに失敗しました。文字列を確認してください。' });
    } finally {
      this.emit({ busy: false });
    }
  }

  closeIfPending(): void {
    if (this.conn && !this.conn.isOpen) {
      this.conn.close();
    }
  }

  private async createOffer(): Promise<void> {
    const conn = this.conn;
    if (!conn) return;

    this.emit({ busy: true });
    try {
      const offer = await conn.createOffer();
      this.emit({ outgoing: this.deps.encode(offer) });
    } catch {
      this.emit({ error: 'オファーの生成に失敗しました。' });
    } finally {
      this.emit({ busy: false });
    }
  }

  private emit(patch: Partial<SignalingState>): void {
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }
}
