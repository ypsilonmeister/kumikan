import { describe, expect, it } from 'vitest';
import { createDeck, makePart } from '../domain/deck';
import { checkCombination, KANJI_RECIPES, recipeKey } from '../domain/recipes';
import { checkGameEnd, drawField, nextTurn, submitPart } from '../domain/engine';
import type { GameState } from '../domain/types';

function baseState(): GameState {
  return {
    phase: 'playing',
    players: [
      {
        id: 0,
        name: 'A',
        hand: [makePart('目', 1), makePart('火', 2)],
        score: [],
        connected: true,
      },
      {
        id: 1,
        name: 'B',
        hand: [makePart('月', 3)],
        score: [],
        connected: true,
      },
    ],
    turnOrder: [0, 1],
    currentTurnIndex: 0,
    deck: [makePart('日', 4)],
    field: makePart('木', 5),
    handSize: 2,
    winnerId: null,
  };
}

describe('recipes', () => {
  it('checks combinations without depending on order', () => {
    expect(checkCombination('木', '目')).toBe('相');
    expect(checkCombination('目', '木')).toBe('相');
    expect(checkCombination('火', '目')).toBeNull();
  });

  it('normalizes every recipe key and resolves both input orders', () => {
    for (const [key, char] of Object.entries(KANJI_RECIPES)) {
      const [kindA, kindB] = key.split(',');

      expect(key).toBe(recipeKey(kindA, kindB));
      expect(checkCombination(kindA, kindB)).toBe(char);
      expect(checkCombination(kindB, kindA)).toBe(char);
    }
  });

  it('includes the expanded kanji part set', () => {
    expect(Object.keys(KANJI_RECIPES)).toHaveLength(85);
    expect(checkCombination('さんずい', '青')).toBe('清');
    expect(checkCombination('忄', '生')).toBe('性');
    expect(checkCombination('門', '耳')).toBe('聞');
    expect(checkCombination('艹', '化')).toBe('花');
    expect(checkCombination('辶', '首')).toBe('道');
    expect(checkCombination('辶', '車')).toBe('連');
    expect(checkCombination('囗', '玉')).toBe('国');
    expect(checkCombination('囗', '木')).toBe('困');
  });

  it('builds the deck from every recipe part occurrence', () => {
    const copies = 2;
    expect(createDeck(copies)).toHaveLength(Object.keys(KANJI_RECIPES).length * 2 * copies);
  });
});

describe('engine', () => {
  it('scores a kanji and removes the submitted part on success', () => {
    const state = baseState();
    const result = submitPart(state, 0, state.players[0].hand[0].id);

    expect(result.outcome).toBe('success');
    expect(result.kanji?.char).toBe('相');
    expect(result.state.players[0].hand.map((part) => part.kind)).toEqual(['火']);
    expect(result.state.players[0].score).toHaveLength(1);
    expect(result.state.field).toBeNull();
  });

  it('rejects actions from a player who does not have the turn', () => {
    const state = baseState();
    const result = submitPart(state, 1, state.players[1].hand[0].id);

    expect(result.outcome).toBe('fail');
    expect(result.state).toBe(state);
  });

  it('draws a fresh field card when advancing the turn', () => {
    const state = baseState();
    const advanced = nextTurn(state);

    expect(advanced.currentTurnIndex).toBe(1);
    expect(advanced.field?.kind).toBe('日');
    expect(advanced.deck).toHaveLength(0);
  });

  it('can draw a new field card while keeping the same turn after success', () => {
    const state = baseState();
    const result = submitPart(state, 0, state.players[0].hand[0].id);
    const continued = drawField(result.state);

    expect(result.outcome).toBe('success');
    expect(continued.currentTurnIndex).toBe(0);
    expect(continued.field?.kind).toBe('日');
  });

  it('keeps playing when the deck is empty but a field card is still in play', () => {
    const state = baseState();
    // 場札が出ている間は手番を続けられる（checkGameEnd は終了しない）。
    const updated = checkGameEnd({
      ...state,
      deck: [],
      field: makePart('木', 9),
    });

    expect(updated.phase).toBe('playing');
  });

  it('finishes when the deck is exhausted and no field card can be drawn', () => {
    const state = baseState();
    const finished = drawField({
      ...state,
      deck: [],
      field: null,
    });

    expect(finished.phase).toBe('finished');
  });

  it('finishes when a player has no hand and chooses the highest score', () => {
    const state = baseState();
    const finished = checkGameEnd({
      ...state,
      players: [
        { ...state.players[0], hand: [], score: [{ char: '相', from: ['木', '目'] }] },
        state.players[1],
      ],
    });

    expect(finished.phase).toBe('finished');
    expect(finished.winnerId).toBe(0);
  });
});


