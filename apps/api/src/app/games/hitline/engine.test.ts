import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_HITLINE_CONFIG } from "@resenhark/shared";
import { type HitlineState, apply, create, nextDeadline } from "./engine.js";
import { card, deckOf, fixedCtx } from "./test-deck.js";

function ok(r: ReturnType<typeof apply>): { state: HitlineState; events: unknown[] } {
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r;
}
/** Solo game with a chosen timeline and deck top. */
function solo(timeline: number[], top: number, config = DEFAULT_HITLINE_CONFIG) {
  const { state } = create(
    config,
    ["a"],
    [card("t0", 1), card("t1", 1), card("t2", 1)],
    fixedCtx(),
  );
  state.players[0].timeline = timeline.map((y, i) => card(`p${i}`, y));
  state.deck = [card("top", top), card("next", 2010)];
  return state;
}

test("create deals one card and two tokens to each player in a shuffled order", () => {
  const { state, events } = create(DEFAULT_HITLINE_CONFIG, ["a", "b", "c"], deckOf(20), fixedCtx());
  assert.deepEqual(
    state.players.map((p) => p.tokens),
    [2, 2, 2],
  );
  assert.ok(state.players.every((p) => p.timeline.length === 1));
  assert.equal(state.deck.length, 17);
  assert.deepEqual(new Set(state.players.map((p) => p.id)), new Set(["a", "b", "c"]));
  assert.equal(state.phase, "turn-start");
  assert.equal(state.turnDeadline, 120_000);
  assert.deepEqual(events, [{ type: "game-started" }]);
});
test("only the turn player can draw", () => {
  const { state } = create(DEFAULT_HITLINE_CONFIG, ["a", "b", "c"], deckOf(20), fixedCtx());
  const other = state.players[1].id;
  assert.deepEqual(apply(state, other, { type: "draw" }, fixedCtx()), {
    ok: false,
    error: "not-your-turn",
  });
  assert.deepEqual(apply(state, "zzz", { type: "draw" }, fixedCtx()), {
    ok: false,
    error: "not-a-player",
  });
});
test("drawing twice is wrong-phase", () => {
  const { state } = create(DEFAULT_HITLINE_CONFIG, ["a", "b"], deckOf(20), fixedCtx());
  const tp = state.players[0].id;
  const s1 = ok(apply(state, tp, { type: "draw" }, fixedCtx())).state;
  assert.equal(s1.phase, "guessing");
  assert.deepEqual(apply(s1, tp, { type: "draw" }, fixedCtx()), {
    ok: false,
    error: "wrong-phase",
  });
});
test("apply does not mutate the input state", () => {
  const { state } = create(DEFAULT_HITLINE_CONFIG, ["a"], deckOf(5), fixedCtx());
  const before = structuredClone(state);
  apply(state, "a", { type: "draw" }, fixedCtx());
  assert.deepEqual(state, before);
});
test("a correct guess places the card in the turn player's timeline", () => {
  const s0 = solo([1990], 2000);
  const s1 = ok(apply(s0, "a", { type: "draw" }, fixedCtx())).state;
  const r = ok(
    apply(s1, "a", { type: "lock-guess", slot: 1, title: "x", artist: "y" }, fixedCtx()),
  );
  assert.deepEqual(
    r.state.players[0].timeline.map((c) => c.year),
    [1990, 2000],
  );
  assert.equal(r.state.lastReveal?.receiverId, "a");
  assert.equal(r.state.phase, "turn-start");
  assert.equal(r.state.draw, null);
  assert.equal(r.state.deck.length, 1);
});
test("a wrong guess discards the card", () => {
  const s1 = ok(apply(solo([1990], 2000), "a", { type: "draw" }, fixedCtx())).state;
  const r = ok(apply(s1, "a", { type: "lock-guess", slot: 0, title: "", artist: "" }, fixedCtx()));
  assert.deepEqual(
    r.state.discards.map((c) => c.id),
    ["top"],
  );
  assert.equal(r.state.players[0].timeline.length, 1);
  assert.equal(r.state.lastReveal?.receiverId, null);
});
test("reaching the target ends the game immediately", () => {
  const s1 = ok(
    apply(
      solo([1990], 2000, { ...DEFAULT_HITLINE_CONFIG, targetCards: 2 }),
      "a",
      { type: "draw" },
      fixedCtx(),
    ),
  ).state;
  const r = ok(apply(s1, "a", { type: "lock-guess", slot: 1, title: "", artist: "" }, fixedCtx()));
  assert.equal(r.state.phase, "game-over");
  assert.deepEqual(r.state.winners, ["a"]);
  assert.equal(r.state.endReason, "target");
  assert.ok(r.events.some((e) => (e as { type: string }).type === "game-over"));
  assert.equal(nextDeadline(r.state), null);
});
test("an empty deck ends the game by longest timeline, then tokens, then shared", () => {
  const mk = (tokA: number, tokB: number) => {
    const { state } = create(DEFAULT_HITLINE_CONFIG, ["a", "b"], deckOf(4), fixedCtx());
    state.deck = [];
    for (const p of state.players) {
      p.timeline = [card(`${p.id}1`, 1), card(`${p.id}2`, 2), card(`${p.id}3`, 3)];
      p.tokens = p.id === "a" ? tokA : tokB;
    }
    return state;
  };
  const turn = (s: HitlineState) => s.players[s.turn].id;
  const s1 = mk(2, 4);
  const r1 = ok(apply(s1, turn(s1), { type: "draw" }, fixedCtx()));
  assert.deepEqual(r1.state.winners, ["b"]);
  assert.equal(r1.state.endReason, "deck-empty");
  const s2 = mk(2, 2);
  const r2 = ok(apply(s2, turn(s2), { type: "draw" }, fixedCtx()));
  assert.deepEqual([...r2.state.winners].sort(), ["a", "b"]);
  const s3 = mk(2, 2);
  s3.players[0].timeline.push(card("extra", 4));
  const r3 = ok(apply(s3, turn(s3), { type: "draw" }, fixedCtx()));
  assert.deepEqual(r3.state.winners, [s3.players[0].id]);
});
test("solo game resolves without a contest window", () => {
  const s1 = ok(apply(solo([1990], 2000), "a", { type: "draw" }, fixedCtx())).state;
  const r = ok(apply(s1, "a", { type: "lock-guess", slot: 0, title: "", artist: "" }, fixedCtx()));
  assert.notEqual(r.state.phase, "contest");
  assert.equal(r.state.contestDeadline, null);
});
test("invalid slot is rejected", () => {
  const s1 = ok(apply(solo([1990], 2000), "a", { type: "draw" }, fixedCtx())).state;
  for (const slot of [-1, 2]) {
    assert.deepEqual(
      apply(s1, "a", { type: "lock-guess", slot, title: "", artist: "" }, fixedCtx()),
      { ok: false, error: "invalid-slot" },
    );
  }
});
test("turn advances skipping offline players and clears per-turn state", () => {
  const { state } = create(DEFAULT_HITLINE_CONFIG, ["a", "b", "c"], deckOf(20), fixedCtx());
  state.players[1].online = false;
  for (const p of state.players) p.timeline = [card(`${p.id}x`, 1990)];
  state.deck = [card("top", 2000), ...deckOf(5)];
  const tp = state.players[0].id;
  const s1 = ok(apply(state, tp, { type: "draw" }, fixedCtx())).state;
  const r = ok(
    apply(s1, tp, { type: "lock-guess", slot: 1, title: "", artist: "" }, fixedCtx(5000)),
  );
  assert.equal(r.state.turn, 2);
  assert.equal(r.state.turnDeadline, 5000 + 120_000);
  assert.equal(r.state.guess, null);
});
test("end finishes the game with no winners", () => {
  const { state } = create(DEFAULT_HITLINE_CONFIG, ["a", "b"], deckOf(20), fixedCtx());
  const r = ok(apply(state, "b", { type: "end" }, fixedCtx()));
  assert.equal(r.state.phase, "game-over");
  assert.equal(r.state.endReason, "ended");
  assert.deepEqual(r.state.winners, []);
});
