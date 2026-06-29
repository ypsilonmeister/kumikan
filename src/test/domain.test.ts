import { describe, expect, it } from 'vitest';
import { createDeck, makePart } from '../domain/deck';
import { checkCombination, KANJI_RECIPES, recipeKey, RECIPES_PER_GAME } from '../domain/recipes';
import { FIELD_SIZE, checkGameEnd, nextTurn, passTurn, refillField, submitPart } from '../domain/engine';
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
    field: [makePart('木', 5)],
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
    expect(Object.keys(KANJI_RECIPES)).toHaveLength(298);
    expect(checkCombination('さんずい', '青')).toBe('清');
    expect(checkCombination('忄', '生')).toBe('性');
    expect(checkCombination('門', '耳')).toBe('聞');
    expect(checkCombination('艹', '化')).toBe('花');
    expect(checkCombination('辶', '首')).toBe('道');
    expect(checkCombination('辶', '車')).toBe('連');
    expect(checkCombination('囗', '玉')).toBe('国');
    expect(checkCombination('囗', '木')).toBe('困');
    // Gemini データから追加した教育漢字レシピの例。
    expect(checkCombination('言', '舌')).toBe('話');
    expect(checkCombination('木', '林')).toBe('森');
    expect(checkCombination('立', '日')).toBe('音');
  });

  it('builds the deck from a per-game recipe subset (適量の山札)', () => {
    const copies = 2;
    // 抽選した RECIPES_PER_GAME 件ぶんのパーツ × copies。
    expect(createDeck(copies)).toHaveLength(RECIPES_PER_GAME * 2 * copies);
  });

  it('labels radical parts with their reading (しんにょう など)', () => {
    const shinnyou = makePart('辶', 0);
    expect(shinnyou.label).toBe('しんにょう');
    expect(shinnyou.reading).toBe('しんにょう');
    expect(shinnyou.image).toBe('shinnyou.svg'); // 部首は画像表示
    expect(shinnyou.kind).toBe('辶'); // 照合キーは部首のまま

    // 単体で読める漢字パーツはグリフのまま。
    const ki = makePart('木', 1);
    expect(ki.label).toBe('木');
    expect(ki.reading).toBeUndefined();
  });
});

describe('engine', () => {
  it('scores a kanji, removes the used hand+field cards, and refills', () => {
    const state = baseState();
    // 目 を出す → 木+目=相。使った場札 木 は除去され、山札 日 が補充される。
    const result = submitPart(state, 0, state.players[0].hand[0].id);

    expect(result.outcome).toBe('success');
    expect(result.kanji?.char).toBe('相');
    expect(result.state.players[0].hand.map((part) => part.kind)).toEqual(['火']);
    expect(result.state.players[0].score).toHaveLength(1);
    // 木 は消費され、補充で 日 が並ぶ。手番は据え置き（同じプレイヤー）。
    expect(result.state.field.map((part) => part.kind)).toEqual(['日']);
    expect(result.state.currentTurnIndex).toBe(0);
  });

  it('combines with a chosen field card when fieldPartId is given', () => {
    const state: GameState = {
      ...baseState(),
      field: [makePart('木', 5), makePart('女', 6)],
      deck: [],
    };
    // 子 を 女 に重ねる（女+子=好）。木 は残る。
    const child = makePart('子', 7);
    state.players[0].hand = [child];
    const result = submitPart(state, 0, child.id, state.field[1].id);

    expect(result.outcome).toBe('success');
    expect(result.kanji?.char).toBe('好');
    expect(result.state.field.map((p) => p.kind)).toEqual(['木']);
  });

  it('rejects actions from a player who does not have the turn', () => {
    const state = baseState();
    const result = submitPart(state, 1, state.players[1].hand[0].id);

    expect(result.outcome).toBe('fail');
    expect(result.state).toBe(state);
  });

  it('advances the turn and keeps the field across turns', () => {
    const state = baseState(); // field=[木], deck=[日]
    const advanced = nextTurn(state);

    expect(advanced.currentTurnIndex).toBe(1);
    // 場札は持ち越し、不足分のみ補充（木 + 日 で 2 枚に）。
    expect(advanced.field.map((p) => p.kind).sort()).toEqual(['日', '木']);
    expect(advanced.deck).toHaveLength(0);
  });

  it('keeps playing when the deck is empty but field cards remain', () => {
    const state = baseState();
    const updated = checkGameEnd({
      ...state,
      deck: [],
      field: [makePart('木', 9)],
    });

    expect(updated.phase).toBe('playing');
  });

  it('recycles the field into the deck on pass (手詰まり解消)', () => {
    const state: GameState = {
      ...baseState(),
      field: [makePart('木', 20), makePart('火', 21)],
      deck: [makePart('日', 22), makePart('月', 23), makePart('女', 24)],
    };
    const passed = passTurn(state);

    // 手番が進み、場札は新しい 3 枚に入れ替わる。
    expect(passed.currentTurnIndex).toBe(1);
    expect(passed.field).toHaveLength(FIELD_SIZE);
    // 元の場札（木・火）は山札の底に戻り、新しい場札には出ていない。
    expect(passed.field.map((p) => p.kind)).toEqual(['日', '月', '女']);
    // 全カードは保存される（場2 + 山3 = 5）。
    expect(passed.field.length + passed.deck.length).toBe(5);
  });

  it('does not lose cards on pass when the deck is empty', () => {
    const state: GameState = {
      ...baseState(),
      field: [makePart('木', 30)],
      deck: [],
    };
    const passed = passTurn(state);
    expect(passed.field.map((p) => p.kind)).toEqual(['木']); // 入れ替えなし
  });

  it('refills the field up to FIELD_SIZE from the deck', () => {
    const state: GameState = {
      ...baseState(),
      field: [],
      deck: [makePart('木', 10), makePart('日', 11), makePart('月', 12), makePart('火', 13)],
    };
    const filled = refillField(state);
    expect(filled.field).toHaveLength(FIELD_SIZE); // 3 枚補充
    expect(filled.deck).toHaveLength(1); // 残り 1 枚
  });

  it('finishes when the deck is exhausted and the field is empty', () => {
    const state = baseState();
    const finished = checkGameEnd({
      ...state,
      deck: [],
      field: [],
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


