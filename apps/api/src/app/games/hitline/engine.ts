import type { HitlineConfig, HitlineEvent } from "@resenhark/shared";
import { matchesArtist, matchesTitle } from "./normalize.js";
import { toPublicCard, toRevealView } from "./project.js";
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
  | { type: "audio-missing"; giveUp?: boolean }
  | { type: "set-online"; online: boolean }
  | { type: "remove"; playerId: string }
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

/** Actor for hub-driven actions (missing audio, owner ending the game). */
export const SYSTEM_ACTOR = "system";
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
  // A drawn card was already heard, so it leaves the deck and counts as played.
  if (s.draw) s.deck.shift();
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

function nextDraw(s: HitlineState, ctx: Ctx, events: HitlineEvent[]): void {
  if (s.deck.length === 0) {
    events.push(gameOver(s, deckEmptyWinners(s.players), "deck-empty"));
    return;
  }
  const drawId = ctx.newId();
  s.draw = { id: drawId, card: s.deck[0] };
  events.push({ type: "card-drawn", drawId });
}

function resolve(s: HitlineState, ctx: Ctx, events: HitlineEvent[]): void {
  const player = s.players[s.turn];
  const draw = s.draw as { id: string; card: Card };
  const guess = s.guess as Guess;
  const year = draw.card.year;
  s.deck.shift();
  s.draw = null; // consumed: gameOver must not shift it again
  const correct = isCorrectSlot(player.timeline, guess.slot, year);
  const titleOk = matchesTitle(guess.title, draw.card.title);
  const artistOk = matchesArtist(guess.artist, draw.card.artists);
  const tokenAwarded = (correct && (titleOk || artistOk)) || (!correct && titleOk && artistOk);
  if (tokenAwarded) player.tokens += 1;
  const contests = s.contests.map((c) => ({
    ...c,
    correct: isCorrectSlot(player.timeline, c.slot, year),
  }));
  const receiver = correct
    ? player
    : s.players.find((p) => p.id === contests.find((c) => c.correct)?.playerId);
  if (receiver)
    receiver.timeline = insertAt(
      receiver.timeline,
      correctSlot(receiver.timeline, year),
      draw.card,
    );
  else s.discards.push(draw.card);
  s.lastReveal = {
    card: draw.card,
    turnPlayerId: player.id,
    reason: "resolved",
    guess: { ...guess, correct, titleOk, artistOk },
    contests,
    receiverId: receiver?.id ?? null,
    tokenAwarded,
  };
  events.push({ type: "card-revealed", reveal: toRevealView(s.lastReveal) });
  if (receiver && receiver.timeline.length >= s.config.targetCards) {
    events.push(gameOver(s, [receiver.id], "target"));
    return;
  }
  nextTurn(s, ctx);
}

const canContest = (s: HitlineState, p: Player) =>
  p.id !== s.players[s.turn].id && p.online && p.tokens >= CONTEST_COST;

/** Everyone else contested, passed, is offline or has no token to spend. */
function allDecided(s: HitlineState): boolean {
  return s.players.every(
    (p) =>
      p.id === s.players[s.turn].id ||
      !canContest(s, p) ||
      s.passed.includes(p.id) ||
      s.contests.some((c) => c.playerId === p.id),
  );
}

