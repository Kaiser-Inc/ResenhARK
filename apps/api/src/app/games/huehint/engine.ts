import {
  HUEHINT_RANKS,
  HUEHINT_WIN_RANK,
  type Hsb,
  type HuehintConfig,
  type HuehintEndReason,
  type HuehintEvent,
  type HuehintIntent,
  type HuehintPhase,
  type HuehintRank,
  isValidHint,
} from "@resenhark/shared";
import { shuffle } from "../../core/shuffle.js";
import { type Ctx, SYSTEM_ACTOR, type SystemAction } from "../system.js";
import { scoreGuess } from "./color.js";
import { drawColors } from "./palette.js";
import { toRoundView } from "./project.js";

export const REVEAL_MS = 12_000;
export const MEMORIZE_MS = 5_000;
export const SOLO_ROUNDS = 5;

export type Player = { id: string; online: boolean };
/** Null giver in solo. */
export type ScheduledRound = { giverId: string | null; color: Hsb };
export type Guess = { playerId: string; color: Hsb };
/** Scores in hundredths (0..1000). */
export type RoundResult = {
  round: number;
  giverId: string | null;
  color: Hsb;
  hint: string | null;
  outcome: "revealed" | "no-hint";
  guesses: (Guess & { score: number })[];
  giverScore: number | null;
};
export type HuehintState = {
  mode: "group" | "solo";
  /** Set at create when exactly 2 play: the duo shares one team score and nobody wins alone. Absent in old saves. */
  cooperative: boolean;
  config: HuehintConfig;
  /** In the shuffled giver order. */
  players: Player[];
  /** Every round of the game, drawn at create; future colors live only here. */
  schedule: ScheduledRound[];
  /** Index into schedule. */
  round: number;
  phase: HuehintPhase;
  hint: string | null;
  guesses: Guess[];
  deadline: number;
  results: RoundResult[];
  winners: string[];
  endReason: HuehintEndReason | null;
};
export type HuehintAction = HuehintIntent | SystemAction;
export type RuleError =
  | "not-a-player"
  | "wrong-phase"
  | "not-your-turn"
  | "invalid-hint"
  | "already-guessed";
export type EngineResult =
  | { ok: true; state: HuehintState; events: HuehintEvent[] }
  | { ok: false; error: RuleError };

export function create(
  config: HuehintConfig,
  playerIds: string[],
  ctx: Ctx,
  /** Colors the room drew in earlier games, oldest first. */
  recentColors: Hsb[] = [],
): { state: HuehintState; events: HuehintEvent[] } {
  const mode = playerIds.length === 1 ? "solo" : "group";
  const order = shuffle(playerIds, ctx.rng);
  const givers: (string | null)[] =
    mode === "solo"
      ? Array(SOLO_ROUNDS).fill(null)
      : Array.from({ length: config.turnsPerPlayer }, () => order).flat();
  const colors = drawColors(givers.length, ctx.rng, recentColors);
  const s: HuehintState = {
    mode,
    cooperative: playerIds.length === 2,
    config: structuredClone(config),
    players: order.map((id) => ({ id, online: true })),
    schedule: givers.map((giverId, i) => ({ giverId, color: colors[i] })),
    round: 0,
    phase: "hint",
    hint: null,
    guesses: [],
    deadline: 0,
    results: [],
    winners: [],
    endReason: null,
  };
  const events: HuehintEvent[] = [{ type: "game-started" }];
  startRound(s, ctx, events);
  return { state: s, events };
}

const giverOf = (s: HuehintState) => s.schedule[s.round]?.giverId ?? null;

function phaseMs(s: HuehintState, phase: HuehintPhase): number {
  if (phase === "hint") return s.config.hintSeconds * 1000;
  if (phase === "memorize") return MEMORIZE_MS;
  if (phase === "guessing") return s.config.guessSeconds * 1000;
  return REVEAL_MS;
}

function enter(s: HuehintState, phase: HuehintPhase, ctx: Ctx): void {
  s.phase = phase;
  s.deadline = ctx.now + phaseMs(s, phase);
}

