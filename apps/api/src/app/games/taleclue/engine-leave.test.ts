import assert from "node:assert/strict";
import { test } from "node:test";
import { SYSTEM_ACTOR } from "../system.js";
import { apply, tick } from "./engine.js";
import { project } from "./project.js";
import {
  act,
  cardOf,
  ctxAt,
  game,
  giveClue,
  narratorOf,
  others,
  playAllDecoys,
} from "./test-helpers.js";

type State = ReturnType<typeof game>["state"];
const remove = (s: State, id: string, now = 0) =>
  act(s, SYSTEM_ACTOR, { type: "remove", playerId: id }, now);

test("remove is system-only and needs a real player", () => {
  const { state } = game(4);
  assert.deepEqual(apply(state, "p1", { type: "remove", playerId: "p2" }, ctxAt(0)), {
    ok: false,
    error: "wrong-phase",
  });
  assert.deepEqual(apply(state, SYSTEM_ACTOR, { type: "remove", playerId: "zed" }, ctxAt(0)), {
    ok: false,
    error: "not-a-player",
  });
});

test("a non-narrator who leaves during the vote keeps their decoy and their vote", () => {
  const { state: table } = playAllDecoys(giveClue(game(5).state).state);
  const n = narratorOf(table);
  const [a, b, c] = others(table);
  const aHand = [...table.hands[a]];
  let s = act(table, a, { type: "vote", cardId: cardOf(table, n)[0] }).state;
  const r = remove(s, a);
  s = r.state;
  assert.deepEqual(
    s.players.map((p) => p.id).sort(),
    [...table.players.map((p) => p.id)].filter((id) => id !== a).sort(),
  );
  assert.equal(s.table.length, 5);
  assert.ok(s.table.some((t) => t.ownerId === a));
  assert.equal(s.votes.length, 1);
  assert.deepEqual(s.discard.slice(0, aHand.length), aHand);
  assert.equal(s.hands[a], undefined);
  assert.equal(s.phase, "vote");
  assert.deepEqual(r.events, []);
  // The leaver's vote and decoy still count when the round reveals.
  s = act(s, b, { type: "vote", cardId: cardOf(table, a)[0] }).state;
  s = act(s, c, { type: "vote", cardId: cardOf(table, n)[0] }).state;
  const [d] = others(s).filter((id) => ![b, c].includes(id));
  s = act(s, d, { type: "vote", cardId: cardOf(table, n)[0] }).state;
  assert.equal(s.phase, "reveal");
  assert.equal(s.points[n], 3);
  // The vote on the leaver's decoy pays nobody.
  const award = s.results[0].steps.find((x) => x.type === "award-decoy");
  assert.ok(award && award.type === "award-decoy");
  assert.deepEqual(award.awards, []);
});

test("a leaver who had not played does not hold the decoy phase open or get an auto decoy", () => {
  const { state: clued } = giveClue(game(5).state);
  const [a, b, c, d] = others(clued);
  let s = act(clued, a, { type: "play-decoys", cardIds: [clued.hands[a][0]] }).state;
  s = act(s, b, { type: "play-decoys", cardIds: [s.hands[b][0]] }).state;
  s = act(s, d, { type: "play-decoys", cardIds: [s.hands[d][0]] }).state;
  assert.equal(s.phase, "decoy");
  const r = remove(s, c, 700);
  assert.equal(r.state.phase, "vote");
  assert.equal(r.state.table.length, 4);
  assert.equal(
    r.events.some((e) => e.type === "decoy-played"),
    false,
  );
  assert.equal(r.state.deadline, 700 + 60_000);
});

for (const phase of ["clue", "decoy", "vote"] as const) {
  test(`the narrator leaving during ${phase} voids the round and the next narrator starts`, () => {
    let s: State = game(5).state;
    if (phase !== "clue") s = giveClue(s).state;
    if (phase === "vote") s = playAllDecoys(s).state;
    const n = narratorOf(s);
    const idx = s.order.indexOf(n);
    const expectedNext = s.order[(idx + 1) % s.order.length];
    const hand = [...s.hands[n]];
    const onTable = s.table.map((t) => t.cardId);
    const r = remove(s, n, 1000);
    assert.deepEqual(r.events, [
      { type: "round-voided", round: 1, narratorId: n, reason: "narrator-left" },
      { type: "round-started", round: 2, narratorId: expectedNext },
    ]);
    assert.equal(r.state.narratorId, expectedNext);
    assert.equal(r.state.phase, "clue");
    assert.equal(r.state.deadline, 1000 + 90_000);
    assert.equal(r.state.order.includes(n), false);
    assert.ok(Object.values(r.state.points).every((p) => p === 0));
    // Their hand and everything on the table went to the discard pile, then hands were refilled.
    for (const card of [...hand, ...onTable]) {
      assert.ok(
        r.state.discard.includes(card) || Object.values(r.state.hands).flat().includes(card),
        card,
      );
    }
    for (const p of r.state.players) assert.equal(r.state.hands[p.id].length, 6);
    assert.equal(r.state.table.length, 0);
  });
}

test("the narrator leaving during the reveal does not void the round", () => {
  const { state: table } = playAllDecoys(giveClue(game(5).state).state);
  const n = narratorOf(table);
  let s = table;
  for (const id of others(table))
    s = act(s, id, { type: "vote", cardId: cardOf(table, n)[0] }).state;
  assert.equal(s.phase, "reveal");
  const idx = s.order.indexOf(n);
  const expectedNext = s.order[(idx + 1) % s.order.length];
  const r = remove(s, n);
  assert.deepEqual(r.events, []);
  assert.equal(r.state.phase, "reveal");
  const next = tick(r.state, ctxAt(r.state.deadline));
  assert.equal(next.state.narratorId, expectedNext);
  assert.equal(next.state.round, 2);
});

test("a departure before the current narrator keeps the narrator and the next one right", () => {
  let s: State = game(5).state;
  // Play two rounds by timeout to move the turn to index 2.
  for (let i = 0; i < 2; i++) s = tick(s, ctxAt(s.deadline)).state;
  const before = project(s, "zed");
  const leaver = s.order[0];
  const r = remove(s, leaver, s.deadline - 1);
  const after = project(r.state, "zed");
  assert.equal(r.events.length, 0);
  assert.equal(after.narratorId, before.narratorId);
  assert.equal(after.nextNarratorId, before.nextNarratorId);
  assert.equal(after.round, before.round);
});

test("the turn wraps when the last narrator in the order leaves", () => {
  let s: State = game(5).state;
  for (let i = 0; i < 4; i++) s = tick(s, ctxAt(s.deadline)).state;
  assert.equal(s.narratorId, s.order[4]);
  const leaver = s.order[4];
  const r = remove(s, leaver, s.deadline - 1);
  assert.equal(r.state.narratorId, r.state.order[0]);
  assert.equal(r.state.round, 6);
});

test("fewer than 3 players ends the game and the best of the rest win", () => {
  const { state } = game(3);
  state.points.p1 = 7;
  state.points.p2 = 4;
  state.points.p3 = 9;
  const r = remove(state, "p3");
  assert.equal(r.state.phase, "game-over");
  assert.equal(r.state.endReason, "not-enough-players");
  assert.deepEqual(r.state.winners, ["p1"]);
  assert.deepEqual(r.events, [
    { type: "game-over", winners: ["p1"], reason: "not-enough-players" },
  ]);
});