export function apply(
  state: HitlineState,
  actorId: string,
  action: HitlineAction,
  ctx: Ctx,
): EngineResult {
  const s = structuredClone(state);
  const events: HitlineEvent[] = [];
  const system = actorId === SYSTEM_ACTOR;
  if (!system && !s.players.some((p) => p.id === actorId))
    return { ok: false, error: "not-a-player" };
  if (s.phase === "game-over") return { ok: false, error: "wrong-phase" };

  if (action.type === "audio-missing") {
    if (!system || s.phase !== "guessing" || !s.draw) return { ok: false, error: "wrong-phase" };
    // The card was never played or shown: drop it without a reveal or a discard.
    s.deck.shift();
    s.draw = null;
    events.push({ type: "audio-missing" });
    if (action.giveUp) {
      events.push(gameOver(s, deckEmptyWinners(s.players), "deck-empty"));
      return { ok: true, state: s, events };
    }
    nextDraw(s, ctx, events);
    return { ok: true, state: s, events };
  }
  if (action.type === "end") {
    events.push(gameOver(s, [], "ended"));
    return { ok: true, state: s, events };
  }
  if (action.type === "remove") {
    if (!system) return { ok: false, error: "wrong-phase" };
    if (!s.players.some((p) => p.id === action.playerId))
      return { ok: false, error: "not-a-player" };
    removePlayer(s, action.playerId, ctx, events);
    return { ok: true, state: s, events };
  }
  if (action.type === "set-online") {
    if (system) return { ok: false, error: "wrong-phase" };
    const me = s.players.find((p) => p.id === actorId) as Player;
    if (action.online) {
      // Nobody was online, so the room was paused: the returning player gets a fresh turn timer.
      if (!s.players.some((p) => p.online)) s.turnDeadline = ctx.now + s.config.guessSeconds * 1000;
      me.online = true;
      me.offlineSince = null;
    } else if (me.online) {
      me.online = false;
      me.offlineSince = ctx.now;
      if (s.phase === "contest" && allDecided(s)) resolve(s, ctx, events);
    }
    return { ok: true, state: s, events };
  }
  if (system) return { ok: false, error: "wrong-phase" };

  if (action.type === "contest" || action.type === "pass") {
    if (s.phase !== "contest") return { ok: false, error: "wrong-phase" };
    if (s.players[s.turn].id === actorId) return { ok: false, error: "not-your-turn" };
    if (s.passed.includes(actorId) || s.contests.some((c) => c.playerId === actorId))
      return { ok: false, error: "already-decided" };
    if (action.type === "pass") {
      s.passed.push(actorId);
      events.push({ type: "passed", playerId: actorId });
    } else {
      const me = s.players.find((p) => p.id === actorId) as Player;
      if (me.tokens < CONTEST_COST) return { ok: false, error: "insufficient-tokens" };
      const { slot } = action;
      if (!Number.isInteger(slot) || slot < 0 || slot > s.players[s.turn].timeline.length)
        return { ok: false, error: "invalid-slot" };
      if (slot === s.guess?.slot || s.contests.some((c) => c.slot === slot))
        return { ok: false, error: "slot-taken" };
      me.tokens -= CONTEST_COST;
      s.contests.push({ playerId: actorId, slot });
      events.push({ type: "contested", playerId: actorId, slot });
    }
    if (allDecided(s)) resolve(s, ctx, events);
    return { ok: true, state: s, events };
  }

  if (s.players[s.turn].id !== actorId) return { ok: false, error: "not-your-turn" };
  const player = s.players[s.turn];

  if (action.type === "draw") {
    if (s.phase !== "turn-start") return { ok: false, error: "wrong-phase" };
    if (s.deck.length === 0) {
      events.push(gameOver(s, deckEmptyWinners(s.players), "deck-empty"));
      return { ok: true, state: s, events };
    }
    s.lastReveal = null;
    s.phase = "guessing";
    nextDraw(s, ctx, events);
    return { ok: true, state: s, events };
  }

  if (action.type === "skip") {
    if (s.phase !== "guessing" || !s.draw) return { ok: false, error: "wrong-phase" };
    if (player.tokens < SKIP_COST) return { ok: false, error: "insufficient-tokens" };
    player.tokens -= SKIP_COST;
    const skipped = s.deck.shift() as Card;
    s.discards.push(skipped);
    s.draw = null;
    events.push({ type: "card-skipped", card: toPublicCard(skipped) });
    nextDraw(s, ctx, events);
    return { ok: true, state: s, events };
  }

  if (action.type === "buy") {
    if (s.phase !== "turn-start" && s.phase !== "guessing")
      return { ok: false, error: "wrong-phase" };
    if (s.bought) return { ok: false, error: "already-bought" };
    if (player.tokens < BUY_COST) return { ok: false, error: "insufficient-tokens" };
    // While guessing, deck[0] is the hidden draw: buy the card after it.
    const at = s.phase === "guessing" ? 1 : 0;
    if (s.deck.length <= at) {
      events.push(gameOver(s, deckEmptyWinners(s.players), "deck-empty"));
      return { ok: true, state: s, events };
    }
    player.tokens -= BUY_COST;
    const bought = s.deck.splice(at, 1)[0];
    player.timeline = insertAt(player.timeline, correctSlot(player.timeline, bought.year), bought);
    s.bought = true;
    events.push({ type: "card-bought", playerId: player.id, card: toPublicCard(bought) });
    if (player.timeline.length >= s.config.targetCards) {
      events.push(gameOver(s, [player.id], "target"));
      return { ok: true, state: s, events };
    }
    return { ok: true, state: s, events };
  }

  if (action.type !== "lock-guess") return { ok: false, error: "wrong-phase" };
  if (s.phase !== "guessing") return { ok: false, error: "wrong-phase" };
  const { slot } = action;
  if (!Number.isInteger(slot) || slot < 0 || slot > player.timeline.length) {
    return { ok: false, error: "invalid-slot" };
  }
  s.guess = { slot, title: action.title, artist: action.artist };
  events.push({ type: "guess-locked", slot });
  if (s.players.some((p) => canContest(s, p))) {
    s.phase = "contest";
    s.contestDeadline = ctx.now + s.config.contestSeconds * 1000;
    events.push({ type: "contest-opened", deadline: s.contestDeadline });
  } else resolve(s, ctx, events);
  return { ok: true, state: s, events };
}

