import { checkCombination } from './recipes';
import { createDeck, dealPlayers, shuffle, type RandomFn } from './deck';
import type { GameState, Kanji, Part, Player, PublicGameState } from './types';

/** 場札の通常補充枚数。パス時はこれを超えて積み増される（上限ではない）。 */
export const FIELD_SIZE = 3;

export interface SubmitResult {
  state: GameState;
  outcome: 'success' | 'fail';
  kanji?: Kanji;
}

function clonePlayers(players: Player[]): Player[] {
  return players.map((player) => ({
    ...player,
    hand: [...player.hand],
    score: [...player.score],
  }));
}

function currentPlayerId(state: GameState): number | null {
  return state.turnOrder[state.currentTurnIndex] ?? null;
}

function winnerByScore(players: Player[]): number | null {
  if (players.length === 0) {
    return null;
  }

  const sorted = [...players].sort((a, b) => {
    const scoreDelta = b.score.length - a.score.length;
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return a.hand.length - b.hand.length;
  });

  return sorted[0].id;
}

export function startGame(players: Player[], handSize: number, random: RandomFn = Math.random): GameState {
  const deck = shuffle(createDeck(2, random), random);
  const dealt = dealPlayers(players, deck, handSize);
  const initialState: GameState = {
    phase: 'playing',
    players: dealt.players,
    turnOrder: dealt.players.map((player) => player.id),
    currentTurnIndex: 0,
    deck: dealt.deck,
    field: [],
    handSize,
    winnerId: null,
  };

  return refillField(initialState);
}

/** 場札が FIELD_SIZE 未満なら山札から補充する。 */
export function refillField(state: GameState): GameState {
  if (state.phase !== 'playing') {
    return state;
  }

  const field = [...state.field];
  const deck = [...state.deck];
  while (field.length < FIELD_SIZE && deck.length > 0) {
    field.push(deck.shift() as Part);
  }

  return checkGameEnd({ ...state, field, deck });
}

/** 後方互換のためのエイリアス（手番開始時の場札補充）。 */
export const drawField = refillField;

/**
 * 手札のパーツを場札と合体させて提示する。
 * fieldPartId 省略時は、合体できる最初の場札を自動で選ぶ（タップ操作向け）。
 */
export function submitPart(
  state: GameState,
  playerId: number,
  handPartId: string,
  fieldPartId?: string,
): SubmitResult {
  if (state.phase !== 'playing' || state.field.length === 0 || currentPlayerId(state) !== playerId) {
    return { state, outcome: 'fail' };
  }

  const players = clonePlayers(state.players);
  const player = players.find((item) => item.id === playerId);
  if (!player) {
    return { state, outcome: 'fail' };
  }

  const handIndex = player.hand.findIndex((part) => part.id === handPartId);
  const handPart = player.hand[handIndex];
  if (!handPart) {
    return { state, outcome: 'fail' };
  }

  // 合体相手の場札を決める。指定があればそれ、無ければ最初に成立するもの。
  const fieldIndex = fieldPartId
    ? state.field.findIndex((part) => part.id === fieldPartId)
    : state.field.findIndex((part) => checkCombination(part.kind, handPart.kind));
  const fieldPart = state.field[fieldIndex];
  if (!fieldPart) {
    return { state, outcome: 'fail' };
  }

  const char = checkCombination(fieldPart.kind, handPart.kind);
  if (!char) {
    return { state, outcome: 'fail' };
  }

  const kanji: Kanji = { char, from: [fieldPart.kind, handPart.kind] };
  player.hand.splice(handIndex, 1);
  player.score.push(kanji);

  // 使った場札を取り除き、補充する（同じプレイヤーが続けて行動）。
  const field = state.field.filter((part) => part.id !== fieldPart.id);

  return {
    state: refillField({ ...state, players, field }),
    outcome: 'success',
    kanji,
  };
}

export function nextTurn(state: GameState): GameState {
  if (state.phase !== 'playing') {
    return state;
  }

  const nextIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
  // 場札は持ち越し（毎ターン入れ替えない）。不足分だけ補充する。
  return refillField({
    ...state,
    currentTurnIndex: nextIndex,
  });
}

/**
 * パス。手番を次へ進めつつ、**場札を山札から1枚増やす**（入れ替えではなく追加）。
 * パスのたびに合体候補が積み上がるので、場札がどの手札とも合わずに
 * 全員がパスし続ける事故を防ぐ。山札が空なら追加せず手番送りのみ。
 */
export function passTurn(state: GameState): GameState {
  if (state.phase !== 'playing') {
    return state;
  }

  const nextIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;

  // 山札が無ければ追加できないので通常の手番送りのみ。
  if (state.deck.length === 0) {
    return checkGameEnd({ ...state, currentTurnIndex: nextIndex });
  }

  // 既存の場札はそのまま残し、山札から1枚だけ場に足す。
  const deck = [...state.deck];
  const field = [...state.field, deck.shift() as Part];
  return checkGameEnd({ ...state, currentTurnIndex: nextIndex, field, deck });
}

export function checkGameEnd(state: GameState): GameState {
  if (state.phase !== 'playing') {
    return state;
  }

  const hasEmptyHand = state.players.some((player) => player.hand.length === 0);
  // 山札が尽きて場札も無い（補充できない）状態は手番が回らないため終了。
  const deckExhausted = state.deck.length === 0 && state.field.length === 0;
  // 山札が尽き、誰の手札も場札と合体できない詰み状態。
  // 新仕様ではパスで場札が増えるだけなので、これを終了にしないと
  // 「パスしても不成立提出しても盤面が変わらない」無限ループになる。
  const deadlocked =
    state.deck.length === 0 &&
    !state.players.some((player) => findPlayablePart(state.field, player.hand) !== null);
  if (!hasEmptyHand && !deckExhausted && !deadlocked) {
    return state;
  }

  return {
    ...state,
    phase: 'finished',
    winnerId: winnerByScore(state.players),
  };
}

export function toPublicGameState(state: GameState, viewerId: number): PublicGameState {
  return {
    phase: state.phase,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      handCount: player.hand.length,
      score: player.score,
      connected: player.connected,
      isYou: player.id === viewerId,
    })),
    turnOrder: state.turnOrder,
    currentPlayerId: currentPlayerId(state),
    field: state.field,
    hand: state.players.find((player) => player.id === viewerId)?.hand ?? [],
    deckCount: state.deck.length,
    handSize: state.handSize,
    winnerId: state.winnerId,
  };
}

/** 手札の中で、いずれかの場札と合体できる最初のパーツを返す（ヒント用）。 */
export function findPlayablePart(field: Part[], hand: Part[]): Part | null {
  if (field.length === 0) {
    return null;
  }
  return (
    hand.find((part) => field.some((fieldPart) => checkCombination(fieldPart.kind, part.kind))) ??
    null
  );
}