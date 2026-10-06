import type { Ctx } from "../system.js";
import type { Card } from "./engine.js";

export const card = (id: string, year: number, title = id, artists = [`${id} artist`]): Card => ({
  id,
  title,
  artists,
  year,
  isrc: null,
  spotifyUrl: null,
});

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fixedCtx(now = 0): Ctx {
  const rng = mulberry32(1);
  let n = 0;
  return { now, rng, newId: () => `d${++n}` };
}

/** Deterministic deck; years 1950.. spread so they never hit 1987-colliding values by accident. */
export const deckOf = (n: number): Card[] =>
  Array.from({ length: n }, (_, i) => card(`c${i}`, 1950 + i));