/** The hidden drawn card leaves play unrevealed: back to the bottom, no card data in any event. */
function returnDrawToBottom(s: HitlineState): void {
  if (!s.draw) return;
  s.deck.push(s.deck.shift() as Card);
  s.draw = null; // back in the deck unheard: gameOver must not shift it out
}

function removePlayer(s: HitlineState, id: string, ctx: Ctx, events: HitlineEvent[]): void {
  const idx = s.players.findIndex((p) => p.id === id);
  const wasTurn = idx === s.turn;
  if (wasTurn) returnDrawToBottom(s);
  s.players.splice(idx, 1);
  s.contests = s.contests.filter((c) => c.playerId !== id);
  s.passed = s.passed.filter((p) => p !== id);
  if (s.players.length === 0) {
    events.push(gameOver(s, [], "ended"));
    return;
  }
  if (wasTurn) {
    events.push({ type: "turn-passed", playerId: id, reason: "removed" });
    s.turn = idx - 1; // nextTurn steps forward onto the player who slid into this seat
    if (s.turn < 0) s.turn = s.players.length - 1;
    nextTurn(s, ctx);
    return;
  }
  if (idx < s.turn) s.turn -= 1;
  if (s.phase === "contest" && allDecided(s)) resolve(s, ctx, events);
}

/** The turn player has been offline long enough to lose the turn (never when nobody is online). */
function offlineExpired(s: HitlineState, now: number): boolean {
  return (
    (s.phase === "turn-start" || s.phase === "guessing") &&
    (offlineExpiry(s) ?? Number.POSITIVE_INFINITY) <= now
  );
}

export function tick(
  state: HitlineState,
  ctx: Ctx,
): { state: HitlineState; events: HitlineEvent[] } {
  const s = structuredClone(state);
  const events: HitlineEvent[] = [];
  // Paused: with nobody online nothing ticks, so an abandoned room can expire (Ruling R26).
  if (!s.players.some((p) => p.online)) return { state: s, events };
  for (let i = 0; i < 50 && s.phase !== "game-over"; i++) {
    const pid = s.players[s.turn].id;
    if (s.phase === "contest") {
      if (s.contestDeadline === null || ctx.now < s.contestDeadline) break;
      resolve(s, ctx, events);
    } else if (offlineExpired(s, ctx.now)) {
      returnDrawToBottom(s);
      events.push({ type: "turn-passed", playerId: pid, reason: "offline" });
      nextTurn(s, ctx);
    } else if (ctx.now < s.turnDeadline) break;
    else if (s.phase === "turn-start") {
      events.push({ type: "turn-passed", playerId: pid, reason: "timeout" });
      nextTurn(s, ctx);
    } else {
      const card = s.deck.shift() as Card;
      s.discards.push(card);
      s.lastReveal = {
        card,
        turnPlayerId: pid,
        reason: "timeout",
        guess: null,
        contests: [],
        receiverId: null,
        tokenAwarded: false,
      };
      events.push({ type: "card-revealed", reveal: toRevealView(s.lastReveal) });
      nextTurn(s, ctx);
    }
  }
  return { state: s, events };
}

export function nextDeadline(state: HitlineState): number | null {
  if (state.phase === "game-over" || !state.players.some((p) => p.online)) return null;
  if (state.phase === "contest") return state.contestDeadline;
  return Math.min(state.turnDeadline, offlineExpiry(state) ?? Number.POSITIVE_INFINITY);
}

/** When the offline turn player loses the turn; null if they are online or nobody else is. */
export function offlineExpiry(s: HitlineState): number | null {
  const p = s.players[s.turn];
  return !p.online && p.offlineSince !== null && s.players.some((q) => q.online)
    ? p.offlineSince + OFFLINE_GRACE_MS
    : null;
}
