import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_HITLINE_CONFIG } from "@resenhark/shared";
import {
  type HitlineAction,
  type HitlineState,
  apply,
  create,
  nextDeadline,
  tick,
} from "./engine.js";
import { project } from "./project.js";
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
  state.players[2].tokens = 0;
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

test("audio-missing drops the drawn card unrevealed and draws the next", () => {
  const { state } = create(DEFAULT_HITLINE_CONFIG, ["a", "b"], deckOf(10), fixedCtx());
  const tp = state.players[0].id;
  const ctx = fixedCtx();
  const s1 = ok(apply(state, tp, { type: "draw" }, ctx)).state;
  const first = s1.draw?.card.id;
  const r = ok(apply(s1, "system", { type: "audio-missing" }, ctx));
  assert.equal(r.state.deck.length, s1.deck.length - 1);
  assert.notEqual(r.state.draw?.card.id, first);
  assert.notEqual(r.state.draw?.id, s1.draw?.id);
  assert.deepEqual(r.state.discards, s1.discards);
  assert.equal(r.state.phase, "guessing");
  assert.deepEqual(
    r.events.map((e) => (e as { type: string }).type),
    ["audio-missing", "card-drawn"],
  );
});
test("audio-missing is system-only and needs a draw in guessing", () => {
  const { state } = create(DEFAULT_HITLINE_CONFIG, ["a", "b"], deckOf(10), fixedCtx());
  assert.deepEqual(apply(state, "system", { type: "audio-missing" }, fixedCtx()), {
    ok: false,
    error: "wrong-phase",
  });
  const tp = state.players[0].id;
  const s1 = ok(apply(state, tp, { type: "draw" }, fixedCtx())).state;
  assert.equal(apply(s1, tp, { type: "audio-missing" }, fixedCtx()).ok, false);
});
test("audio-missing with giveUp, or on the last card, ends by deck-empty", () => {
  const { state } = create(DEFAULT_HITLINE_CONFIG, ["a", "b"], deckOf(10), fixedCtx());
  const s1 = ok(apply(state, state.players[0].id, { type: "draw" }, fixedCtx())).state;
  const gave = ok(apply(s1, "system", { type: "audio-missing", giveUp: true }, fixedCtx()));
  assert.equal(gave.state.phase, "game-over");
  assert.equal(gave.state.endReason, "deck-empty");
  assert.equal(gave.state.draw, null);
  s1.deck = s1.deck.slice(0, 1);
  const last = ok(apply(s1, "system", { type: "audio-missing" }, fixedCtx()));
  assert.equal(last.state.endReason, "deck-empty");
});
test("system can end the game", () => {
  const { state } = create(DEFAULT_HITLINE_CONFIG, ["a", "b"], deckOf(10), fixedCtx());
  const r = ok(apply(state, "system", { type: "end" }, fixedCtx()));
  assert.equal(r.state.endReason, "ended");
});

// ---- Task 15: tokens, skip, buy, contests ----
const types = (r: { events: unknown[] }) => r.events.map((e) => (e as { type: string }).type);
/** n players, everyone with timeline [1990], deck top of the given year, turn player not yet drawn. */
function table(n: number, top: number, config = DEFAULT_HITLINE_CONFIG) {
  const ids = ["a", "b", "c"].slice(0, n);
  const { state } = create(config, ids, deckOf(20), fixedCtx());
  for (const p of state.players) p.timeline = [card(`${p.id}x`, 1990)];
  state.deck = [
    { ...card("top", top, "Top Song", ["Top Artist"]) },
    card("next", 2010),
    card("after", 2011),
    ...deckOf(5),
  ];
  state.turn = 0;
  const tp = state.players[0].id;
  const [, o1, o2] = state.players.map((p) => p.id);
  return { state, tp, o1, o2 };
}
function drawnTable(n: number, top: number, config = DEFAULT_HITLINE_CONFIG) {
  const t = table(n, top, config);
  return { ...t, state: ok(apply(t.state, t.tp, { type: "draw" }, fixedCtx())).state };
}
const lock = (slot: number, title = "", artist = ""): HitlineAction => ({
  type: "lock-guess",
  slot,
  title,
  artist,
});
const tokensOf = (s: HitlineState, id: string) => s.players.find((p) => p.id === id)?.tokens;
const timelineOf = (s: HitlineState, id: string) => s.players.find((p) => p.id === id)?.timeline;

