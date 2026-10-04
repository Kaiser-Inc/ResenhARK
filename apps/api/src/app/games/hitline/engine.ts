import type { HitlineConfig, HitlineEvent } from "@resenhark/shared";
import { toRevealView } from "./project.js";
import { correctSlot, insertAt, isCorrectSlot } from "./slots.js";

export type Card = {
  id: string;
  title: string;
  artists: string[];
  year: number;
  isrc: string | null;
  spotifyUrl: string | null;
};
export type Ctx = { now: number; rng: () => number; newId: () => string };
export type Player = {
  id: string;
  timeline: Card[];
  tokens: number;
  online: boolean;
  offlineSince: number | null;
};
export type Guess = { slot: number; title: string; artist: string };
export type Contest = { playerId: string; slot: number };
export type Reveal = {
  card: Card;
  turnPlayerId: string;
  reason: "resolved" | "timeout";
  guess: (Guess & { correct: boolean; titleOk: boolean; artistOk: boolean }) | null;
  contests: (Contest & { correct: boolean })[];
  receiverId: string | null;
  tokenAwarded: boolean;
};
export type Phase = "turn-start" | "guessing" | "contest" | "game-over";
export type HitlineState = {
  config: HitlineConfig;
  players: Player[];
  turn: number;
  phase: Phase;
  deck: Card[];
  discards: Card[];
  draw: { id: string; card: Card } | null;
  guess: Guess | null;
  contests: Contest[];
  passed: string[];
  bought: boolean;
  turnDeadline: number;
  contestDeadline: number | null;
  lastReveal: Reveal | null;
  winners: string[];
  endReason: "target" | "deck-empty" | "ended" | null;
};
export type HitlineAction =
  | { type: "draw" }
  | { type: "skip" }
  | { type: "buy" }
  | { type: "lock-guess"; slot: number; title: string; artist: string }
  | { type: "contest"; slot: number }
  | { type: "pass" }
  | { type: "audio-missing" }
  | { type: "set-online"; online: boolean }
  | { type: "remove" }
  | { type: "end" };
export type RuleError =
  | "not-your-turn"
  | "wrong-phase"
  | "insufficient-tokens"
  | "already-bought"
  | "slot-taken"
  | "invalid-slot"
  | "already-decided"
  | "not-a-player";
export type EngineResult =
  | { ok: true; state: HitlineState; events: HitlineEvent[] }
  | { ok: false; error: RuleError };

export const START_TOKENS = 2;
export const SKIP_COST = 1;
export const CONTEST_COST = 1;
export const BUY_COST = 3;
export const OFFLINE_GRACE_MS = 30_000;

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function create(
  config: HitlineConfig,
  playerIds: string[],
  deck: Card[],
  ctx: Ctx,
): { state: HitlineState; events: HitlineEvent[] } {
  const pile = shuffle(deck, ctx.rng);
  const order = shuffle(playerIds, ctx.rng);
  const players: Player[] = order.map((id) => ({
    id,
    timeline: [pile.shift() as Card],
    tokens: START_TOKENS,
    online: true,
    offlineSince: null,
  }));
  const state: HitlineState = {
    config: structuredClone(config),
    players,
    turn: 0,
    phase: "turn-start",
    deck: pile,
    discards: [],
    draw: null,
    guess: null,
    contests: [],
    passed: [],
    bought: false,
    turnDeadline: ctx.now + config.guessSeconds * 1000,
    contestDeadline: null,
    lastReveal: null,
    winners: [],
    endReason: null,
  };
  return { state, events: [{ type: "game-started" }] };
}

function gameOver(
  s: HitlineState,
  winners: string[],
  reason: "target" | "deck-empty" | "ended",
): HitlineEvent {
  s.phase = "game-over";
  s.winners = winners;
  s.endReason = reason;
  s.draw = null;
  s.guess = null;
  s.contestDeadline = null;
  return { type: "game-over", winners, reason };
}

/** Longest timeline wins, tokens break the tie, a remaining tie is shared. */
function deckEmptyWinners(players: Player[]): string[] {
  const best = (xs: Player[], key: (p: Player) => number) => {
    const m = Math.max(...xs.map(key));
    return xs.filter((p) => key(p) === m);
  };
  const byLen = best(players, (p) => p.timeline.length);
  return best(byLen, (p) => p.tokens).map((p) => p.id);
}

