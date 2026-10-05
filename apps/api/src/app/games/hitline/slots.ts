import type { Card } from "./engine.js";

export function isCorrectSlot(timeline: Card[], slot: number, year: number): boolean {
  const prev = timeline[slot - 1];
  const next = timeline[slot];
  return (!prev || prev.year <= year) && (!next || year <= next.year);
}

export function correctSlot(timeline: Card[], year: number): number {
  for (let i = 0; i <= timeline.length; i++) if (isCorrectSlot(timeline, i, year)) return i;
  return timeline.length;
}

export function insertAt(timeline: Card[], slot: number, card: Card): Card[] {
  return [...timeline.slice(0, slot), card, ...timeline.slice(slot)];
}
