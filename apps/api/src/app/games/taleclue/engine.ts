import {
  TALECLUE_MIN_PLAYERS,
  type TaleclueConfig,
  type TaleclueEndReason,
  type TaleclueEvent,
  type TaleclueIntent,
  type TalecluePhase,
  type TaleclueRoundView,
  isValidClue,
} from "@resenhark/shared";
import { shuffle } from "../../core/shuffle.js";
import { type Ctx, SYSTEM_ACTOR, type SystemAction } from "../system.js";
import { type TableCard, type Vote, scoreRound } from "./scoring.js";

export const REVEAL_MS = 15_000;

export type Player = { id: string; online: boolean };
export type DecoyPlay = { playerId: string; cardIds: string[]; auto: boolean };
export type TaleclueState = {
  config: TaleclueConfig;
  players: Player[];
  /** Narrator order, shuffled at create. */
  order: string[];
  /** Index in `order` of the current narrator. */
  turn: number;
  narratorId: string | null;
  phase: TalecluePhase;
  /** Draw pile; the top is index 0. */
  deck: string[];
  discard: string[];
  hands: Record<string, string[]>;
  /** Every card that left the draw pile in this game, for the room's memory. */
  used: string[];
  /** 1-based. */
  round: number;
  /** Decoy cards each non-narrator plays this round; frozen when the round starts. */
  decoyCount: number;
  clue: string | null;
  narratorCard: string | null;
  decoys: DecoyPlay[];
  /** Shuffled when the vote opens. */
  table: TableCard[];
  votes: Vote[];
  points: Record<string, number>;
  deadline: number;
  results: TaleclueRoundView[];
  winners: string[];
  endReason: TaleclueEndReason | null;
};
export type TaleclueAction = TaleclueIntent | SystemAction;
export type RuleError =
  | "not-a-player"
  | "wrong-phase"
  | "not-your-turn"
  | "invalid-hint"
  | "invalid-card"
  | "own-card"
  | "already-acted";
export type EngineResult =
  | { ok: true; state: TaleclueState; events: TaleclueEvent[] }
  | { ok: false; error: RuleError };

/** Three players need a bigger hand and two decoys each to fill the table. */
export const handSize = (players: number) => (players === TALECLUE_MIN_PLAYERS ? 7 : 6);
export const cardsPerDecoy = (players: number) => (players === TALECLUE_MIN_PLAYERS ? 2 : 1);
/** The deck a game needs to deal every hand and play the first round. */
export const requiredCards = (players: number) =>
  players * (handSize(players) + cardsPerDecoy(players));

/**
 * `priority` cards (the ones the room has not seen) sit on top of the draw pile, each group shuffled
 * on its own, so they are dealt first.
 */
export function create(
  config: TaleclueConfig,
  playerIds: string[],
  deck: string[],
  ctx: Ctx,
  priority: string[] = [],
): { state: TaleclueState; events: TaleclueEvent[] } {
  const order = shuffle(playerIds, ctx.rng);
  const s: TaleclueState = {
    config: structuredClone(config),
    players: order.map((id) => ({ id, online: true })),
    order,
    turn: 0,
    narratorId: null,
    phase: "clue",
    deck: [
      ...shuffle(
        deck.filter((c) => priority.includes(c)),
        ctx.rng,
      ),
      ...shuffle(
        deck.filter((c) => !priority.includes(c)),
        ctx.rng,
      ),
    ],
    discard: [],
    hands: Object.fromEntries(order.map((id) => [id, []])),
    used: [],
    round: 0,
    decoyCount: 1,
    clue: null,
    narratorCard: null,
    decoys: [],
    table: [],
    votes: [],
    points: Object.fromEntries(order.map((id) => [id, 0])),
    deadline: 0,
    results: [],
    winners: [],
    endReason: null,
  };
  const events: TaleclueEvent[] = [{ type: "game-started" }];
  startRound(s, ctx, events);
  return { state: s, events };
}

function phaseMs(s: TaleclueState, phase: TalecluePhase): number {
  if (phase === "clue") return s.config.clueSeconds * 1000;
  if (phase === "decoy") return s.config.decoySeconds * 1000;
  if (phase === "vote") return s.config.voteSeconds * 1000;
  return REVEAL_MS;
}