function nextTurn(s: HitlineState, ctx: Ctx): void {
  const n = s.players.length;
  const anyOnline = s.players.some((p) => p.online);
  let t = s.turn;
  do t = (t + 1) % n;
  while (anyOnline && !s.players[t].online);
  s.turn = t;
  s.draw = null;
  s.guess = null;
  s.contests = [];
  s.passed = [];
  s.bought = false;
  s.phase = "turn-start";
  s.contestDeadline = null;
  s.turnDeadline = ctx.now + s.config.guessSeconds * 1000;
}

function resolve(s: HitlineState, ctx: Ctx, events: HitlineEvent[]): void {
  const player = s.players[s.turn];
  const draw = s.draw as { id: string; card: Card };
  const guess = s.guess as Guess;
  s.deck.shift();
  const correct = isCorrectSlot(player.timeline, guess.slot, draw.card.year);
  if (correct)
    player.timeline = insertAt(
      player.timeline,
      correctSlot(player.timeline, draw.card.year),
      draw.card,
    );
  else s.discards.push(draw.card);
  s.lastReveal = {
    card: draw.card,
    turnPlayerId: player.id,
    reason: "resolved",
    // ponytail: title/artist matching and token award arrive with the normalizer (Task 15).
    guess: { ...guess, correct, titleOk: false, artistOk: false },
    contests: [],
    receiverId: correct ? player.id : null,
    tokenAwarded: false,
  };
  events.push({ type: "card-revealed", reveal: toRevealView(s.lastReveal) });
  if (player.timeline.length >= s.config.targetCards) {
    events.push(gameOver(s, [player.id], "target"));
    return;
  }
  nextTurn(s, ctx);
}

export function apply(
  state: HitlineState,
  actorId: string,
  action: HitlineAction,
  ctx: Ctx,
): EngineResult {
  const s = structuredClone(state);
  const events: HitlineEvent[] = [];
  if (!s.players.some((p) => p.id === actorId)) return { ok: false, error: "not-a-player" };
  if (s.phase === "game-over") return { ok: false, error: "wrong-phase" };

  if (action.type === "end") {
    events.push(gameOver(s, [], "ended"));
    return { ok: true, state: s, events };
  }
  if (action.type !== "draw" && action.type !== "lock-guess")
    return { ok: false, error: "wrong-phase" };
  if (s.players[s.turn].id !== actorId) return { ok: false, error: "not-your-turn" };

  if (action.type === "draw") {
    if (s.phase !== "turn-start") return { ok: false, error: "wrong-phase" };
    if (s.deck.length === 0) {
      events.push(gameOver(s, deckEmptyWinners(s.players), "deck-empty"));
      return { ok: true, state: s, events };
    }
    const drawId = ctx.newId();
    s.draw = { id: drawId, card: s.deck[0] };
    s.lastReveal = null;
    s.phase = "guessing";
    events.push({ type: "card-drawn", drawId });
    return { ok: true, state: s, events };
  }

  if (s.phase !== "guessing") return { ok: false, error: "wrong-phase" };
  const { slot } = action;
  if (!Number.isInteger(slot) || slot < 0 || slot > s.players[s.turn].timeline.length) {
    return { ok: false, error: "invalid-slot" };
  }
  s.guess = { slot, title: action.title, artist: action.artist };
  events.push({ type: "guess-locked", slot });
  // Always resolves immediately here; Task 15 opens the contest window when someone can contest.
  resolve(s, ctx, events);
  return { ok: true, state: s, events };
}

// ponytail: timeouts, offline grace and removal land in Task 17.
export function tick(
  state: HitlineState,
  _ctx: Ctx,
): { state: HitlineState; events: HitlineEvent[] } {
  return { state: structuredClone(state), events: [] };
}

export function nextDeadline(state: HitlineState): number | null {
  if (state.phase === "game-over") return null;
  return state.phase === "contest" ? state.contestDeadline : state.turnDeadline;
}
