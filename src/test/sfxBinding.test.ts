import { describe, expect, it } from 'vitest';
import { SfxBinding, type SfxPlayer } from '../app/sfxBinding';
import type { SessionEvent } from '../app/events';
import type { PublicGameState } from '../domain/types';

function publicState(phase: PublicGameState['phase'], currentPlayerId: number | null): PublicGameState {
  return {
    phase,
    players: [],
    turnOrder: [],
    currentPlayerId,
    field: [],
    hand: [],
    deckCount: 0,
    handSize: 6,
    winnerId: null,
  };
}

function stateEvent(
  phase: PublicGameState['phase'],
  currentPlayerId: number | null,
  viewerId: number,
): SessionEvent {
  return { type: 'state', view: publicState(phase, currentPlayerId), viewerId };
}

function recorder() {
  const calls: string[] = [];
  const player: SfxPlayer = {
    playSuccess: () => calls.push('success'),
    playFail: () => calls.push('fail'),
    playPass: () => calls.push('pass'),
    playTurn: () => calls.push('turn'),
    playWin: () => calls.push('win'),
  };
  return { calls, binding: new SfxBinding(player) };
}

describe('SfxBinding', () => {
  it('maps action results to the same sounds in guest mode (オンラインでも失敗音が鳴る)', () => {
    const { calls, binding } = recorder();
    binding.reset('guest');

    binding.handle({
      type: 'action-result',
      result: { kind: 'submit-failed', playerId: 1, playerName: 'Guest', drew: true },
    });
    binding.handle({
      type: 'action-result',
      result: { kind: 'passed', playerId: 1, playerName: 'Guest', drew: false },
    });

    expect(calls).toEqual(['fail', 'pass']);
  });

  it('plays success for a fused action unless the latest state is finished', () => {
    const { calls, binding } = recorder();
    binding.reset('local');
    const fused: SessionEvent = {
      type: 'action-result',
      result: { kind: 'fused', playerId: 0, playerName: 'Host', char: '相' },
    };

    binding.handle(stateEvent('playing', 0, 0));
    binding.handle(fused);
    binding.handle(stateEvent('finished', 0, 0));
    binding.handle(fused);

    expect(calls).toEqual(['success', 'win']);
  });

  it('plays a turn sound only when an online viewer receives the turn', () => {
    const online = recorder();
    online.binding.reset('guest');
    online.binding.handle(stateEvent('playing', 0, 1));
    online.binding.handle(stateEvent('playing', 1, 1));
    expect(online.calls).toEqual(['turn']);

    // ローカルは同一端末で交代するので手番通知は鳴らさない。
    const local = recorder();
    local.binding.reset('local');
    local.binding.handle(stateEvent('playing', 0, 0));
    local.binding.handle(stateEvent('playing', 1, 1));
    expect(local.calls).toEqual([]);
  });

  it('does not misfire win/turn on the first state after reset (セッション生成中の同期イベント)', () => {
    const { calls, binding } = recorder();
    binding.reset('guest');
    // WELCOME が構築中に flush されるケース: 初回 state では前局面が無いので鳴らさない。
    binding.handle(stateEvent('finished', 1, 1));
    expect(calls).toEqual([]);
  });
});
