import { checkCombination } from './recipes';
import { createDeck, dealPlayers, shuffle, type RandomFn } from './deck';
import type { GameState, Kanji, Part, Player, PublicGameState } from './types';

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
  const deck = shuffle(createDeck(), random);
  const dealt = dealPlayers(players, deck, handSize);
  const initialState: GameState = {
    phase: 'playing',
    players: dealt.players,
    turnOrder: dealt.players.map((player) => player.id),
    currentTurnIndex: 0,
    deck: dealt.deck,
    field: null,
    handSize,
    winnerId: null,
  };

  return drawField(initialState);
}

export function drawField(state: GameState): GameState {
  if (state.phase !== 'playing') {
    return state;
  }

  const [field, ...deck] = state.deck;
  if (!field) {
    return checkGameEnd({
      ...state,
      field: null,
    });
  }

  return checkGameEnd({
    ...state,
    deck,
    field,
  });
}

export function submitPart(state: GameState, playerId: number, partId: string): SubmitResult {
  if (state.phase !== 'playing' || !state.field || currentPlayerId(state) !== playerId) {
    return { state, outcome: 'fail' };
  }

  const players = clonePlayers(state.players);
  const player = players.find((item) => item.id === playerId);
  if (!player) {
    return { state, outcome: 'fail' };
  }

  const partIndex = player.hand.findIndex((part) => part.id === partId);
  const selectedPart = player.hand[partIndex];
  if (!selectedPart) {
    return { state, outcome: 'fail' };
  }

  const char = checkCombination(state.field.kind, selectedPart.kind);
  if (!char) {
    return { state, outcome: 'fail' };
  }

  const kanji: Kanji = {
    char,
    from: [state.field.kind, selectedPart.kind],
  };

  player.hand.splice(partIndex, 1);
  player.score.push(kanji);

  return {
    state: checkGameEnd({
      ...state,
      players,
      field: null,
    }),
    outcome: 'success',
    kanji,
  };
}

export function nextTurn(state: GameState): GameState {
  if (state.phase !== 'playing') {
    return state;
  }

  const nextIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
  return drawField({
    ...state,
    currentTurnIndex: nextIndex,
    field: null,
  });
}

export function passTurn(state: GameState): GameState {
  return nextTurn(state);
}

export function checkGameEnd(state: GameState): GameState {
  if (state.phase !== 'playing') {
    return state;
  }

  const hasEmptyHand = state.players.some((player) => player.hand.length === 0);
  // 山札が尽きて場札も出せない状態は、手番が回らないため終了とする。
  const deckExhausted = state.deck.length === 0 && !state.field;
  if (!hasEmptyHand && !deckExhausted) {
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

export function findPlayablePart(field: Part | null, hand: Part[]): Part | null {
  if (!field) {
    return null;
  }

  return hand.find((part) => checkCombination(field.kind, part.kind)) ?? null;
}