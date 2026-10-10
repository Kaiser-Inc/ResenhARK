import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, nextDeadline, tick } from "./engine.js";
import {
  CLUE_MS,
  DECOY_MS,
  VOTE_MS,
  act,
  cardOf,
  ctxAt,
  game,
  giveClue,
  narratorOf,
  others,
  playAllDecoys,
} from "./test-helpers.js";

const offline = (s: ReturnType<typeof game>["state"], id: string, now = 0) =>
  act(s, id, { type: "set-online", online: false }, now);
const online = (s: ReturnType<typeof game>["state"], id: string, now = 0) =>
  act(s, id, { type: "set-online", online: true }, now);

test("a clue that never comes voids the round and passes the turn", () => {
  const { state } = game(4);
  const first = narratorOf(state);
  const handsBefore = structuredClone(state.hands);
  assert.deepEqual(tick(state, ctxAt(CLUE_MS - 1)).events, []);
  const r = tick(state, ctxAt(CLUE_MS));
  assert.deepEqual(r.events, [
    { type: "round-voided", round: 1, narratorId: first, reason: "no-clue" },
    { type: "round-started", round: 2, narratorId: state.order[1] },
  ]);
  assert.equal(r.state.phase, "clue");
  assert.equal(r.state.round, 2);
  assert.equal(r.state.narratorId, state.order[1]);
  assert.equal(r.state.deadline, CLUE_MS + CLUE_MS);
  assert.deepEqual(r.state.hands, handsBefore);
  assert.ok(Object.values(r.state.points).every((p) => p === 0));
  assert.equal(r.state.results.length, 0);
});

test("an offline narrator still gets the full clue time before the round is voided", () => {
  const { state } = game(4);
  const { state: away } = offline(state, narratorOf(state), 1000);
  assert.deepEqual(tick(away, ctxAt(CLUE_MS - 1)).events, []);
  assert.equal(tick(away, ctxAt(CLUE_MS)).events[0].type, "round-voided");
});

test("a missing decoy becomes random cards from that player's hand, flagged auto", () => {
  const { state: clued } = giveClue(game(4).state);
  const [a, b, c] = others(clued);
  let s = act(clued, a, { type: "play-decoys", cardIds: [clued.hands[a][0]] }).state;
  s = act(s, b, { type: "play-decoys", cardIds: [clued.hands[b][0]] }).state;
  const handC = [...s.hands[c]];
  const r = tick(s, ctxAt(DECOY_MS));
  assert.deepEqual(r.events, [{ type: "decoy-played", playerId: c, auto: true }]);
  assert.equal(r.state.phase, "vote");
  assert.equal(r.state.table.length, 4);
  const auto = r.state.decoys.find((d) => d.playerId === c);
  assert.equal(auto?.auto, true);
  assert.equal(auto?.cardIds.length, 1);
  assert.ok(auto && handC.includes(auto.cardIds[0]));
  assert.equal(r.state.hands[c].length, handC.length - 1);
  assert.equal(r.state.deadline, DECOY_MS + VOTE_MS);
});

test("with 3 players a missing decoy plays two random cards", () => {
  const { state: clued } = giveClue(game(3).state);
  const r = tick(clued, ctxAt(DECOY_MS));
  const autos = r.events.filter((e) => e.type === "decoy-played");
  assert.equal(autos.length, 2);
  for (const d of r.state.decoys) {
    assert.equal(d.cardIds.length, 2);
    assert.equal(new Set(d.cardIds).size, 2);
  }
  assert.equal(r.state.table.length, 5);
});

test("the decoy phase closes early once every online player played, covering the offline ones", () => {
  const { state: clued } = giveClue(game(4).state);
  const [a, b, c] = others(clued);
  const gone = offline(clued, c).state;
  let s = act(gone, a, { type: "play-decoys", cardIds: [gone.hands[a][0]] }, 500).state;
  assert.equal(s.phase, "decoy");
  const last = act(s, b, { type: "play-decoys", cardIds: [s.hands[b][0]] }, 700);
  assert.equal(last.state.phase, "vote");
  assert.deepEqual(
    last.events.map((e) => e.type === "decoy-played" && [e.playerId, e.auto]),
    [
      [b, false],
      [c, true],
    ],
  );
  assert.equal(last.state.table.length, 4);
  assert.equal(last.state.deadline, 700 + VOTE_MS);
  s = last.state;
});

