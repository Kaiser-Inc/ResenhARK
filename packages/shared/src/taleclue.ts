import { z } from "zod";
import deck from "./taleclue-deck.json" with { type: "json" };

/** Fewer players than this cannot fill a table, so a game never starts or goes on below it. */
export const TALECLUE_MIN_PLAYERS = 3;

export const taleclueConfigSchema = z.object({
  targetPoints: z.number().int().min(10).max(50),
  clueSeconds: z.number().int().min(30).max(180),
  decoySeconds: z.number().int().min(20).max(120),
  voteSeconds: z.number().int().min(20).max(120),
  maxPlayers: z.number().int().min(TALECLUE_MIN_PLAYERS).max(8),
});
export type TaleclueConfig = z.infer<typeof taleclueConfigSchema>;
export const DEFAULT_TALECLUE_CONFIG: TaleclueConfig = {
  targetPoints: 30,
  clueSeconds: 90,
  decoySeconds: 60,
  voteSeconds: 60,
  maxPlayers: 8,
};

export const CLUE_MAX_LENGTH = 30;

/** Trimmed, 1..30 chars. Digits are allowed. */
export function isValidClue(clue: string): boolean {
  const t = clue.trim();
  return t.length >= 1 && t.length <= CLUE_MAX_LENGTH;
}

/** The images live in the web app (`public/taleclue/cards`); the API only ever sends the id. */
export type TaleclueCardDef = { id: string; image: string; alt: string };
// Built from the deck manifest (`taleclue-deck.json`, written by the deck build script).
export const TALECLUE_CARDS: TaleclueCardDef[] = deck.map(({ id, alt }) => ({
  id,
  image: `/taleclue/cards/${id}.webp`,
  alt,
}));

export type TalecluePhase = "clue" | "decoy" | "vote" | "reveal" | "game-over";
export type TaleclueEndReason = "points" | "deck-empty" | "ended" | "not-enough-players";
export type TaleclueVoidReason = "no-clue" | "narrator-left";
export type TaleclueOutcome = "some" | "all" | "none" | "no-votes";

/** Revealed in this order, always all five, even with empty `awards`. */
export type TaleclueStep =
  | { type: "card-flip"; cards: { cardId: string; ownerId: string; narrator: boolean }[] }
  | { type: "votes"; votes: { voterId: string; cardId: string }[] }
  | {
      type: "award-correct";
      outcome: TaleclueOutcome;
      awards: { playerId: string; points: number }[];
    }
  | { type: "award-decoy"; awards: { playerId: string; points: number }[] }
  /** Board positions, capped at targetPoints. */
  | { type: "board-move"; moves: { playerId: string; from: number; to: number }[] };

export type TaleclueRoundView = {
  /** 1-based. */
  round: number;
  narratorId: string;
  clue: string;
  steps: TaleclueStep[];
};

export type TaleclueView = {
  phase: TalecluePhase;
  config: TaleclueConfig;
  /** 1-based current round. */
  round: number;
  narratorId: string | null;
  nextNarratorId: string | null;
  clue: string | null;
  /** Cards each non-narrator plays in the decoy phase of this round: 1, or 2 with 3 players. */
  decoyCount: number;
  /** The viewer's own cards; empty for spectators. */
  hand: string[];
  /** Shuffled table ids, only in vote and reveal; never the owners. */
  table: string[];
  /** The viewer's cards on the table this round, the narrator's included. */
  myCards: string[];
  myVote: string | null;
  /** Ids of who already acted in this phase; never what they did. */
  acted: string[];
  players: { id: string; online: boolean; points: number; position: number }[];
  /** When the current phase ends; null when paused or over. */
  deadline: number | null;
  /** Revealed rounds, oldest first. */
  rounds: TaleclueRoundView[];
  winners: string[];
  endReason: TaleclueEndReason | null;
};

export type TaleclueEvent =
  | { type: "game-started" }
  | { type: "round-started"; round: number; narratorId: string }
  | { type: "clue-given"; clue: string }
  | { type: "decoy-played"; playerId: string; auto: boolean }
  | { type: "vote-cast"; playerId: string }
  | { type: "round-revealed"; round: TaleclueRoundView }
  | { type: "round-voided"; round: number; narratorId: string; reason: TaleclueVoidReason }
  | { type: "game-over"; winners: string[]; reason: TaleclueEndReason };

export type TaleclueIntent =
  | { type: "give-clue"; cardId: string; clue: string }
  | { type: "play-decoys"; cardIds: string[] }
  | { type: "vote"; cardId: string };
export const taleclueIntentSchema: z.ZodType<TaleclueIntent> = z.discriminatedUnion("type", [
  // No max on the clue: Socket.IO caps the payload, and a long clue must get invalid-hint.
  z.object({ type: z.literal("give-clue"), cardId: z.string(), clue: z.string() }),
  z.object({ type: z.literal("play-decoys"), cardIds: z.array(z.string()) }),
  z.object({ type: z.literal("vote"), cardId: z.string() }),
]);
