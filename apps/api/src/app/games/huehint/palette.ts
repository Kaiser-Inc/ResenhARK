import type { Hsb } from "@resenhark/shared";
import { shuffle } from "../../core/shuffle.js";
import { deltaE2000, hsbToLab, lchToHsb } from "./color.js";

/** Below this brightness colors read as "dark" and look alike; at most one per 6 rounds. */
export const DARK_BELOW = 35;
/** A new color stays at least this far (CIEDE2000) from every earlier color of the same game. */
export const MIN_DELTA_E = 30;
/**
 * A new color stays at least this far from the newest colors the room drew in earlier games, and
 * OLDER_DELTA_E from the rest. A flat 20 against 60 colors cannot hold: the sRGB gamut fits about
 * 25 colors that far apart, and in simulation only 1% of draws cleared 60.
 */
export const RECENT_DELTA_E = 20;
export const OLDER_DELTA_E = 12;
export const NEWEST_COUNT = 8;
const DARK_WINDOW = 6;
const NEUTRAL_CHANCE = 0.1;
const TRIES = 200;

export function saturationBand(s: number): "vivid" | "soft" | "neutral" {
  return s >= 40 ? "vivid" : s >= 15 ? "soft" : "neutral";
}

/** A box in CIELCH: lightness, chroma and hue degrees (the hue range may pass 360). */
export type Family = {
  name: string;
  l: [number, number];
  c: [number, number];
  h: [number, number];
};

/** 12 perceptual families, sampled in LCH so each one looks like its own named color. */
export const FAMILIES: Family[] = [
  { name: "red", l: [40, 60], c: [55, 90], h: [20, 40] },
  { name: "orange", l: [60, 75], c: [60, 85], h: [55, 70] },
  { name: "yellow", l: [85, 95], c: [70, 95], h: [90, 102] },
  { name: "lime", l: [75, 88], c: [60, 90], h: [115, 130] },
  { name: "green", l: [45, 70], c: [45, 80], h: [140, 160] },
  { name: "cyan", l: [60, 80], c: [30, 55], h: [190, 215] },
  { name: "blue", l: [35, 60], c: [50, 90], h: [255, 275] },
  { name: "purple", l: [30, 55], c: [50, 80], h: [295, 315] },
  { name: "lavender", l: [70, 85], c: [20, 40], h: [275, 295] },
  { name: "pink", l: [55, 80], c: [30, 65], h: [340, 365] },
  { name: "brown", l: [28, 45], c: [25, 40], h: [50, 70] },
  { name: "beige", l: [78, 90], c: [12, 24], h: [75, 90] },
];

/** One color inside the family's box, kept to brightness 15..95. */
export function sampleFamily(family: Family, rng: () => number): Hsb {
  const between = ([min, max]: [number, number]) => min + rng() * (max - min);
  const color = lchToHsb(between(family.l), between(family.c), between(family.h) % 360);
  return { ...color, b: Math.min(95, Math.max(15, color.b)) };
}

function neutralColor(rng: () => number): Hsb {
  const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  return { h: int(0, 359), s: int(0, 14), b: int(15, 95) };
}

type Lab = ReturnType<typeof hsbToLab>;

/**
 * The room to spare of a color: its smallest distance to each group, minus that group's minimum.
 * Gives up early (returning the margin so far) once it cannot beat `floor`.
 */
function marginOf(lab: Lab, floor: number, groups: [Lab[], number][]): number {
  let margin = Number.POSITIVE_INFINITY;
  for (const [others, minimum] of groups) {
    for (const other of others) {
      margin = Math.min(margin, deltaE2000(lab, other) - minimum);
      if (margin <= floor) return margin;
    }
  }
  return margin;
}

export type DrawnRound = { family: string | null; color: Hsb };

/**
 * One color per round. Families come in shuffled blocks of 12, so no two rounds in a row share one
 * and every block covers all of them. A round may instead be a neutral color (10% a round, at most
 * one per game). At most one dark color in any 6 rounds. Each color is redrawn until it is
 * MIN_DELTA_E from every earlier color of the game, RECENT_DELTA_E from the newest colors in
 * `recent` (the room's earlier games, oldest first) and OLDER_DELTA_E from the rest; when no try
 * gets there, the one with the most room to spare is kept.
 */
export function drawRounds(count: number, rng: () => number, recent: Hsb[] = []): DrawnRound[] {
  const memory = recent.map(hsbToLab);
  const newest = memory.slice(-NEWEST_COUNT);
  const older = memory.slice(0, -NEWEST_COUNT);
  // Families left in the current block of 12; each is used once before any repeats.
  let unused: Family[] = [];
  let lastFamily: Family | null = null;
  let neutralUsed = false;
  const drawn: DrawnRound[] = [];
  const earlier: Lab[] = [];
  for (let round = 0; round < count; round++) {
    const darkAllowed = !drawn.slice(1 - DARK_WINDOW).some((r) => r.color.b < DARK_BELOW);
    const neutral = !neutralUsed && rng() < NEUTRAL_CHANCE;
    if (!neutral && unused.length === 0) unused = FAMILIES.filter((f) => f !== lastFamily);
    let best: DrawnRound | null = null;
    let bestMargin = Number.NEGATIVE_INFINITY;
    for (let attempt = 0; attempt < TRIES && bestMargin < 0; attempt++) {
      // Each try picks among the families still unused, so a crowded one does not block the round.
      const family = neutral ? null : unused[Math.floor(rng() * unused.length)];
      const color = family ? sampleFamily(family, rng) : neutralColor(rng);
      if (!darkAllowed && color.b < DARK_BELOW) continue;
      // A beige can read as neutral too, so the one-per-game limit counts by saturation.
      if (neutralUsed && color.s < 15) continue;
      const lab = hsbToLab(color);
      const margin = marginOf(lab, bestMargin, [
        [earlier, MIN_DELTA_E],
        [newest, RECENT_DELTA_E],
        [older, OLDER_DELTA_E],
      ]);
      if (margin > bestMargin)
        [best, bestMargin] = [{ family: family?.name ?? null, color }, margin];
    }
    // Every try was dark while a dark color is not allowed: lift one out of the dark.
    const fallbackFamily = neutral ? null : unused[0];
    const chosen: DrawnRound = best ?? {
      family: fallbackFamily?.name ?? null,
      color: {
        ...(fallbackFamily ? sampleFamily(fallbackFamily, rng) : neutralColor(rng)),
        b: DARK_BELOW,
      },
    };
    if (chosen.color.s < 15) neutralUsed = true;
    if (chosen.family) {
      lastFamily = FAMILIES.find((f) => f.name === chosen.family) ?? null;
      unused = unused.filter((f) => f !== lastFamily);
    }
    drawn.push(chosen);
    earlier.push(hsbToLab(chosen.color));
  }
  return drawn;
}

export function drawColors(count: number, rng: () => number, recent: Hsb[] = []): Hsb[] {
  return drawRounds(count, rng, recent).map((r) => r.color);
}
