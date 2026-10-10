import assert from "node:assert/strict";
import { test } from "node:test";
import { SYSTEM_ACTOR } from "../system.js";
import {
  REVEAL_MS,
  apply,
  cardsPerDecoy,
  create,
  handSize,
  nextDeadline,
  requiredCards,
  tick,
} from "./engine.js";
import {
  CLUE_MS,
  DECOY_MS,
  VOTE_MS,
  act,
  cardOf,
  cfg,
  ctxAt,
  game,
  giveClue,
  narratorOf,
  others,
  playAllDecoys,
  syntheticDeck,
} from "./test-helpers.js";

test("hand size, decoys per player and the minimum deck follow the player count", () => {
  assert.equal(handSize(3), 7);
  assert.equal(handSize(4), 6);
  assert.equal(handSize(8), 6);
  assert.equal(cardsPerDecoy(3), 2);
  assert.equal(cardsPerDecoy(5), 1);
  assert.equal(requiredCards(3), 27);
  assert.equal(requiredCards(8), 56);
});

test("create deals 6 cards each (7 with 3 players), never repeating a card", () => {
  for (const [n, size] of [
    [3, 7],
    [4, 6],
    [8, 6],
  ] as const) {
    const { state } = game(n);
    const dealt = Object.values(state.hands).flat();
    assert.equal(dealt.length, n * size);
    assert.equal(new Set(dealt).size, dealt.length);
    for (const p of state.players) assert.equal(state.hands[p.id].length, size);
    assert.equal(state.deck.length, 60 - n * size);
  }
});

test("create shuffles the narrator order, starts in clue and announces the round", () => {
  const { state, events } = game(4);
  assert.deepEqual([...state.order].sort(), ["p1", "p2", "p3", "p4"]);
  assert.equal(state.phase, "clue");
  assert.equal(state.round, 1);
  assert.equal(state.narratorId, state.order[0]);
  assert.equal(state.deadline, CLUE_MS);
  assert.deepEqual(events, [
    { type: "game-started" },
    { type: "round-started", round: 1, narratorId: state.order[0] },
  ]);
  assert.equal(nextDeadline(state), CLUE_MS);
});

test("give-clue checks turn, phase, clue and card", () => {
  const { state } = game(4);
  const n = narratorOf(state);
  const [other] = others(state);
  const card = state.hands[n][0];
  const fail = (actor: string, action: Parameters<typeof apply>[2], s = state) => {
    const r = apply(s, actor, action, ctxAt(0));
    assert.equal(r.ok, false);
    return r.ok ? "" : r.error;
  };
  assert.equal(fail(other, { type: "give-clue", cardId: card, clue: "x" }), "not-your-turn");
  assert.equal(fail("zed", { type: "give-clue", cardId: card, clue: "x" }), "not-a-player");
  assert.equal(fail(n, { type: "give-clue", cardId: card, clue: "x".repeat(31) }), "invalid-hint");
  assert.equal(fail(n, { type: "give-clue", cardId: card, clue: "   " }), "invalid-hint");
  assert.equal(fail(n, { type: "give-clue", cardId: "nope", clue: "x" }), "invalid-card");
  assert.equal(
    fail(n, { type: "give-clue", cardId: state.hands[other][0], clue: "x" }),
    "invalid-card",
  );
  assert.equal(fail(n, { type: "play-decoys", cardIds: [card] }), "wrong-phase");
  assert.equal(fail(n, { type: "vote", cardId: card }), "wrong-phase");
});

test("a valid clue moves to decoy, trims the clue and never names the card", () => {
  const { state } = game(4);
  const n = narratorOf(state);
  const card = state.hands[n][0];
  const r = act(state, n, { type: "give-clue", cardId: card, clue: "  uma pista  " }, 1000);
  assert.equal(r.state.phase, "decoy");
  assert.equal(r.state.clue, "uma pista");
  assert.equal(r.state.narratorCard, card);
  assert.equal(r.state.hands[n].includes(card), false);
  assert.equal(r.state.deadline, 1000 + DECOY_MS);
  assert.deepEqual(r.events, [{ type: "clue-given", clue: "uma pista" }]);
  assert.equal(JSON.stringify(r.events).includes(card), false);
});

