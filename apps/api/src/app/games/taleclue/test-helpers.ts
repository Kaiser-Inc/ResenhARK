import { DEFAULT_TALECLUE_CONFIG, type TaleclueConfig } from "@resenhark/shared";
import { fixedCtx } from "../hitline/test-deck.js";
import type { Ctx } from "../system.js";
import {
  type EngineResult,
  type TaleclueAction,
  type TaleclueState,
  apply,
  create,
} from "./engine.js";

export const cfg: TaleclueConfig = { ...DEFAULT_TALECLUE_CONFIG, targetPoints: 10 };
export const CLUE_MS = cfg.clueSeconds * 1000;
export const DECOY_MS = cfg.decoySeconds * 1000;
export const VOTE_MS = cfg.voteSeconds * 1000;

/** Synthetic deck of `n` card ids. */
export const syntheticDeck = (n: number): string[] => Array.from({ length: n }, (_, i) => `c${i}`);

export const ctxAt = (now: number): Ctx => ({ ...fixedCtx(now) });

/** A game of `n` players p1..pn at t=0; the narrator order is whatever the rng shuffled. */
export function game(n = 4, deckSize = 60, config: TaleclueConfig = cfg) {
  const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const { state, events } = create(config, ids, syntheticDeck(deckSize), fixedCtx(0));
  return { state, events, ids };
}

export function ok(r: EngineResult): {
  state: TaleclueState;
  events: ReturnType<typeof create>["events"];
} {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r;
}

export function act(
  s: TaleclueState,
  actor: string,
  action: TaleclueAction,
  now = 0,
): { state: TaleclueState; events: ReturnType<typeof create>["events"] } {
  return ok(apply(s, actor, action, ctxAt(now)));
}

export const narratorOf = (s: TaleclueState) => s.narratorId as string;
export const others = (s: TaleclueState) =>
  s.players.map((p) => p.id).filter((id) => id !== s.narratorId);

/** Narrator gives a clue with the first card of their hand. */
export function giveClue(s: TaleclueState, now = 0) {
  const n = narratorOf(s);
  return act(s, n, { type: "give-clue", cardId: s.hands[n][0], clue: "uma pista" }, now);
}

/** Every non-narrator plays their first `decoyCount` cards. */
export function playAllDecoys(s: TaleclueState, now = 0) {
  let cur = s;
  const events = [] as ReturnType<typeof create>["events"];
  for (const id of others(s)) {
    const r = act(
      cur,
      id,
      { type: "play-decoys", cardIds: cur.hands[id].slice(0, cur.decoyCount) },
      now,
    );
    cur = r.state;
    events.push(...r.events);
  }
  return { state: cur, events };
}

export const cardOf = (s: TaleclueState, ownerId: string) =>
  s.table.filter((t) => t.ownerId === ownerId).map((t) => t.cardId);
