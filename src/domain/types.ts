export interface Part {
  id: string;
  kind: string;
  label: string;
  /** 部首など、読みが分かりにくいパーツの「よみ」（任意）。表示で併記する。 */
  reading?: string;
  /** 部首画像のファイル名（public/parts/ 配下）。あれば文字でなく画像で表示。 */
  image?: string;
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
  /**
   * 場に表向きで並ぶ場札。通常は FIELD_SIZE 枚に補充されるが、
   * パスのたびに山札から1枚ずつ積み増されるため上限を超えて増えることがある。
   */
  field: Part[];
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
  field: Part[];
  hand: Part[];
  deckCount: number;
  handSize: number;
  winnerId: number | null;
}