test("play-decoys checks turn, count, ownership and acts once", () => {
  const { state } = giveClue(game(4).state);
  const n = narratorOf(state);
  const [a, b] = others(state);
  const fail = (actor: string, ids: string[]) => {
    const r = apply(state, actor, { type: "play-decoys", cardIds: ids }, ctxAt(0));
    assert.equal(r.ok, false);
    return r.ok ? "" : r.error;
  };
  assert.equal(fail(n, [state.hands[n][0]]), "not-your-turn");
  assert.equal(fail(a, []), "invalid-card");
  assert.equal(fail(a, state.hands[a].slice(0, 2)), "invalid-card");
  assert.equal(fail(a, [state.hands[b][0]]), "invalid-card");
  const first = act(state, a, { type: "play-decoys", cardIds: [state.hands[a][0]] });
  assert.deepEqual(first.events, [{ type: "decoy-played", playerId: a, auto: false }]);
  assert.equal(first.state.phase, "decoy");
  const again = apply(
    first.state,
    a,
    { type: "play-decoys", cardIds: [first.state.hands[a][0]] },
    ctxAt(0),
  );
  assert.deepEqual(again, { ok: false, error: "already-acted" });
});

test("with 3 players each non-narrator plays exactly 2 decoys", () => {
  const { state } = giveClue(game(3).state);
  const a = others(state)[0];
  const [c1, c2, c3] = state.hands[a];
  const bad = apply(state, a, { type: "play-decoys", cardIds: [c1] }, ctxAt(0));
  assert.deepEqual(bad, { ok: false, error: "invalid-card" });
  const dup = apply(state, a, { type: "play-decoys", cardIds: [c1, c1] }, ctxAt(0));
  assert.deepEqual(dup, { ok: false, error: "invalid-card" });
  const three = apply(state, a, { type: "play-decoys", cardIds: [c1, c2, c3] }, ctxAt(0));
  assert.deepEqual(three, { ok: false, error: "invalid-card" });
  assert.equal(act(state, a, { type: "play-decoys", cardIds: [c1, c2] }).state.decoys.length, 1);
});

test("the last decoy opens the vote with a shuffled table of narrator card plus decoys", () => {
  const start = giveClue(game(4).state).state;
  const { state, events } = playAllDecoys(start, 5000);
  assert.equal(state.phase, "vote");
  assert.equal(state.deadline, 5000 + VOTE_MS);
  assert.equal(state.table.length, 4);
  assert.equal(state.table.filter((t) => t.ownerId === narratorOf(state)).length, 1);
  assert.equal(events.filter((e) => e.type === "decoy-played").length, 3);
});

test("vote checks turn, table, own card and acts once", () => {
  const { state } = playAllDecoys(giveClue(game(4).state).state);
  const n = narratorOf(state);
  const [a, b] = others(state);
  const own = cardOf(state, a)[0];
  const other = cardOf(state, b)[0];
  const fail = (actor: string, cardId: string, s = state) => {
    const r = apply(s, actor, { type: "vote", cardId }, ctxAt(0));
    assert.equal(r.ok, false);
    return r.ok ? "" : r.error;
  };
  assert.equal(fail(n, other), "not-your-turn");
  assert.equal(fail(a, own), "own-card");
  assert.equal(fail(a, "nope"), "invalid-card");
  const voted = act(state, a, { type: "vote", cardId: other });
  assert.deepEqual(voted.events, [{ type: "vote-cast", playerId: a }]);
  assert.equal(fail(a, other, voted.state), "already-acted");
});

function voteAll(s: ReturnType<typeof game>["state"], pick: (voter: string) => string, now = 0) {
  let cur = s;
  const events = [] as ReturnType<typeof apply> extends infer R
    ? R extends { events: infer E }
      ? E
      : never
    : never;
  for (const id of others(s)) {
    const r = act(cur, id, { type: "vote", cardId: pick(id) }, now);
    cur = r.state;
    (events as unknown[]).push(...r.events);
  }
  return { state: cur, events };
}

test("the last vote reveals with the five steps and scores", () => {
  const { state: table } = playAllDecoys(giveClue(game(4).state).state);
  const n = narratorOf(table);
  const narratorCard = cardOf(table, n)[0];
  const [a, b, c] = others(table);
  const { state, events } = voteAll(
    table,
    (v) => (v === a ? narratorCard : cardOf(table, a)[0]),
    9000,
  );
  assert.equal(state.phase, "reveal");
  assert.equal(state.deadline, 9000 + REVEAL_MS);
  const revealed = events.find((e) => e.type === "round-revealed");
  assert.ok(revealed && revealed.type === "round-revealed");
  assert.deepEqual(
    revealed.round.steps.map((s) => s.type),
    ["card-flip", "votes", "award-correct", "award-decoy", "board-move"],
  );
  // a was right, b and c voted a's decoy: some guessed right.
  assert.equal(state.points[n], 3);
  assert.equal(state.points[a], 3 + 2);
  assert.equal(state.points[b], 0);
  assert.equal(state.points[c], 0);
  assert.equal(state.results.length, 1);
});