test("skip costs 1 token, reveals the card and draws another", () => {
  const { state, tp } = drawnTable(2, 2000);
  const r = ok(apply(state, tp, { type: "skip" }, { ...fixedCtx(), newId: () => "z" }));
  assert.equal(r.state.players[0].tokens, 1);
  assert.deepEqual(
    r.state.discards.map((c) => c.id),
    ["top"],
  );
  assert.equal(r.state.deck.length, state.deck.length - 1);
  assert.equal(r.state.draw?.card.id, "next");
  assert.equal(r.state.draw?.id, "z");
  assert.notEqual(state.draw?.id, "z");
  assert.equal(r.state.phase, "guessing");
  assert.deepEqual(types(r), ["card-skipped", "card-drawn"]);
  assert.equal((r.events[0] as { card: { title: string } }).card.title, "Top Song");
});
test("skip without tokens is insufficient-tokens, and skip needs guessing", () => {
  const { state, tp } = drawnTable(2, 2000);
  state.players[0].tokens = 0;
  assert.deepEqual(apply(state, tp, { type: "skip" }, fixedCtx()), {
    ok: false,
    error: "insufficient-tokens",
  });
  const t = table(2, 2000);
  assert.deepEqual(apply(t.state, t.tp, { type: "skip" }, fixedCtx()), {
    ok: false,
    error: "wrong-phase",
  });
  assert.deepEqual(apply(state, state.players[1].id, { type: "skip" }, fixedCtx()), {
    ok: false,
    error: "not-your-turn",
  });
});
test("skip with an empty pile ends the game", () => {
  const { state, tp } = drawnTable(2, 2000);
  state.deck = state.deck.slice(0, 1);
  const r = ok(apply(state, tp, { type: "skip" }, fixedCtx()));
  assert.equal(r.state.phase, "game-over");
  assert.equal(r.state.endReason, "deck-empty");
});
test("buy costs 3, places the card correctly and only once per turn", () => {
  const { state, tp } = table(2, 2000);
  state.players[0].tokens = 7;
  const r = ok(apply(state, tp, { type: "buy" }, fixedCtx()));
  assert.equal(r.state.players[0].tokens, 4);
  assert.deepEqual(
    r.state.players[0].timeline.map((c) => c.year),
    [1990, 2000],
  );
  assert.equal(r.state.bought, true);
  assert.equal(r.state.deck.length, state.deck.length - 1);
  assert.deepEqual(types(r), ["card-bought"]);
  assert.deepEqual(apply(r.state, tp, { type: "buy" }, fixedCtx()), {
    ok: false,
    error: "already-bought",
  });
});
test("buy needs 3 tokens and can happen while guessing", () => {
  const { state, tp } = drawnTable(2, 2000);
  assert.deepEqual(apply(state, tp, { type: "buy" }, fixedCtx()), {
    ok: false,
    error: "insufficient-tokens",
  });
  state.players[0].tokens = 3;
  const r = ok(apply(state, tp, { type: "buy" }, fixedCtx()));
  assert.equal(r.state.players[0].tokens, 0);
  assert.equal(r.state.phase, "guessing");
  // the hidden draw stays in play untouched; the bought card is the one after it
  assert.equal(r.state.draw?.card.id, "top");
  assert.equal(r.state.draw?.id, state.draw?.id);
  assert.deepEqual(
    r.state.deck.map((c) => c.id),
    ["top", "after", ...state.deck.slice(3).map((c) => c.id)],
  );
  assert.deepEqual(
    r.state.players[0].timeline.map((c) => c.id),
    ["ax", "next"],
  );
  assert.deepEqual(types(r), ["card-bought"]);
  assert.equal(JSON.stringify(r.events).includes("Top Song"), false);
  assert.equal(JSON.stringify(r.events).includes('"top"'), false);
  assert.equal(JSON.stringify(project(r.state, "b")).includes("Top Song"), false);
  // and the guess still resolves against the original card
  const done = ok(apply(r.state, tp, lock(2), fixedCtx()));
  assert.ok(done.state.lastReveal?.card.id === "top" || done.state.phase === "contest");
});
test("buy while guessing with nothing after the hidden card ends the game uncharged", () => {
  const { state, tp } = drawnTable(2, 2000);
  state.players[0].tokens = 3;
  state.deck = state.deck.slice(0, 1);
  const r = ok(apply(state, tp, { type: "buy" }, fixedCtx()));
  assert.equal(r.state.endReason, "deck-empty");
  assert.equal(r.state.players[0].tokens, 3);
  assert.equal(JSON.stringify(r.events).includes("Top Song"), false);
});
test("buy after locking the guess is wrong-phase", () => {
  const { state, tp } = drawnTable(2, 2000);
  state.players[0].tokens = 5;
  state.players[1].tokens = 1;
  const locked = ok(apply(state, tp, lock(1), fixedCtx())).state;
  assert.equal(locked.phase, "contest");
  assert.deepEqual(apply(locked, tp, { type: "buy" }, fixedCtx()), {
    ok: false,
    error: "wrong-phase",
  });
});
test("buying the Nth card wins immediately", () => {
  const { state, tp } = table(2, 2000, { ...DEFAULT_HITLINE_CONFIG, targetCards: 2 });
  state.players[0].tokens = 3;
  const r = ok(apply(state, tp, { type: "buy" }, fixedCtx()));
  assert.equal(r.state.phase, "game-over");
  assert.deepEqual(r.state.winners, [tp]);
  assert.equal(r.state.endReason, "target");
});
test("buy with an empty pile ends the game", () => {
  const { state, tp } = table(2, 2000);
  state.players[0].tokens = 3;
  state.deck = [];
  const r = ok(apply(state, tp, { type: "buy" }, fixedCtx()));
  assert.equal(r.state.endReason, "deck-empty");
});
test("lock-guess opens the contest window when someone can contest", () => {
  const { state, tp } = drawnTable(2, 2000);
  const r = ok(apply(state, tp, lock(0), fixedCtx(1000)));
  assert.equal(r.state.phase, "contest");
  assert.equal(r.state.contestDeadline, 1000 + 15_000);
  assert.equal(nextDeadline(r.state), 16_000);
  assert.deepEqual(types(r), ["guess-locked", "contest-opened"]);
  assert.equal(r.state.lastReveal, null);
  assert.equal(r.state.deck.length, state.deck.length);
});
test("no contest window when the others are offline or have no tokens", () => {
  const a = drawnTable(2, 2000);
  a.state.players[1].online = false;
  assert.notEqual(ok(apply(a.state, a.tp, lock(0), fixedCtx())).state.phase, "contest");
  const b = drawnTable(2, 2000);
  b.state.players[1].tokens = 0;
  assert.notEqual(ok(apply(b.state, b.tp, lock(0), fixedCtx())).state.phase, "contest");
});
test("contest takes 1 token and the slot becomes unavailable", () => {
  const { state, tp, o1, o2 } = drawnTable(3, 2000);
  const w = ok(apply(state, tp, lock(1), fixedCtx())).state;
  const r = ok(apply(w, o1, { type: "contest", slot: 0 }, fixedCtx()));
  assert.equal(tokensOf(r.state, o1), 1);
  assert.deepEqual(types(r), ["contested"]);
  assert.equal(r.state.phase, "contest");
  assert.deepEqual(apply(r.state, o2, { type: "contest", slot: 0 }, fixedCtx()), {
    ok: false,
    error: "slot-taken",
  });
});
test("contesting the turn player's own slot is slot-taken; bad range is invalid-slot", () => {
  const { state, tp, o1 } = drawnTable(2, 2000);
  const w = ok(apply(state, tp, lock(1), fixedCtx())).state;
  assert.deepEqual(apply(w, o1, { type: "contest", slot: 1 }, fixedCtx()), {
    ok: false,
    error: "slot-taken",
  });
  for (const slot of [-1, 2, 0.5])
    assert.deepEqual(apply(w, o1, { type: "contest", slot }, fixedCtx()), {
      ok: false,
      error: "invalid-slot",
    });
});
test("contest checks phase, actor and tokens", () => {
  const { state, tp, o1, o2 } = drawnTable(3, 2000);
  assert.deepEqual(apply(state, o1, { type: "contest", slot: 0 }, fixedCtx()), {
    ok: false,
    error: "wrong-phase",
  });
  const w = ok(apply(state, tp, lock(1), fixedCtx())).state;
  assert.deepEqual(apply(w, tp, { type: "contest", slot: 0 }, fixedCtx()), {
    ok: false,
    error: "not-your-turn",
  });
  assert.deepEqual(apply(w, tp, { type: "pass" }, fixedCtx()), {
    ok: false,
    error: "not-your-turn",
  });
  w.players[2].tokens = 0;
  assert.deepEqual(apply(w, o2, { type: "contest", slot: 0 }, fixedCtx()), {
    ok: false,
    error: "insufficient-tokens",
  });
});
test("double contest by the same player is already-decided and charges once", () => {
  const { state, tp, o1 } = drawnTable(3, 2000);
  const w = ok(apply(state, tp, lock(1), fixedCtx())).state;
  const r1 = ok(apply(w, o1, { type: "contest", slot: 0 }, fixedCtx())).state;
  assert.deepEqual(apply(r1, o1, { type: "contest", slot: 0 }, fixedCtx()), {
    ok: false,
    error: "already-decided",
  });
  assert.deepEqual(apply(r1, o1, { type: "pass" }, fixedCtx()), {
    ok: false,
    error: "already-decided",
  });
  assert.equal(tokensOf(r1, o1), 1);
});
test("double draw is wrong-phase and the deck shrinks once", () => {
  const { state, tp } = drawnTable(2, 2000);
  assert.equal(state.deck.length, 8);
  assert.deepEqual(apply(state, tp, { type: "draw" }, fixedCtx()), {
    ok: false,
    error: "wrong-phase",
  });
  const w = ok(apply(state, tp, lock(0), fixedCtx())).state;
  assert.deepEqual(apply(w, tp, { type: "draw" }, fixedCtx()), { ok: false, error: "wrong-phase" });
  assert.equal(w.deck.length, 8);
  const r = ok(apply(w, state.players[1].id, { type: "pass" }, fixedCtx()));
  assert.equal(r.state.deck.length, 7);
});
test("window resolves as soon as everyone decided", () => {
  const { state, tp, o1, o2 } = drawnTable(3, 2000);
  const w = ok(apply(state, tp, lock(0), fixedCtx())).state;
  const r1 = ok(apply(w, o1, { type: "contest", slot: 1 }, fixedCtx())).state;
  assert.equal(r1.phase, "contest");
  const r2 = ok(apply(r1, o2, { type: "pass" }, fixedCtx()));
  assert.deepEqual(types(r2), ["passed", "card-revealed"]);
  assert.equal(r2.state.phase, "turn-start");
  assert.equal(r2.state.contestDeadline, null);
  assert.deepEqual(r2.state.contests, []);
});
test("an offline or token-less player does not hold the window open", () => {
  const { state, tp, o1 } = drawnTable(3, 2000);
  state.players[2].tokens = 0;
  const w = ok(apply(state, tp, lock(0), fixedCtx())).state;
  const r = ok(apply(w, o1, { type: "pass" }, fixedCtx()));
  assert.ok(types(r).includes("card-revealed"));
});
test("turn player keeps the card when both are right on the same year", () => {
  const { state, tp, o1 } = drawnTable(2, 1990);
  const w = ok(apply(state, tp, lock(1), fixedCtx())).state;
  const r = ok(apply(w, o1, { type: "contest", slot: 0 }, fixedCtx()));
  assert.equal(r.state.lastReveal?.receiverId, tp);
  assert.equal(timelineOf(r.state, tp)?.length, 2);
  assert.equal(timelineOf(r.state, o1)?.length, 1);
  assert.deepEqual(r.state.lastReveal?.contests, [{ playerId: o1, slot: 0, correct: true }]);
  assert.equal(r.state.discards.length, 0);
});
test("first correct contester gets the card into their own timeline", () => {
  const { state, tp, o1, o2 } = drawnTable(3, 2000);
  state.players[0].timeline = [1990, 2000, 2000, 2010].map((y, i) => card(`t${i}`, y));
  // turn player wrong at slot 0; o1 (slot 2) and o2 (slot 1) are both right
  const w = ok(apply(state, tp, lock(0), fixedCtx())).state;
  const r1 = ok(apply(w, o1, { type: "contest", slot: 2 }, fixedCtx())).state;
  const r = ok(apply(r1, o2, { type: "contest", slot: 1 }, fixedCtx()));
  assert.equal(r.state.lastReveal?.receiverId, o1);
  assert.deepEqual(
    timelineOf(r.state, o1)?.map((c) => c.year),
    [1990, 2000],
  );
  assert.equal(timelineOf(r.state, o2)?.length, 1);
  assert.equal(timelineOf(r.state, tp)?.length, 4);
  assert.deepEqual(
    r.state.lastReveal?.contests.map((c) => c.correct),
    [true, true],
  );
});
test("two correct contesters on a shared year: the first in order wins", () => {
  const { state, tp, o1, o2 } = drawnTable(3, 1990);
  // turn player wrong would need an invalid year, so make the turn timeline [2000] instead
  state.players[0].timeline = [card("tx", 2000)];
  const w = ok(apply(state, tp, lock(1), fixedCtx())).state;
  const r1 = ok(apply(w, o2, { type: "contest", slot: 0 }, fixedCtx())).state;
  assert.equal(r1.phase, "contest");
  const r = ok(apply(r1, o1, { type: "pass" }, fixedCtx()));
  assert.equal(r.state.lastReveal?.receiverId, o2);
});
test("nobody correct: the card is discarded", () => {
  const { state, tp, o1 } = drawnTable(2, 1980);
  const w = ok(apply(state, tp, lock(1), fixedCtx())).state;
  const r = ok(apply(w, o1, { type: "pass" }, fixedCtx()));
  assert.equal(r.state.lastReveal?.receiverId, null);
  assert.deepEqual(
    r.state.discards.map((c) => c.id),
    ["top"],
  );
});
test("a contester reaching the target wins", () => {
  const { state, tp, o1 } = drawnTable(2, 1980, { ...DEFAULT_HITLINE_CONFIG, targetCards: 2 });
  const w = ok(apply(state, tp, lock(1), fixedCtx())).state;
  const r = ok(apply(w, o1, { type: "contest", slot: 0 }, fixedCtx()));
  assert.equal(r.state.phase, "game-over");
  assert.deepEqual(r.state.winners, [o1]);
});
test("token rules: position+title, position+artist, wrong position+both, wrong position+one", () => {
  const cases: [number, string, string, boolean][] = [
    [1, "top song", "", true],
    [1, "", "Top Artist", true],
    [0, "Top Song", "top artist", true],
    [0, "Top Song", "", false],
    [0, "", "Top Artist", false],
    [1, "", "", false],
  ];
  for (const [slot, title, artist, awarded] of cases) {
    const { state, tp } = drawnTable(1, 2000);
    const r = ok(apply(state, tp, lock(slot, title, artist), fixedCtx()));
    assert.equal(r.state.lastReveal?.tokenAwarded, awarded, `${slot}/${title}/${artist}`);
    assert.equal(r.state.players[0].tokens, awarded ? 3 : 2);
  }
  const { state, tp } = drawnTable(1, 2000);
  const rev = ok(apply(state, tp, lock(1, "Top Song", "nope"), fixedCtx())).state.lastReveal;
  assert.equal(rev?.guess?.titleOk, true);
  assert.equal(rev?.guess?.artistOk, false);
});
test("a contester never earns a token for the names", () => {
  const { state, tp, o1 } = drawnTable(2, 1980);
  const w = ok(apply(state, tp, lock(1, "Top Song", "Top Artist"), fixedCtx())).state;
  const r = ok(apply(w, o1, { type: "contest", slot: 0 }, fixedCtx()));
  assert.equal(tokensOf(r.state, o1), 1);
  assert.equal(tokensOf(r.state, tp), 3); // wrong position + both names
  assert.equal(r.state.lastReveal?.tokenAwarded, true);
});
test("player with 0 tokens cannot contest and counts as decided", () => {
  const { state, tp, o1 } = drawnTable(2, 2000);
  state.players[1].tokens = 1;
  const w = ok(apply(state, tp, lock(0), fixedCtx())).state;
  assert.equal(w.phase, "contest");
  const r = ok(apply(w, o1, { type: "contest", slot: 1 }, fixedCtx()));
  assert.ok(types(r).includes("card-revealed"));
  assert.equal(tokensOf(r.state, o1), 0);
});