function enter(s: TaleclueState, phase: TalecluePhase, ctx: Ctx): void {
  s.phase = phase;
  s.deadline = ctx.now + phaseMs(s, phase);
}

/**
 * Draws every hand back to full. When the draw pile runs out the discards are shuffled back into it
 * (never the hands). False when even that is not enough.
 */
function deal(s: TaleclueState, ctx: Ctx): boolean {
  const size = handSize(s.players.length);
  for (const { id } of s.players) {
    const hand = s.hands[id];
    while (hand.length < size) {
      if (s.deck.length === 0 && s.discard.length > 0) {
        s.deck = shuffle(s.discard, ctx.rng);
        s.discard = [];
      }
      const card = s.deck.shift();
      if (card === undefined) return false;
      hand.push(card);
      if (!s.used.includes(card)) s.used.push(card);
    }
  }
  return true;
}

// Events go to every socket in the room: never put a card or a vote in one before the reveal.
function startRound(s: TaleclueState, ctx: Ctx, events: TaleclueEvent[]): void {
  if (!deal(s, ctx)) {
    finish(s, "deck-empty", events);
    return;
  }
  s.round += 1;
  s.narratorId = s.order[s.turn];
  s.decoyCount = cardsPerDecoy(s.players.length);
  s.clue = null;
  s.narratorCard = null;
  s.decoys = [];
  s.table = [];
  s.votes = [];
  enter(s, "clue", ctx);
  events.push({ type: "round-started", round: s.round, narratorId: s.narratorId });
}

const nonNarrators = (s: TaleclueState) => s.players.filter((p) => p.id !== s.narratorId);

/**
 * Someone is online and every online player who must act did, with at least one real action: a
 * phase where everyone is away never closes by itself (nobody online means paused).
 */
function allIn(s: TaleclueState): boolean {
  if (!s.players.some((p) => p.online)) return false;
  const onlineDone = (acted: (id: string) => boolean) =>
    nonNarrators(s).every((p) => !p.online || acted(p.id));
  if (s.phase === "decoy") {
    return (
      s.decoys.some((d) => !d.auto) && onlineDone((id) => s.decoys.some((d) => d.playerId === id))
    );
  }
  if (s.phase === "vote") {
    return s.votes.length > 0 && onlineDone((id) => s.votes.some((v) => v.voterId === id));
  }
  return false;
}

/** Plays random cards for everyone who has not played, then opens the vote. */
function closeDecoys(s: TaleclueState, ctx: Ctx, events: TaleclueEvent[]): void {
  for (const p of nonNarrators(s)) {
    if (s.decoys.some((d) => d.playerId === p.id)) continue;
    const cardIds = shuffle(s.hands[p.id], ctx.rng).slice(0, s.decoyCount);
    s.hands[p.id] = s.hands[p.id].filter((c) => !cardIds.includes(c));
    s.decoys.push({ playerId: p.id, cardIds, auto: true });
    events.push({ type: "decoy-played", playerId: p.id, auto: true });
  }
  openVote(s, ctx);
}

function openVote(s: TaleclueState, ctx: Ctx): void {
  const cards: TableCard[] = [
    { cardId: s.narratorCard as string, ownerId: s.narratorId as string },
    ...s.decoys.flatMap((d) => d.cardIds.map((cardId) => ({ cardId, ownerId: d.playerId }))),
  ];
  s.table = shuffle(cards, ctx.rng);
  enter(s, "vote", ctx);
}

function reveal(s: TaleclueState, ctx: Ctx, events: TaleclueEvent[]): void {
  const { steps, gained } = scoreRound({
    narratorId: s.narratorId as string,
    table: s.table,
    votes: s.votes,
    activeIds: s.players.map((p) => p.id),
    pointsBefore: new Map(Object.entries(s.points)),
    targetPoints: s.config.targetPoints,
  });
  for (const [id, points] of gained) s.points[id] = (s.points[id] ?? 0) + points;
  const view: TaleclueRoundView = {
    round: s.round,
    narratorId: s.narratorId as string,
    clue: s.clue as string,
    steps,
  };
  s.results.push(view);
  enter(s, "reveal", ctx);
  events.push({ type: "round-revealed", round: view });
}

