import { type Decade, decadeOf } from "@resenhark/shared";
import { shuffle } from "../../core/shuffle.js";
import type { CatalogCard } from "./catalog.js";
import type { Card } from "./engine.js";

export function inDecades<T extends Card>(cards: T[], decades: readonly Decade[]): T[] {
  const chosen = new Set(decades);
  return cards.filter((card) => chosen.has(decadeOf(card.year)));
}

/** Three times what the seated players can win with, so draws stay varied; at least 60. */
export const deckSize = (players: number, targetCards: number): number =>
  Math.max(60, players * targetCards * 3);

/**
 * Takes one card per genre in turn until `size`: equal shares, and a genre that runs out leaves
 * its share to the others.
 */
export function drawBalanced(
  cards: CatalogCard[],
  genres: number[],
  size: number,
  rng: () => number,
): CatalogCard[] {
  const piles = genres.map((genre) =>
    shuffle(
      cards.filter((c) => c.genre === genre),
      rng,
    ),
  );
  const deck: CatalogCard[] = [];
  for (let i = 0; deck.length < size && piles.some((p) => i < p.length); i++) {
    for (const pile of piles) if (i < pile.length && deck.length < size) deck.push(pile[i]);
  }
  return deck;
}
