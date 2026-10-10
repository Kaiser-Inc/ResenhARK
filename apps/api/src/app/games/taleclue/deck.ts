import { requiredCards } from "./engine.js";

/**
 * The deck a new game plays: the cards the room has not dealt yet. When those cannot fill the hands
 * the room's memory resets and the whole deck plays. Not even the whole deck enough: no deck.
 */
export function pickDeck(
  all: string[],
  used: string[],
  players: number,
): { ok: true; pool: string[]; used: string[] } | { ok: false } {
  const needed = requiredCards(players);
  const seen = new Set(used);
  const unused = all.filter((id) => !seen.has(id));
  if (unused.length >= needed) return { ok: true, pool: unused, used };
  if (all.length >= needed) return { ok: true, pool: [...all], used: [] };
  return { ok: false };
}
