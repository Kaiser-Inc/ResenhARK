export const HUEHINT_OPTIONS = {
  turnsPerPlayer: [1, 2, 3, 4, 5],
  hintSeconds: [15, 20, 30, 45, 60, 90],
  guessSeconds: [20, 30, 45, 60, 90, 120],
  maxPlayers: Array.from({ length: 14 }, (_, i) => i + 2),
};

export const HITLINE_TARGET_CARDS = [5, 7, 10, 12, 15];

/** Preset steps inside the contract ranges; each list holds the min, the max and the default. */
export const TALECLUE_OPTIONS = {
  targetPoints: [10, 15, 20, 25, 30, 40, 50],
  clueSeconds: [30, 45, 60, 90, 120, 180],
  decoySeconds: [20, 30, 45, 60, 90, 120],
  voteSeconds: [20, 30, 45, 60, 90, 120],
  maxPlayers: [3, 4, 5, 6, 7, 8],
};

/** Adds a saved value that is not a preset (older rooms), in order, so the select never shows blank. */
export function withCurrent(options: number[], current: number): number[] {
  if (options.includes(current)) return options;
  return [...options, current].sort((a, b) => a - b);
}
