import type { Hsb } from "@resenhark/shared";
import { shuffle } from "../../core/shuffle.js";

export const HUE_SECTORS = 6;

export function saturationBand(s: number): "vivid" | "soft" | "neutral" {
  return s >= 40 ? "vivid" : s >= 15 ? "soft" : "neutral";
}

/**
 * One color per round. Saturation by band (70 vivid / 20 soft / 10 neutral, no neutral after the
 * first), brightness 15..95, hue from 6 sectors shuffled per block of 6 so consecutive rounds never
 * share a sector.
 */
export function drawColors(count: number, rng: () => number): Hsb[] {
  const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  const sectors: number[] = [];
  while (sectors.length < count) {
    const block = shuffle([...Array(HUE_SECTORS).keys()], rng);
    // The block's first sector must not repeat the previous block's last.
    if (block[0] === sectors[sectors.length - 1]) [block[0], block[1]] = [block[1], block[0]];
    sectors.push(...block);
  }
  let neutralUsed = false;
  return sectors.slice(0, count).map((sector) => {
    const roll = rng() * (neutralUsed ? 90 : 100);
    const s = roll < 70 ? int(40, 100) : roll < 90 ? int(15, 39) : int(0, 14);
    if (s < 15) neutralUsed = true;
    return { h: sector * 60 + int(0, 59), s, b: int(15, 95) };
  });
}
