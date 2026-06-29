import type { Part, Player } from './types';
import { partImageFile, partReading, pickRecipeParts } from './recipes';

export type RandomFn = () => number;

export function makePart(kind: string, index: number): Part {
  const reading = partReading(kind) ?? undefined;
  const image = partImageFile(kind) ?? undefined;
  return {
    id: `part_${index}_${kind}`,
    kind,
    // 読みのある部首は、形が紛らわしいグリフではなく読みを主表示にする。
    label: reading ?? kind,
    reading,
    image,
  };
}

/**
 * 山札を作る。1 ゲーム分に抽選したレシピのパーツ列を copies 回ぶん並べる。
 * 抽選は一度だけ行い、それを copies 回複製する（毎回別レシピにしない）。
 * 抽選により山札サイズを適量に保ち、組み合わせが成立しやすくする。
 */
export function createDeck(copies = 2, random: RandomFn = Math.random): Part[] {
  const picked = pickRecipeParts(undefined, random);
  const kinds = Array.from({ length: copies }, () => picked).flat();
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