/** The narrator did not clue in time or left: the round is void, its cards are discarded. */
function voidRound(
  s: TaleclueState,
  reason: "no-clue" | "narrator-left",
  ctx: Ctx,
  events: TaleclueEvent[],
): void {
  events.push({
    type: "round-voided",
    round: s.round,
    narratorId: s.narratorId as string,
    reason,
  });
  nextNarrator(s, ctx, events);
}

/** The round is over: its cards are discarded and the next narrator in the order starts. */
function nextNarrator(s: TaleclueState, ctx: Ctx, events: TaleclueEvent[]): void {
  s.discard.push(...roundCards(s));
  s.turn = (s.turn + 1) % s.order.length;
  startRound(s, ctx, events);
}

/** Closes the current phase early when every online player has acted. */
function closeIfAllIn(s: TaleclueState, ctx: Ctx, events: TaleclueEvent[]): void {
  if (!allIn(s)) return;
  if (s.phase === "decoy") closeDecoys(s, ctx, events);
  else if (s.phase === "vote") reveal(s, ctx, events);
}

/** Ends the reveal: the game is over if someone reached the target, else the next narrator starts. */
function afterReveal(s: TaleclueState, ctx: Ctx, events: TaleclueEvent[]): void {
  if (s.players.some((p) => (s.points[p.id] ?? 0) >= s.config.targetPoints)) {
    finish(s, "points", events);
    return;
  }
  nextNarrator(s, ctx, events);
}

/** Every card the round put on the table, narrator's included. */
const roundCards = (s: TaleclueState): string[] => [
  ...(s.narratorCard ? [s.narratorCard] : []),
  ...s.decoys.flatMap((d) => d.cardIds),
];

function finish(s: TaleclueState, reason: TaleclueEndReason, events: TaleclueEvent[]): void {
  s.phase = "game-over";
  s.endReason = reason;
  s.winners = [];
  if (reason !== "ended" && s.players.length > 0) {
    const best = Math.max(...s.players.map((p) => s.points[p.id] ?? 0));
    s.winners = s.players.filter((p) => (s.points[p.id] ?? 0) === best).map((p) => p.id);
  }
  events.push({ type: "game-over", winners: [...s.winners], reason });
}

/**
 * A departed player's hand goes to the discard pile, but what they already put on the table (decoys,
 * votes) stays for the round. The narrator leaving before the reveal voids the round.
 */
function removePlayer(s: TaleclueState, id: string, ctx: Ctx, events: TaleclueEvent[]): void {
  const idx = s.order.indexOf(id);
  s.order.splice(idx, 1);
  // `turn` can end one before the first index; the advance then wraps onto the successor.
  if (idx <= s.turn) s.turn -= 1;
  s.players = s.players.filter((p) => p.id !== id);
  s.discard.push(...(s.hands[id] ?? []));
  delete s.hands[id];
  if (s.players.length < TALECLUE_MIN_PLAYERS) finish(s, "not-enough-players", events);
  else if (id === s.narratorId && ["clue", "decoy", "vote"].includes(s.phase)) {
    voidRound(s, "narrator-left", ctx, events);
  } else closeIfAllIn(s, ctx, events);
}

function hasActed(
  s: TaleclueState,
  actorId: string,
  type: "give-clue" | "play-decoys" | "vote",
): boolean {
  if (type === "give-clue") return s.narratorId === actorId && s.narratorCard !== null;
  if (type === "play-decoys") return s.decoys.some((d) => d.playerId === actorId);
  return s.votes.some((v) => v.voterId === actorId);
}

/** The narrator of the round after this one; null once the game is over. */
export function nextNarratorId(s: TaleclueState): string | null {
  const len = s.order.length;
  // `turn` can sit one before the first index after a narrator left, hence the double modulo.
  return s.phase === "game-over" || len === 0 ? null : s.order[(((s.turn + 1) % len) + len) % len];
}

