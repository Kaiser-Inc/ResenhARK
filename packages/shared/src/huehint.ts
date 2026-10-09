import { z } from "zod";

export const huehintConfigSchema = z.object({
  turnsPerPlayer: z.number().int().min(1).max(5),
  hintSeconds: z.number().int().min(15).max(90),
  guessSeconds: z.number().int().min(20).max(120),
  maxPlayers: z.number().int().min(2).max(15),
});
export type HuehintConfig = z.infer<typeof huehintConfigSchema>;
export const DEFAULT_HUEHINT_CONFIG: HuehintConfig = {
  turnsPerPlayer: 2,
  hintSeconds: 30,
  guessSeconds: 45,
  maxPlayers: 15,
};

/** Hue 0..359, saturation and brightness 0..100, integers. */
export const hsbSchema = z.object({
  h: z.number().int().min(0).max(359),
  s: z.number().int().min(0).max(100),
  b: z.number().int().min(0).max(100),
});
export type Hsb = z.infer<typeof hsbSchema>;

export const HINT_MAX_LENGTH = 30;
export const HINT_MAX_WORDS = 4;

/** Trimmed, 1..30 chars, at most 4 words, no digits (any script) and no `#`, so no hex or HSB codes. */
export function isValidHint(hint: string): boolean {
  const t = hint.trim();
  return (
    t.length >= 1 &&
    t.length <= HINT_MAX_LENGTH &&
    t.split(/\s+/).length <= HINT_MAX_WORDS &&
    !/[\p{Nd}#]/u.test(t)
  );
}

/** Cooperative duo rank by score / max, best first. A rank applies from its `min` ratio up. */
export const HUEHINT_RANKS = [
  { rank: "S", min: 0.95 },
  { rank: "A", min: 0.85 },
  { rank: "B", min: 0.75 },
  { rank: "C", min: 0.5 },
  { rank: "D", min: 0.25 },
  { rank: "E", min: 0 },
] as const;
export type HuehintRank = (typeof HUEHINT_RANKS)[number]["rank"];
/** The duo wins at this rank or better. */
export const HUEHINT_WIN_RANK: HuehintRank = "B";

export type HuehintPhase = "hint" | "memorize" | "guessing" | "reveal" | "game-over";
export type HuehintEndReason = "rounds-done" | "ended" | "not-enough-players";

export type HuehintRoundView = {
  /** 1-based. */
  round: number;
  /** Null in solo. */
  giverId: string | null;
  color: Hsb;
  hint: string | null;
  outcome: "revealed" | "no-hint";
  /** Score 0..10 with 2 decimals. */
  guesses: { playerId: string; color: Hsb; score: number }[];
  /** Mean of the guess scores; 0 without guesses, null for no-hint or solo. */
  giverScore: number | null;
};

export type HuehintView = {
  mode: "group" | "solo";
  /** True when the game started with exactly 2 players: the duo plays together and ranks as a team. */
  cooperative: boolean;
  /**
   * Cooperative only, else null. Points with 2 decimals; `max` counts the revealed rounds (the whole
   * game once it ends). Mid-game it is a provisional rank with `won` false; only a finished
   * "rounds-done" game carries the final result.
   */
  team: { score: number; max: number; rank: HuehintRank; won: boolean } | null;
  phase: HuehintPhase;
  config: HuehintConfig;
  /** 1-based current round. */
  round: number;
  totalRounds: number;
  giverId: string | null;
  nextGiverId: string | null;
  /** The target: only for the giver (hint, guessing) or the solo player (memorize). */
  color: Hsb | null;
  hint: string | null;
  /** Ids of who already guessed this round; never their colors. */
  submitted: string[];
  /** The viewer's own guess while guessing. */
  myGuess: Hsb | null;
  /** When the current phase ends; null when paused or over. */
  deadline: number | null;
  /** Points with 2 decimals. */
  players: {
    id: string;
    online: boolean;
    guessPoints: number;
    giverPoints: number;
    total: number;
  }[];
  /** Revealed rounds, oldest first. */
  rounds: HuehintRoundView[];
  winners: string[];
  endReason: HuehintEndReason | null;
};

export type HuehintEvent =
  | { type: "game-started" }
  | { type: "round-started"; round: number; giverId: string | null }
  | { type: "hint-given"; hint: string }
  /** Solo: the color hides and guessing opens. */
  | { type: "memorize-ended" }
  | { type: "guess-submitted"; playerId: string }
  | { type: "round-revealed"; round: HuehintRoundView }
  | { type: "round-canceled"; giverId: string }
  | { type: "game-over"; winners: string[]; reason: HuehintEndReason };

export type HuehintIntent =
  | { type: "give-hint"; hint: string }
  | { type: "guess"; color: Hsb }
  /** Solo only, during the reveal: go to the next color now. */
  | { type: "next-round" };
// The hint rules are checked by the engine, so a bad hint gets `invalid-hint`, not `invalid-input`.
export const huehintIntentSchema: z.ZodType<HuehintIntent> = z.discriminatedUnion("type", [
  // No max here: Socket.IO caps the payload, and a long hint must get invalid-hint.
  z.object({ type: z.literal("give-hint"), hint: z.string() }),
  z.object({ type: z.literal("guess"), color: hsbSchema }),
  z.object({ type: z.literal("next-round") }),
]);