// Events go to every socket in the room: never put the target color in one before the reveal.
function startRound(s: HuehintState, ctx: Ctx, events: HuehintEvent[]): void {
  s.hint = null;
  s.guesses = [];
  enter(s, s.mode === "solo" ? "memorize" : "hint", ctx);
  events.push({ type: "round-started", round: s.round + 1, giverId: giverOf(s) });
}

/**
 * At least one guess, someone still online (nobody online means paused), and every guesser either
 * guessed or is offline.
 */
function allIn(s: HuehintState): boolean {
  const giver = giverOf(s);
  return (
    s.guesses.length > 0 &&
    s.players.some((p) => p.online) &&
    s.players.every(
      (p) => p.id === giver || !p.online || s.guesses.some((g) => g.playerId === p.id),
    )
  );
}

function reveal(
  s: HuehintState,
  outcome: RoundResult["outcome"],
  ctx: Ctx,
  events: HuehintEvent[],
): void {
  const { color, giverId } = s.schedule[s.round];
  const guesses = s.guesses.map((g) => ({ ...g, score: scoreGuess(color, g.color) }));
  const sum = guesses.reduce((total, g) => total + g.score, 0);
  const giverScore =
    outcome === "no-hint" || giverId === null
      ? null
      : guesses.length > 0
        ? Math.round(sum / guesses.length)
        : 0;
  const result: RoundResult = {
    round: s.round + 1,
    giverId,
    color,
    hint: s.hint,
    outcome,
    guesses,
    giverScore,
  };
  s.results.push(result);
  s.guesses = [];
  enter(s, "reveal", ctx);
  events.push({ type: "round-revealed", round: toRoundView(result) });
}

function advance(s: HuehintState, ctx: Ctx, events: HuehintEvent[]): void {
  s.round += 1;
  if (s.round >= s.schedule.length) finish(s, "rounds-done", events);
  else startRound(s, ctx, events);
}

/** Hundredths per current player; departed players keep their results in the gallery only. */
export function totals(s: HuehintState): Map<string, { guess: number; giver: number }> {
  const sums = new Map(s.players.map((p) => [p.id, { guess: 0, giver: 0 }]));
  for (const r of s.results) {
    for (const g of r.guesses) {
      const t = sums.get(g.playerId);
      if (t) t.guess += g.score;
    }
    const giver = r.giverId === null ? undefined : sums.get(r.giverId);
    if (giver && r.giverScore !== null) giver.giver += r.giverScore;
  }
  return sums;
}

/** Cooperative duo: one grade per revealed round, in hundredths. No hint or no guess grades 0. */
export function teamScore(s: HuehintState): { score: number; max: number } {
  return {
    score: s.results.reduce((total, r) => total + (r.giverScore ?? 0), 0),
    max: s.results.length * 1000,
  };
}

/** The best rank whose cutoff the score/max ratio reaches; nothing revealed yet is E. */
export function rankOf(score: number, max: number): HuehintRank {
  const ratio = max === 0 ? 0 : score / max;
  return (HUEHINT_RANKS.find((r) => ratio >= r.min) ?? HUEHINT_RANKS[HUEHINT_RANKS.length - 1])
    .rank;
}

export function wonBy(rank: HuehintRank): boolean {
  const order = HUEHINT_RANKS.map((r) => r.rank);
  return order.indexOf(rank) <= order.indexOf(HUEHINT_WIN_RANK);
}

function finish(s: HuehintState, reason: HuehintEndReason, events: HuehintEvent[]): void {
  s.phase = "game-over";
  s.hint = null;
  s.guesses = [];
  s.endReason = reason;
  s.winners = [];
  if (s.cooperative) {
    // The duo wins or loses together, and only a finished game is graded.
    const { score, max } = teamScore(s);
    if (reason === "rounds-done" && wonBy(rankOf(score, max)))
      s.winners = s.players.map((p) => p.id);
  } else if (reason !== "ended" && s.players.length > 0) {
    const t = totals(s);
    const total = (id: string) => (t.get(id)?.guess ?? 0) + (t.get(id)?.giver ?? 0);
    // Highest total; equal totals share the win. A giver-points tiebreak would favor sabotage.
    const best = Math.max(...s.players.map((p) => total(p.id)));
    s.winners = s.players.filter((p) => total(p.id) === best).map((p) => p.id);
  }
  events.push({ type: "game-over", winners: [...s.winners], reason });
}

