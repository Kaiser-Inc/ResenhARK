import { requiredCards } from "./engine.js";

/**
 * The deck a new game plays: the cards the room has not dealt yet. When those cannot fill the hands
 * the room's memory resets and the whole deck plays, but the cards the room had not seen come back
 * as `priority`, so they are still dealt first. Not even the whole deck enough: no deck.
 */
export function pickDeck(
  all: string[],
  used: string[],
  players: number,
): { ok: true; pool: string[]; used: string[]; priority: string[] } | { ok: false } {
  const needed = requiredCards(players);
  const seen = new Set(used);
  const unused = all.filter((id) => !seen.has(id));
  if (unused.length >= needed) return { ok: true, pool: unused, used, priority: [] };
  if (all.length >= needed) return { ok: true, pool: [...all], used: [], priority: unused };
  return { ok: false };
}
