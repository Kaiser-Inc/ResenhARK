import { z } from "zod";

export const hitlineConfigSchema = z.object({
  targetCards: z.number().int().min(2).max(30),
  contestSeconds: z.number().int().min(5).max(60),
  guessSeconds: z.number().int().min(30).max(300),
  maxPlayers: z.number().int().min(1).max(15),
});
export type HitlineConfig = z.infer<typeof hitlineConfigSchema>;
export const DEFAULT_HITLINE_CONFIG: HitlineConfig = {
  targetCards: 10,
  contestSeconds: 15,
  guessSeconds: 120,
  maxPlayers: 15,
};

export type PublicCard = {
  id: string;
  title: string;
  artists: string[];
  year: number;
  spotifyUrl: string | null;
};
export type RevealView = {
  card: PublicCard;
  turnPlayerId: string;
  reason: "resolved" | "timeout";
  guess: {
    slot: number;
    title: string;
    artist: string;
    correct: boolean;
    titleOk: boolean;
    artistOk: boolean;
  } | null;
  contests: { playerId: string; slot: number; correct: boolean }[];
  receiverId: string | null;
  tokenAwarded: boolean;
};
export type HitlineView = {
  phase: "turn-start" | "guessing" | "contest" | "game-over";
  config: HitlineConfig;
  turnPlayerId: string | null;
  deckCount: number;
  players: { id: string; tokens: number; online: boolean; timeline: PublicCard[] }[];
  draw: { id: string; audioUrl: string | null } | null; // audioUrl is filled by the hub
  guess: { slot: number; title?: string; artist?: string } | null; // title/artist only for the turn player
  contests: { playerId: string; slot: number }[];
  passed: string[];
  bought: boolean;
  turnDeadline: number;
  contestDeadline: number | null;
  lastReveal: RevealView | null;
  discards: PublicCard[];
  winners: string[];
  endReason: "target" | "deck-empty" | "ended" | null;
};
export type HitlineEvent =
  | { type: "game-started" }
  | { type: "card-drawn"; drawId: string }
  | { type: "card-skipped"; card: PublicCard }
  | { type: "card-bought"; playerId: string; card: PublicCard }
  | { type: "guess-locked"; slot: number }
  | { type: "contest-opened"; deadline: number }
  | { type: "contested"; playerId: string; slot: number }
  | { type: "passed"; playerId: string }
  | { type: "card-revealed"; reveal: RevealView }
  | { type: "turn-passed"; playerId: string; reason: "timeout" | "offline" | "removed" }
  | { type: "audio-missing" }
  | { type: "game-over"; winners: string[]; reason: "target" | "deck-empty" | "ended" };
export type HitlineIntent =
  | { type: "draw" }
  | { type: "skip" }
  | { type: "buy" }
  | { type: "lock-guess"; slot: number; title: string; artist: string }
  | { type: "contest"; slot: number }
  | { type: "pass" };
export const hitlineIntentSchema: z.ZodType<HitlineIntent> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("draw") }),
  z.object({ type: z.literal("skip") }),
  z.object({ type: z.literal("buy") }),
  z.object({
    type: z.literal("lock-guess"),
    slot: z.number().int().min(0),
    title: z.string().max(100),
    artist: z.string().max(100),
  }),
  z.object({ type: z.literal("contest"), slot: z.number().int().min(0) }),
  z.object({ type: z.literal("pass") }),
]);