test("a player going offline can complete the round of waiting", () => {
  const { state: clued } = giveClue(game(4).state);
  const [a, b, c] = others(clued);
  let s = act(clued, a, { type: "play-decoys", cardIds: [clued.hands[a][0]] }).state;
  s = act(s, b, { type: "play-decoys", cardIds: [s.hands[b][0]] }).state;
  assert.equal(s.phase, "decoy");
  const r = offline(s, c, 900);
  assert.equal(r.state.phase, "vote");
  assert.ok(r.events.some((e) => e.type === "decoy-played" && e.playerId === c && e.auto));
});

test("early close needs one real action: all others offline leaves the decoy phase open", () => {
  const { state: clued } = giveClue(game(4).state);
  let s = clued;
  for (const id of others(clued)) s = offline(s, id).state;
  assert.equal(s.phase, "decoy");
  assert.equal(s.decoys.length, 0);
});

test("the vote phase closes early once every online voter voted", () => {
  const { state: table } = playAllDecoys(giveClue(game(4).state).state);
  const n = narratorOf(table);
  const [a, b, c] = others(table);
  const gone = offline(table, c).state;
  const s = act(gone, a, { type: "vote", cardId: cardOf(table, n)[0] }).state;
  assert.equal(s.phase, "vote");
  const r = act(s, b, { type: "vote", cardId: cardOf(table, n)[0] }, 300);
  assert.equal(r.state.phase, "reveal");
  assert.ok(r.events.some((e) => e.type === "round-revealed"));
  assert.equal(r.state.deadline, 300 + 15_000);
});

test("a missing vote does not count; with no votes nobody scores", () => {
  const { state: table } = playAllDecoys(giveClue(game(4).state).state);
  const n = narratorOf(table);
  const [a] = others(table);
  const one = act(table, a, { type: "vote", cardId: cardOf(table, n)[0] }).state;
  const partial = tick(one, ctxAt(VOTE_MS));
  assert.equal(partial.state.phase, "reveal");
  assert.equal(partial.state.points[a], 2);
  const none = tick(table, ctxAt(VOTE_MS));
  assert.equal(none.state.phase, "reveal");
  assert.ok(Object.values(none.state.points).every((p) => p === 0));
  const revealed = none.events.find((e) => e.type === "round-revealed");
  assert.ok(revealed && revealed.type === "round-revealed");
  const award = revealed.round.steps.find((s) => s.type === "award-correct");
  assert.ok(award && award.type === "award-correct");
  assert.equal(award.outcome, "no-votes");
});

test("with nobody online the game pauses and resumes with a full phase timer", () => {
  const { state } = game(4);
  let s = state;
  for (const p of state.players) s = offline(s, p.id, 1000).state;
  assert.equal(nextDeadline(s), null);
  const idle = tick(s, ctxAt(10 * CLUE_MS));
  assert.deepEqual(idle.events, []);
  assert.deepEqual(idle.state, s);
  const back = online(s, "p1", 50_000);
  assert.equal(back.state.deadline, 50_000 + CLUE_MS);
  assert.equal(nextDeadline(back.state), 50_000 + CLUE_MS);
});

test("going offline and online again with someone else present keeps the deadline", () => {
  const { state } = game(4);
  const s = offline(state, "p1", 5).state;
  assert.equal(s.deadline, CLUE_MS);
  assert.equal(online(s, "p1", 9).state.deadline, CLUE_MS);
});

test("set-online from the system actor and unknown players are refused", () => {
  const { state } = game(4);
  assert.deepEqual(apply(state, "zed", { type: "set-online", online: false }, ctxAt(0)), {
    ok: false,
    error: "not-a-player",
  });
});
