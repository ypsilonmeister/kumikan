import { nextTurn, passTurn, submitPart, toPublicGameState } from '../domain/engine';
import type { GameState, Player } from '../domain/types';
import type { Transport } from '../net/transport';
import type { NetMessage } from '../net/messages';

/** UI に渡す合体演出トリガ。 */
export interface FusionEvent {
  playerId: number;
  char: string;
  from: [string, string];
}

export interface HostCallbacks {
  /** ホスト自身の描画用。viewerId=0（ホスト）視点の公開状態。 */
  onState: (host: GameState) => void;
  /** 成功時の合体演出。 */
  onFusion: (event: FusionEvent) => void;
}

/**
 * 権威ロジック。正準 GameState を唯一保持し、ホスト/子機のアクションを
 * すべてここで engine に通して確定 → 全員へ STATE_SYNC を配信する。
 * ホストもプレイヤー 0 として扱う（自分の入力は applyAction にループバック）。
 */
export class HostController {
  private state: GameState;

  constructor(
    initial: GameState,
    private readonly transport: Transport,
    private readonly callbacks: HostCallbacks,
  ) {
    this.state = initial;
    transport.onMessage((msg, from) => this.handleMessage(msg, from));
    transport.onPeerChange((peerId, connected) => this.handlePeerChange(peerId, connected));
  }

  /** 接続済みの子機 1 台へ初期状態を送る（WELCOME）。 */
  private welcome(peerId: number): void {
    this.transport.sendTo(peerId, {
      type: 'WELCOME',
      payload: { playerId: peerId, state: toPublicGameState(this.state, peerId) },
    });
  }

  /** 全員（子機 + ホスト UI）へ確定状態を配信。 */
  private broadcastState(): void {
    for (const player of this.state.players) {
      if (player.id === 0) {
        continue; // ホストはローカルで描画する。
      }
      this.transport.sendTo(player.id, {
        type: 'STATE_SYNC',
        payload: toPublicGameState(this.state, player.id),
      });
    }
    this.callbacks.onState(this.state);

    if (this.state.phase === 'finished') {
      this.transport.send({ type: 'GAME_OVER', payload: { winnerId: this.state.winnerId } });
    }
  }

  /** ホスト自身のパーツ提示。 */
  submit(partId: string, fieldPartId?: string): void {
    this.applySubmit(0, partId, fieldPartId);
  }

  /** ホスト自身のパス。 */
  pass(): void {
    this.applyPass(0);
  }

  private handleMessage(msg: NetMessage, from: number): void {
    switch (msg.type) {
      case 'HELLO':
        // 子機が接続を確立した。WELCOME を（再）送信して初期同期を保証する。
        // open イベントの取りこぼしや順序ズレがあってもここで回復できる。
        this.setPlayerConnected(from, true);
        this.welcome(from);
        break;
      case 'ACTION_SUBMIT':
        this.applySubmit(from, msg.payload.partId, msg.payload.fieldPartId);
        break;
      case 'ACTION_PASS':
        this.applyPass(from);
        break;
      case 'JOIN':
        this.setPlayerName(from, msg.payload.name);
        this.broadcastState();
        break;
      default:
        break; // 子機からのその他メッセージは無視。
    }
  }

  private handlePeerChange(peerId: number, connected: boolean): void {
    this.setPlayerConnected(peerId, connected);
    if (connected) {
      this.welcome(peerId);
    }
    this.broadcastState();
  }

  private applySubmit(playerId: number, partId: string, fieldPartId?: string): void {
    // 非手番プレイヤー / 場札なしの提示は無視（権威モデルを守る）。
    if (this.currentPlayerId() !== playerId || this.state.field.length === 0) {
      return;
    }

    const player = this.state.players.find((item) => item.id === playerId);
    const part = player?.hand.find((item) => item.id === partId);

    // 手札に存在しない partId（stale / 二重送信）はターン交代せず無視。
    if (!part) {
      return;
    }

    const result = submitPart(this.state, playerId, partId, fieldPartId);
    if (result.outcome === 'success' && result.kanji) {
      // submitPart 内で補充済み。同じプレイヤーが続けて行動する。
      this.state = result.state;
      this.callbacks.onFusion({
        playerId,
        char: result.kanji.char,
        from: [result.kanji.from[0], result.kanji.from[1]],
      });
      this.transport.send({
        type: 'SUBMIT_RESULT',
        payload: {
          playerId,
          field: result.kanji.from[0],
          part: result.kanji.from[1],
          result: result.kanji.char,
        },
      });
      this.broadcastState();
      return;
    }

    // 合体できないパーツを出した場合のみ手番交代。
    this.state = nextTurn(this.state);
    this.broadcastState();
  }

  private applyPass(playerId: number): void {
    if (this.currentPlayerId() !== playerId) {
      return;
    }
    // パスは場札を山札から1枚積み増す（合体候補を増やして手詰まり解消）。
    this.state = passTurn(this.state);
    this.broadcastState();
  }

  private currentPlayerId(): number | null {
    return this.state.turnOrder[this.state.currentTurnIndex] ?? null;
  }

  private setPlayerName(playerId: number, name: string): void {
    this.state = {
      ...this.state,
      players: this.state.players.map((player) =>
        player.id === playerId ? { ...player, name: name.trim() || player.name } : player,
      ),
    };
  }

  private setPlayerConnected(playerId: number, connected: boolean): void {
    this.state = {
      ...this.state,
      players: this.state.players.map((player: Player) =>
        player.id === playerId ? { ...player, connected } : player,
      ),
    };
  }
}
