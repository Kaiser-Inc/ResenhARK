import {
  type ErrorCode,
  type GameEvent,
  type GameView,
  type HitlineEvent,
  type HitlineIntent,
  type HitlineView,
  hitlineIntentSchema,
} from "@resenhark/shared";
import type { ZodType } from "zod";
import * as hitline from "./hitline/engine.js";
import { project as projectHitline } from "./hitline/project.js";

export type Ctx = { now: number; rng: () => number; newId: () => string };

/** Room-driven actions every game accepts with the same shape. */
export type SystemAction =
  | { type: "set-online"; online: boolean }
  | { type: "remove"; playerId: string }
  | { type: "end" };

/**
 * The minimal minigame contract: what the room, hub and gateway call on any game.
 * Starting a game stays game-specific (preconditions differ), and scoring is internal.
 */
export type GameModule<S, I, E, V> = {
  apply(
    state: S,
    actorId: string,
    action: I | SystemAction,
    ctx: Ctx,
  ): { ok: true; state: S; events: E[] } | { ok: false; error: ErrorCode };
  tick(state: S, ctx: Ctx): { state: S; events: E[] };
  nextDeadline(state: S): number | null;
  project(state: S, viewerId: string): V;
  intentSchema: ZodType<I>;
};

const hitlineModule: GameModule<hitline.HitlineState, HitlineIntent, HitlineEvent, HitlineView> = {
  apply: hitline.apply,
  tick: hitline.tick,
  nextDeadline: hitline.nextDeadline,
  project: projectHitline,
  intentSchema: hitlineIntentSchema,
};

export const GAMES = { hitline: hitlineModule };

export type ActiveGame = { type: "hitline"; state: hitline.HitlineState; playerIds: string[] };

// ponytail: one cast ties `type` to its module; TS cannot correlate the union by itself.
const moduleOf = (game: ActiveGame) =>
  GAMES[game.type] as unknown as GameModule<unknown, unknown, GameEvent, unknown>;

export const isRunning = (game: ActiveGame | null): game is ActiveGame =>
  !!game && game.state.phase !== "game-over";

export const isGamePlayer = (game: ActiveGame, id: string): boolean =>
  game.state.players.some((p) => p.id === id);

export function applyGame(
  game: ActiveGame,
  actorId: string,
  action: unknown,
  ctx: Ctx,
): { ok: true; game: ActiveGame; events: GameEvent[] } | { ok: false; error: ErrorCode } {
  const result = moduleOf(game).apply(game.state, actorId, action, ctx);
  if (!result.ok) return result;
  return { ok: true, game: { ...game, state: result.state } as ActiveGame, events: result.events };
}

export function tickGame(game: ActiveGame, ctx: Ctx): { game: ActiveGame; events: GameEvent[] } {
  const result = moduleOf(game).tick(game.state, ctx);
  return { game: { ...game, state: result.state } as ActiveGame, events: result.events };
}

export const gameDeadline = (game: ActiveGame): number | null =>
  moduleOf(game).nextDeadline(game.state);

export const projectGame = (game: ActiveGame, viewerId: string): GameView =>
  ({ type: game.type, view: moduleOf(game).project(game.state, viewerId) }) as GameView;

export function parseIntent(
  game: ActiveGame,
  payload: unknown,
): { ok: true; action: unknown } | { ok: false } {
  const parsed = moduleOf(game).intentSchema.safeParse(payload);
  return parsed.success ? { ok: true, action: parsed.data } : { ok: false };
}
