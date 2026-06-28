import type { Part, Player } from './types';
import { recipeParts } from './recipes';

export type RandomFn = () => number;

export function makePart(kind: string, index: number): Part {
  return {
    id: `part_${index}_${kind}`,
    kind,
    label: kind,
  };
}

export function createDeck(copies = 2): Part[] {
  const kinds = Array.from({ length: copies }, () => recipeParts()).flat();
  return kinds.map((kind, index) => makePart(kind, index));
}

export function shuffle<T>(items: T[], random: RandomFn = Math.random): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function createPlayers(names: string[]): Player[] {
  return names.map((name, index) => ({
    id: index,
    name: name.trim() || `プレイヤー${index + 1}`,
    hand: [],
    score: [],
    connected: true,
  }));
}

export function dealPlayers(players: Player[], deck: Part[], handSize: number): { players: Player[]; deck: Part[] } {
  const nextDeck = [...deck];
  const nextPlayers = players.map((player) => ({ ...player, hand: [] as Part[] }));

  for (let cardIndex = 0; cardIndex < handSize; cardIndex += 1) {
    for (const player of nextPlayers) {
      const card = nextDeck.shift();
      if (card) {
        player.hand.push(card);
      }
    }
  }

  return { players: nextPlayers, deck: nextDeck };
}