function removePlayer(s: HuehintState, id: string, ctx: Ctx, events: HuehintEvent[]): void {
  const wasHintingGiver = giverOf(s) === id && s.phase === "hint";
  s.players = s.players.filter((p) => p.id !== id);
  s.guesses = s.guesses.filter((g) => g.playerId !== id);
  s.schedule = s.schedule.filter((r, i) => i <= s.round || r.giverId !== id);
  if (s.players.length === 0) finish(s, "ended", events);
  else if (s.mode === "group" && s.players.length < 2) finish(s, "not-enough-players", events);
  else if (wasHintingGiver) {
    events.push({ type: "round-canceled", giverId: id });
    advance(s, ctx, events);
  } else if (s.phase === "guessing" && allIn(s)) reveal(s, "revealed", ctx, events);
}

export function apply(
  state: HuehintState,
  actorId: string,
  action: HuehintAction,
  ctx: Ctx,
): EngineResult {
  const s = structuredClone(state);
  const events: HuehintEvent[] = [];
  const system = actorId === SYSTEM_ACTOR;
  const fail = (error: RuleError): EngineResult => ({ ok: false, error });
  if (!system && !s.players.some((p) => p.id === actorId)) return fail("not-a-player");
  if (s.phase === "game-over") return fail("wrong-phase");

  switch (action.type) {
    case "end":
      finish(s, "ended", events);
      break;
    case "remove":
      if (!system) return fail("wrong-phase");
      if (!s.players.some((p) => p.id === action.playerId)) return fail("not-a-player");
      removePlayer(s, action.playerId, ctx, events);
      break;
    case "set-online": {
      if (system) return fail("wrong-phase");
      const me = s.players.find((p) => p.id === actorId) as Player;
      if (action.online) {
        // Nobody was online, so the game was paused: the phase restarts its full timer.
        if (!s.players.some((p) => p.online)) s.deadline = ctx.now + phaseMs(s, s.phase);
        me.online = true;
      } else if (me.online) {
        me.online = false;
        if (s.phase === "guessing" && allIn(s)) reveal(s, "revealed", ctx, events);
      }
      break;
    }
    case "give-hint":
      if (system || s.phase !== "hint") return fail("wrong-phase");
      if (giverOf(s) !== actorId) return fail("not-your-turn");
      if (!isValidHint(action.hint)) return fail("invalid-hint");
      s.hint = action.hint.trim();
      enter(s, "guessing", ctx);
      events.push({ type: "hint-given", hint: s.hint });
      break;
    case "guess":
      if (system || s.phase !== "guessing") return fail("wrong-phase");
      if (giverOf(s) === actorId) return fail("not-your-turn");
      if (s.guesses.some((g) => g.playerId === actorId)) return fail("already-guessed");
      s.guesses.push({ playerId: actorId, color: { ...action.color } });
      events.push({ type: "guess-submitted", playerId: actorId });
      if (allIn(s)) reveal(s, "revealed", ctx, events);
      break;
    case "next-round":
      // Solo only: in a group, the reveal is when everyone reads the scores together.
      if (system || s.mode !== "solo" || s.phase !== "reveal") return fail("wrong-phase");
      advance(s, ctx, events);
      break;
  }
  return { ok: true, state: s, events };
}

export function tick(
  state: HuehintState,
  ctx: Ctx,
): { state: HuehintState; events: HuehintEvent[] } {
  const s = structuredClone(state);
  const events: HuehintEvent[] = [];
  // Paused: with nobody online nothing ticks, so an abandoned room can expire.
  if (!s.players.some((p) => p.online)) return { state: s, events };
  // Each step sets a deadline after ctx.now, so this ends within a few steps.
  while (s.phase !== "game-over" && ctx.now >= s.deadline) {
    if (s.phase === "hint") reveal(s, "no-hint", ctx, events);
    else if (s.phase === "guessing") reveal(s, "revealed", ctx, events);
    else if (s.phase === "memorize") {
      enter(s, "guessing", ctx);
      events.push({ type: "memorize-ended" });
    } else advance(s, ctx, events);
  }
  return { state: s, events };
}

export function nextDeadline(s: HuehintState): number | null {
  return s.phase === "game-over" || !s.players.some((p) => p.online) ? null : s.deadline;
}