test("after the reveal the next narrator takes over and hands are refilled", () => {
  const { state: table } = playAllDecoys(giveClue(game(4).state).state);
  const first = narratorOf(table);
  const narratorCard = cardOf(table, first)[0];
  const revealed = voteAll(table, () => narratorCard).state;
  const next = tick(revealed, ctxAt(revealed.deadline));
  assert.equal(next.state.phase, "clue");
  assert.equal(next.state.round, 2);
  assert.equal(next.state.narratorId, revealed.order[1]);
  assert.deepEqual(next.events, [
    { type: "round-started", round: 2, narratorId: revealed.order[1] },
  ]);
  for (const p of next.state.players) assert.equal(next.state.hands[p.id].length, 6);
  assert.equal(next.state.table.length, 0);
  assert.equal(next.state.clue, null);
  // Played cards went to the discard pile.
  assert.equal(next.state.discard.length, 4);
});

test("the narrator order cycles", () => {
  let s = game(3).state;
  const seen: string[] = [];
  for (let i = 0; i < 4; i++) {
    seen.push(narratorOf(s));
    const t = playAllDecoys(giveClue(s).state).state;
    const card = cardOf(t, narratorOf(t))[0];
    const revealed = voteAll(t, () => card).state;
    s = tick(revealed, ctxAt(revealed.deadline)).state;
  }
  assert.deepEqual(seen, [...s.order, s.order[0]]);
});

test("the game ends at the end of the reveal where someone reaches the target", () => {
  const { state: table } = playAllDecoys(giveClue(game(4).state).state);
  const n = narratorOf(table);
  const [a, b] = others(table);
  table.points[a] = cfg.targetPoints - 1;
  table.points[b] = cfg.targetPoints - 1;
  const narratorCard = cardOf(table, n)[0];
  const revealed = voteAll(table, (v) => (v === a ? narratorCard : cardOf(table, a)[0]), 100).state;
  // Mid-reveal the game is not over, even with the target reached.
  assert.equal(revealed.phase, "reveal");
  const over = tick(revealed, ctxAt(revealed.deadline));
  assert.equal(over.state.phase, "game-over");
  assert.equal(over.state.endReason, "points");
  assert.deepEqual(over.state.winners, [a]);
  assert.deepEqual(over.events, [{ type: "game-over", winners: [a], reason: "points" }]);
  assert.equal(nextDeadline(over.state), null);
});

test("a tie at the top shares the win", () => {
  const { state: table } = playAllDecoys(giveClue(game(4).state).state);
  const n = narratorOf(table);
  const [a, b, c] = others(table);
  table.points[a] = 12;
  table.points[b] = 12;
  // Everyone guesses right: each voter gets 2, so a and b stay tied above c.
  const card = cardOf(table, n)[0];
  const revealed = voteAll(table, () => card).state;
  assert.equal(revealed.points[c], 2);
  const over = tick(revealed, ctxAt(revealed.deadline)).state;
  assert.equal(over.endReason, "points");
  assert.deepEqual([...over.winners].sort(), [a, b].sort());
});

test("end finishes with no winners", () => {
  const { state } = game(4);
  const r = act(state, SYSTEM_ACTOR, { type: "end" });
  assert.equal(r.state.phase, "game-over");
  assert.equal(r.state.endReason, "ended");
  assert.deepEqual(r.state.winners, []);
  assert.deepEqual(r.events, [{ type: "game-over", winners: [], reason: "ended" }]);
  assert.deepEqual(apply(r.state, "p1", { type: "vote", cardId: "x" }, ctxAt(0)), {
    ok: false,
    error: "wrong-phase",
  });
});

test("apply does not mutate the state it is given", () => {
  const { state } = game(4);
  const before = structuredClone(state);
  giveClue(state);
  assert.deepEqual(state, before);
  assert.equal(syntheticDeck(3).length, 3);
  create(cfg, ["a", "b", "c"], syntheticDeck(40), ctxAt(0));
});