// ---- Task 17: deadlines and presence ----
const noLeak = (events: unknown[]) => {
  const json = JSON.stringify(events);
  assert.equal(json.includes("Top Song"), false);
  assert.equal(json.includes("Top Artist"), false);
  assert.equal(json.includes('"top"'), false);
  assert.equal(json.includes("2000"), false);
};
const sys = (s: HitlineState, a: HitlineAction, now = 0) =>
  ok(apply(s, "system", a, fixedCtx(now)));
const setOnline = (s: HitlineState, id: string, online: boolean, now: number) =>
  ok(apply(s, id, { type: "set-online", online }, fixedCtx(now))).state;

test("contest window closes at the deadline and resolves", () => {
  const { state, tp } = drawnTable(2, 2000);
  const w = ok(apply(state, tp, lock(1), fixedCtx(1000))).state;
  const early = tick(w, fixedCtx(15_999));
  assert.equal(early.state.phase, "contest");
  assert.deepEqual(early.events, []);
  const r = tick(w, fixedCtx(16_000));
  assert.deepEqual(types(r), ["card-revealed"]);
  assert.equal(r.state.phase, "turn-start");
  assert.equal(r.state.lastReveal?.reason, "resolved");
  assert.equal(r.state.contestDeadline, null);
});
test("guess timer expiring with a drawn card reveals and discards it", () => {
  const { state } = drawnTable(2, 2000);
  assert.equal(tick(state, fixedCtx(119_999)).events.length, 0);
  const r = tick(state, fixedCtx(120_000));
  assert.deepEqual(types(r), ["card-revealed"]);
  assert.equal(r.state.lastReveal?.reason, "timeout");
  assert.equal(r.state.lastReveal?.guess, null);
  assert.equal(r.state.lastReveal?.receiverId, null);
  assert.equal(r.state.lastReveal?.tokenAwarded, false);
  assert.deepEqual(
    r.state.discards.map((c) => c.id),
    ["top"],
  );
  assert.equal(r.state.deck.length, state.deck.length - 1);
  assert.equal(r.state.turn, 1);
  assert.equal(r.state.phase, "turn-start");
  assert.equal(r.state.turnDeadline, 240_000);
});
test("guess timer expiring before drawing passes the turn without discarding", () => {
  const { state, tp } = table(2, 2000);
  const r = tick(state, fixedCtx(120_000));
  assert.deepEqual(r.events, [{ type: "turn-passed", playerId: tp, reason: "timeout" }]);
  assert.equal(r.state.turn, 1);
  assert.equal(r.state.discards.length, 0);
  assert.equal(r.state.deck.length, state.deck.length);
  assert.equal(r.state.lastReveal, null);
});
test("turn player offline for 30s loses the turn, keeps tokens and timeline, card returns to the bottom unrevealed", () => {
  const { state, tp } = drawnTable(2, 2000);
  const off = setOnline(state, tp, false, 1000);
  assert.equal(off.players[0].offlineSince, 1000);
  assert.equal(nextDeadline(off), 31_000);
  assert.equal(tick(off, fixedCtx(30_999)).events.length, 0);
  const r = tick(off, fixedCtx(31_000));
  assert.deepEqual(r.events, [{ type: "turn-passed", playerId: tp, reason: "offline" }]);
  assert.equal(r.state.deck.at(-1)?.id, "top");
  assert.equal(r.state.deck[0].id, "next");
  assert.equal(r.state.deck.length, state.deck.length);
  assert.equal(r.state.lastReveal, null);
  assert.equal(r.state.discards.length, 0);
  assert.equal(r.state.players[0].tokens, 2);
  assert.equal(r.state.players[0].timeline.length, 1);
  assert.equal(r.state.turn, 1);
  assert.equal(r.state.draw, null);
  noLeak(r.events);
  assert.equal(JSON.stringify(project(r.state, "b")).includes("Top Song"), false);
});
test("coming back online clears the offline clock", () => {
  const { state, tp } = drawnTable(2, 2000);
  const back = setOnline(setOnline(state, tp, false, 1000), tp, true, 5000);
  assert.equal(back.players[0].offlineSince, null);
  assert.equal(tick(back, fixedCtx(60_000)).events.length, 0);
  assert.equal(nextDeadline(back), state.turnDeadline);
  // going offline twice keeps the first timestamp
  const twice = setOnline(setOnline(state, tp, false, 1000), tp, false, 9000);
  assert.equal(twice.players[0].offlineSince, 1000);
});
test("set-online is self-only and system cannot use it", () => {
  const { state } = table(2, 2000);
  assert.deepEqual(apply(state, "zzz", { type: "set-online", online: false }, fixedCtx()), {
    ok: false,
    error: "not-a-player",
  });
  assert.deepEqual(apply(state, "system", { type: "set-online", online: false }, fixedCtx()), {
    ok: false,
    error: "wrong-phase",
  });
});
test("offline players are skipped when the turn advances", () => {
  const { state, o1 } = table(3, 2000);
  const off = setOnline(state, o1, false, 0);
  const r = tick(off, fixedCtx(120_000));
  assert.equal(r.state.turn, 2);
  assert.equal(r.state.players[r.state.turn].online, true);
});
test("tick resets the clock after a pass instead of looping forever", () => {
  const { state } = table(2, 2000);
  const r = tick(state, fixedCtx(10_000_000));
  assert.equal(r.events.length, 1);
  assert.equal(r.state.turnDeadline, 10_120_000);
});
test("an all-offline table only runs on the guess timer", () => {
  const { state, tp, o1 } = table(2, 2000);
  const off = setOnline(setOnline(state, tp, false, 0), o1, false, 0);
  assert.equal(tick(off, fixedCtx(60_000)).events.length, 0);
  assert.equal(nextDeadline(off), 120_000);
});
test("removing the turn player passes the turn and returns the drawn card unrevealed", () => {
  const { state, tp, o1 } = drawnTable(3, 2000);
  const r = sys(state, { type: "remove", playerId: tp }, 500);
  assert.deepEqual(r.events, [{ type: "turn-passed", playerId: tp, reason: "removed" }]);
  assert.equal(r.state.players.length, 2);
  assert.equal(r.state.players[r.state.turn].id, o1);
  assert.equal(r.state.deck.at(-1)?.id, "top");
  assert.equal(r.state.deck.length, state.deck.length);
  assert.equal(r.state.draw, null);
  assert.equal(r.state.lastReveal, null);
  assert.equal(r.state.phase, "turn-start");
  assert.equal(r.state.turnDeadline, 500 + 120_000);
  noLeak(r.events);
  assert.equal(JSON.stringify(project(r.state, o1)).includes("Top Song"), false);
});
test("removing the turn player while contesting returns the card and drops the window", () => {
  const { state, tp, o1 } = drawnTable(3, 2000);
  const w = ok(apply(state, tp, lock(1), fixedCtx())).state;
  const r = sys(w, { type: "remove", playerId: tp });
  assert.equal(r.state.deck.at(-1)?.id, "top");
  assert.equal(r.state.phase, "turn-start");
  assert.equal(r.state.contestDeadline, null);
  assert.equal(r.state.players[r.state.turn].id, o1);
  noLeak(r.events);
});
test("removing the last-seat turn player wraps to the first", () => {
  const { state } = table(3, 2000);
  state.turn = 2;
  const last = state.players[2].id;
  const r = sys(state, { type: "remove", playerId: last });
  assert.equal(r.state.turn, 0);
});
test("removing a non-turn player before the turn keeps the turn on the same player", () => {
  const { state, tp } = table(3, 2000);
  state.turn = 2;
  const holder = state.players[2].id;
  const r = sys(state, { type: "remove", playerId: state.players[0].id });
  assert.equal(r.state.players[r.state.turn].id, holder);
  assert.deepEqual(r.events, []);
  assert.notEqual(tp, holder);
});
test("removing a contester drops their contest and re-evaluates the window", () => {
  const { state, tp, o1, o2 } = drawnTable(3, 2000);
  const w = ok(apply(state, tp, lock(0), fixedCtx())).state;
  const c = ok(apply(w, o1, { type: "contest", slot: 1 }, fixedCtx())).state;
  const r = sys(c, { type: "remove", playerId: o1 });
  assert.equal(r.state.phase, "contest");
  assert.deepEqual(r.state.contests, []);
  assert.equal(r.state.players.length, 2);
  // the remaining player passing now closes the window
  const done = ok(apply(r.state, o2, { type: "pass" }, fixedCtx()));
  assert.ok(types(done).includes("card-revealed"));
});
test("removing the last undecided player resolves the window", () => {
  const { state, tp, o1, o2 } = drawnTable(3, 2000);
  const w = ok(apply(state, tp, lock(0), fixedCtx())).state;
  const p = ok(apply(w, o1, { type: "pass" }, fixedCtx())).state;
  const r = sys(p, { type: "remove", playerId: o2 });
  assert.deepEqual(types(r), ["card-revealed"]);
  assert.equal(r.state.phase, "turn-start");
});
test("removing a passer drops the pass", () => {
  const { state, tp, o1 } = drawnTable(3, 2000);
  const w = ok(apply(state, tp, lock(0), fixedCtx())).state;
  const p = ok(apply(w, o1, { type: "pass" }, fixedCtx())).state;
  const r = sys(p, { type: "remove", playerId: o1 });
  assert.deepEqual(r.state.passed, []);
});
test("removing every player ends the game", () => {
  const { state, tp } = table(1, 2000);
  const r = sys(state, { type: "remove", playerId: tp });
  assert.equal(r.state.phase, "game-over");
  assert.equal(r.state.endReason, "ended");
  assert.deepEqual(r.state.winners, []);
  assert.deepEqual(types(r), ["game-over"]);
});
test("remove is system-only and needs a known player", () => {
  const { state, tp, o1 } = table(2, 2000);
  assert.deepEqual(apply(state, tp, { type: "remove", playerId: o1 }, fixedCtx()), {
    ok: false,
    error: "wrong-phase",
  });
  assert.deepEqual(apply(state, "system", { type: "remove", playerId: "zzz" }, fixedCtx()), {
    ok: false,
    error: "not-a-player",
  });
});
test("nextDeadline picks the earliest pending deadline", () => {
  const { state, o1 } = table(2, 2000);
  assert.equal(nextDeadline(state), 120_000);
  assert.equal(nextDeadline(setOnline(state, state.players[0].id, false, 1000)), 31_000);
  // an offline non-turn player never counts
  assert.equal(nextDeadline(setOnline(state, o1, false, 1000)), 120_000);
  const d = drawnTable(2, 2000);
  const w = ok(apply(d.state, d.tp, lock(0), fixedCtx(1000))).state;
  assert.equal(nextDeadline(w), 16_000);
  assert.equal(nextDeadline(sys(w, { type: "end" }).state), null);
});
