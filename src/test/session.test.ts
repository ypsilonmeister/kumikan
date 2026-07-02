import { describe, expect, it } from 'vitest';
import { makePart } from '../domain/deck';
import { LocalSession } from '../app/localSession';
import type { SessionEvent } from '../app/events';
import type { GameState } from '../domain/types';

/** 2人、手番=0、場札「木」、手札に「目」(成立→相) と「火」(不成立)、山札2枚。 */
function localState(): GameState {
  return {
    phase: 'playing',
    players: [
      { id: 0, name: 'A', hand: [makePart('目', 1), makePart('火', 2)], score: [], connected: true },
      { id: 1, name: 'B', hand: [makePart('月', 3)], score: [], connected: true },
    ],
    turnOrder: [0, 1],
    currentTurnIndex: 0,
    deck: [makePart('日', 4), makePart('土', 5)],
    field: [makePart('木', 6)],
    handSize: 2,
    winnerId: null,
  };
}

function collect() {
  const events: SessionEvent[] = [];
  const session = new LocalSession(localState(), (e) => events.push(e));
  return { events, session };
}

function lastState(events: SessionEvent[]) {
  return [...events].reverse().find((e) => e.type === 'state');
}

describe('LocalSession', () => {
  it('emits an initial state event with the turn player as viewer', () => {
    const { events } = collect();
    const states = events.filter((e) => e.type === 'state');
    expect(states).toHaveLength(1);
    const first = states[0];
    if (first.type === 'state') {
      expect(first.viewerId).toBe(0);
    }
  });

  it('fires fusion → state → action-result and keeps the turn on success', () => {
    const { events, session } = collect();
    events.length = 0; // 構築時の初期 state を除いて計測する。
    session.submit('part_1_目');

    const types = events.map((e) => e.type);
    // 順序: fusion → state → action-result。
    expect(types).toEqual(['fusion', 'state', 'action-result']);

    const fusion = events.find((e) => e.type === 'fusion');
    expect(fusion?.type === 'fusion' && fusion.event.char).toBe('相');

    const result = events.find((e) => e.type === 'action-result');
    expect(result?.type === 'action-result' && result.result).toEqual({
      kind: 'fused',
      playerId: 0,
      playerName: 'A',
      char: '相',
    });

    const state = lastState(events);
    expect(state?.type === 'state' && state.viewerId).toBe(0); // 手番維持。
  });

  it('reports submit-failed with drew=true and advances the turn on a non-matching part', () => {
    const { events, session } = collect();
    events.length = 0;
    session.submit('part_2_火'); // 木+火 は不成立。

    const result = events.find((e) => e.type === 'action-result');
    expect(result?.type === 'action-result' && result.result).toEqual({
      kind: 'submit-failed',
      playerId: 0,
      playerName: 'A',
      drew: true,
    });

    const state = lastState(events);
    expect(state?.type === 'state' && state.viewerId).toBe(1); // 手番交代。
  });

  it('reports passed with drew=true and advances the turn on pass', () => {
    const { events, session } = collect();
    events.length = 0;
    session.pass();

    const result = events.find((e) => e.type === 'action-result');
    expect(result?.type === 'action-result' && result.result).toEqual({
      kind: 'passed',
      playerId: 0,
      playerName: 'A',
      drew: true,
    });

    const state = lastState(events);
    expect(state?.type === 'state' && state.viewerId).toBe(1); // 手番交代。
    // 山札が2枚（手札+場札に1枚ずつ）減る。
    if (state?.type === 'state') {
      expect(state.view.deckCount).toBe(0);
    }
  });

  it('emits nothing for a stale/unknown partId (state unchanged)', () => {
    const { events, session } = collect();
    events.length = 0;
    session.submit('does_not_exist');
    expect(events).toHaveLength(0);
  });

  it('hint returns the playable hand part (目) against field 木', () => {
    const { session } = collect();
    const playable = session.hint();
    expect(playable?.kind).toBe('目');
  });
});
