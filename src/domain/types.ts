export interface Part {
  id: string;
  kind: string;
  label: string;
}

export interface Kanji {
  char: string;
  from: string[];
}

export interface Player {
  id: number;
  name: string;
  hand: Part[];
  score: Kanji[];
  connected: boolean;
}

export type Phase = 'lobby' | 'connecting' | 'playing' | 'finished';

export interface GameState {
  phase: Phase;
  players: Player[];
  turnOrder: number[];
  currentTurnIndex: number;
  deck: Part[];
  field: Part | null;
  handSize: number;
  winnerId: number | null;
}

export interface PublicPlayer {
  id: number;
  name: string;
  handCount: number;
  score: Kanji[];
  connected: boolean;
  isYou?: boolean;
}

export interface PublicGameState {
  phase: Phase;
  players: PublicPlayer[];
  turnOrder: number[];
  currentPlayerId: number | null;
  field: Part | null;
  hand: Part[];
  deckCount: number;
  handSize: number;
  winnerId: number | null;
}
