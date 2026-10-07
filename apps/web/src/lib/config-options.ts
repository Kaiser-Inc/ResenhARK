export const HUEHINT_OPTIONS = {
  turnsPerPlayer: [1, 2, 3, 4, 5],
  hintSeconds: [15, 20, 30, 45, 60, 90],
  guessSeconds: [20, 30, 45, 60, 90, 120],
  maxPlayers: Array.from({ length: 14 }, (_, i) => i + 2),
};

export const HITLINE_TARGET_CARDS = [5, 7, 10, 12, 15];