export function apply(
  state: TaleclueState,
  actorId: string,
  action: TaleclueAction,
  ctx: Ctx,
): EngineResult {
  const s = structuredClone(state);
  const events: TaleclueEvent[] = [];
  const system = actorId === SYSTEM_ACTOR;
  const fail = (error: RuleError): EngineResult => ({ ok: false, error });
  // A repeat of something the player already did, even after the phase moved on, is already-acted.
  const phaseError = (type: "give-clue" | "play-decoys" | "vote"): EngineResult =>
    fail(!system && hasActed(s, actorId, type) ? "already-acted" : "wrong-phase");
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
    case "give-clue": {
      if (system || s.phase !== "clue") return phaseError("give-clue");
      if (s.narratorId !== actorId) return fail("not-your-turn");
      if (!isValidClue(action.clue)) return fail("invalid-hint");
      const hand = s.hands[actorId];
      if (!hand.includes(action.cardId)) return fail("invalid-card");
      s.hands[actorId] = hand.filter((c) => c !== action.cardId);
      s.narratorCard = action.cardId;
      s.clue = action.clue.trim();
      enter(s, "decoy", ctx);
      events.push({ type: "clue-given", clue: s.clue });
      break;
    }
    case "play-decoys": {
      if (system || s.phase !== "decoy") return phaseError("play-decoys");
      if (s.narratorId === actorId) return fail("not-your-turn");
      if (s.decoys.some((d) => d.playerId === actorId)) return fail("already-acted");
      const hand = s.hands[actorId];
      const ids = action.cardIds;
      if (
        ids.length !== s.decoyCount ||
        new Set(ids).size !== ids.length ||
        !ids.every((c) => hand.includes(c))
      ) {
        return fail("invalid-card");
      }
      s.hands[actorId] = hand.filter((c) => !ids.includes(c));
      s.decoys.push({ playerId: actorId, cardIds: [...ids], auto: false });
      events.push({ type: "decoy-played", playerId: actorId, auto: false });
      closeIfAllIn(s, ctx, events);
      break;
    }
    case "vote": {
      if (system || s.phase !== "vote") return phaseError("vote");
      if (s.narratorId === actorId) return fail("not-your-turn");
      if (s.votes.some((v) => v.voterId === actorId)) return fail("already-acted");
      const card = s.table.find((t) => t.cardId === action.cardId);
      if (!card) return fail("invalid-card");
      if (card.ownerId === actorId) return fail("own-card");
      s.votes.push({ voterId: actorId, cardId: action.cardId });
      events.push({ type: "vote-cast", playerId: actorId });
      closeIfAllIn(s, ctx, events);
      break;
    }
    case "set-online": {
      if (system) return fail("wrong-phase");
      const me = s.players.find((p) => p.id === actorId) as Player;
      if (action.online) {
        // Nobody was online, so the game was paused: the phase restarts its full timer.
        if (!s.players.some((p) => p.online)) s.deadline = ctx.now + phaseMs(s, s.phase);
        me.online = true;
      } else if (me.online) {
        me.online = false;
        closeIfAllIn(s, ctx, events);
      }
      break;
    }
    default:
      return fail("wrong-phase");
  }
  return { ok: true, state: s, events };
}

export function tick(
  state: TaleclueState,
  ctx: Ctx,
): { state: TaleclueState; events: TaleclueEvent[] } {
  const s = structuredClone(state);
  const events: TaleclueEvent[] = [];
  // Paused: with nobody online nothing ticks, so an abandoned room can expire.
  if (!s.players.some((p) => p.online)) return { state: s, events };
  // Each step sets a deadline after ctx.now, so this ends within a few steps.
  while (s.phase !== "game-over" && ctx.now >= s.deadline) {
    if (s.phase === "clue") voidRound(s, "no-clue", ctx, events);
    else if (s.phase === "decoy") closeDecoys(s, ctx, events);
    else if (s.phase === "vote") reveal(s, ctx, events);
    else afterReveal(s, ctx, events);
  }
  return { state: s, events };
}

export function nextDeadline(s: TaleclueState): number | null {
  return s.phase === "game-over" || !s.players.some((p) => p.online) ? null : s.deadline;
}
