import type { Hsb } from "@resenhark/shared";
import { shuffle } from "../../core/shuffle.js";
import { deltaE2000, hsbToLab } from "./color.js";

export const HUE_SECTORS = 6;
/** Below this brightness colors read as "dark" and look alike; at most one per 6 rounds. */
export const DARK_BELOW = 35;
/** A new color stays at least this far (CIEDE2000) from the colors of the last rounds. */
export const MIN_DELTA_E = 25;
/**
 * A new color stays at least this far from the newest colors the room drew in earlier games, and
 * OLDER_DELTA_E from the rest. A flat 20 against 60 colors cannot hold: the sRGB gamut fits about
 * 25 colors that far apart, and in simulation only 1% of draws cleared 60.
 */
export const RECENT_DELTA_E = 20;
export const OLDER_DELTA_E = 12;
export const NEWEST_COUNT = 8;
const RECENT = 5;
const TRIES = 200;

export function saturationBand(s: number): "vivid" | "soft" | "neutral" {
  return s >= 40 ? "vivid" : s >= 15 ? "soft" : "neutral";
}

/**
 * One color per round. Saturation by band (70 vivid / 20 soft / 10 neutral, no neutral after the
 * first), brightness 15..95 with at most one dark color in any 6 rounds, hue from 6 sectors
 * shuffled per block of 6 so consecutive rounds never share a sector. Each color is redrawn until
 * it is MIN_DELTA_E from the last 5 colors and RECENT_DELTA_E from the newest colors in `recent` (the
 * room's earlier games, oldest first) and OLDER_DELTA_E from the rest; when no try gets there, the one with the most room to spare is kept.
 */
export function drawColors(count: number, rng: () => number, recent: Hsb[] = []): Hsb[] {
  const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  const sectors: number[] = [];
  while (sectors.length < count) {
    const block = shuffle([...Array(HUE_SECTORS).keys()], rng);
    // The block's first sector must not repeat the previous block's last.
    if (block[0] === sectors[sectors.length - 1]) [block[0], block[1]] = [block[1], block[0]];
    sectors.push(...block);
  }
  const memory = recent.map(hsbToLab);
  const farthest = (lab: ReturnType<typeof hsbToLab>, others: typeof memory) =>
    Math.min(Number.POSITIVE_INFINITY, ...others.map((o) => deltaE2000(lab, o)));
  const newest = memory.slice(-NEWEST_COUNT);
  const older = memory.slice(0, -NEWEST_COUNT);
  let neutralUsed = false;
  const colors: Hsb[] = [];
  for (const sector of sectors.slice(0, count)) {
    const window = colors.slice(-RECENT).map(hsbToLab);
    const darkAllowed = !colors.slice(-RECENT).some((c) => c.b < DARK_BELOW);
    let best: Hsb | null = null;
    let bestMargin = Number.NEGATIVE_INFINITY;
    for (let attempt = 0; attempt < TRIES && bestMargin < 0; attempt++) {
      const roll = rng() * (neutralUsed ? 90 : 100);
      const s = roll < 70 ? int(40, 100) : roll < 90 ? int(15, 39) : int(0, 14);
      const color = { h: sector * 60 + int(0, 59), s, b: int(darkAllowed ? 15 : DARK_BELOW, 95) };
      const lab = hsbToLab(color);
      const margin = Math.min(
        farthest(lab, window) - MIN_DELTA_E,
        farthest(lab, newest) - RECENT_DELTA_E,
        farthest(lab, older) - OLDER_DELTA_E,
      );
      if (margin > bestMargin) [best, bestMargin] = [color, margin];
    }
    const chosen = best as Hsb;
    if (chosen.s < 15) neutralUsed = true;
    colors.push(chosen);
  }
  return colors;
}
