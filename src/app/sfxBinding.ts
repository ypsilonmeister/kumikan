import type { SessionEvent } from './events';
import type { GameSession } from './session';
import * as sfx from '../audio/sfx';
import type { Phase, PublicGameState } from '../domain/types';

export interface SfxPlayer {
  playSuccess(): void;
  playFail(): void;
  playPass(): void;
  playTurn(): void;
  playWin(): void;
}

interface SfxBindingState {
  view: PublicGameState | null;
  phase: Phase | null;
  currentPlayerId: number | null;
}

/**
 * SessionEvent → 効果音のマッピング（単一チャネル）。
 * モードはゲーム開始時に reset(mode) で確定させる。セッションはコンストラクタ内で
 * 同期的にイベントを発火しうるため、セッション参照からモードを都度引くと
 * 生成中のイベントに正しいモードを適用できない。
 */
export class SfxBinding {
  private mode: GameSession['mode'] | null = null;
  private state: SfxBindingState = {
    view: null,
    phase: null,
    currentPlayerId: null,
  };

  constructor(private readonly player: SfxPlayer = sfx) {}

  /**
   * ゲームの開始/終了時に呼ぶ。モードを確定し、前ゲームの局面記憶を消す。
   * セッション生成より前に呼ぶこと。
   */
  reset(mode: GameSession['mode'] | null = null): void {
    this.mode = mode;
    this.state = { view: null, phase: null, currentPlayerId: null };
  }

  handle(event: SessionEvent): void {
    switch (event.type) {
      case 'state':
        this.handleState(event.view, event.viewerId);
        break;
      case 'action-result':
        this.handleActionResult(event);
        break;
      case 'fusion':
        break; // 成功音は action-result (fused) 側で鳴らす。
    }
  }

  private handleState(view: PublicGameState, viewerId: number): void {
    const prevPhase = this.state.phase;
    const prevCurrent = this.state.currentPlayerId;
    const nextPhase = view.phase;
    const nextCurrent = view.currentPlayerId;

    // ゲーム終了（勝利ファンファーレ）。finished へ遷移した瞬間だけ。
    if (nextPhase === 'finished' && prevPhase !== null && prevPhase !== 'finished') {
      this.player.playWin();
    }

    // 自分の手番が回ってきた通知（オンライン時のみ。ローカルは同一端末交代なので鳴らさない）。
    if (
      this.mode !== 'local' &&
      nextCurrent !== null &&
      nextCurrent === viewerId &&
      prevCurrent !== null &&
      prevCurrent !== nextCurrent
    ) {
      this.player.playTurn();
    }

    this.state = { view, phase: nextPhase, currentPlayerId: nextCurrent };
  }

  private handleActionResult(event: Extract<SessionEvent, { type: 'action-result' }>): void {
    switch (event.result.kind) {
      case 'fused':
        // 勝敗確定の手はファンファーレ側に任せる（state が先に届いている）。
        if (this.state.view?.phase !== 'finished') {
          this.player.playSuccess();
        }
        break;
      case 'submit-failed':
        this.player.playFail();
        break;
      case 'passed':
        this.player.playPass();
        break;
    }
  }
}
