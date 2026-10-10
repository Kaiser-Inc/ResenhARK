import assert from "node:assert/strict";
import { test } from "node:test";
import type { TaleclueStep } from "@resenhark/shared";
import { type TableCard, type Vote, scoreRound } from "./scoring.js";

type Of<T extends TaleclueStep["type"]> = Extract<TaleclueStep, { type: T }>;
const step = <T extends TaleclueStep["type"]>(steps: TaleclueStep[], type: T) =>
  steps.find((s) => s.type === type) as Of<T>;

const pts = (awards: { playerId: string; points: number }[]) =>
  Object.fromEntries(awards.map((a) => [a.playerId, a.points]));

/** n narrates; a, b, c, d play one decoy each. Cards are named after their owner. */
const table: TableCard[] = [
  { cardId: "cn", ownerId: "n" },
  { cardId: "ca", ownerId: "a" },
  { cardId: "cb", ownerId: "b" },
  { cardId: "cc", ownerId: "c" },
  { cardId: "cd", ownerId: "d" },
];
const ids = ["n", "a", "b", "c", "d"];

function score(votes: Vote[], over: Partial<Parameters<typeof scoreRound>[0]> = {}) {
  return scoreRound({
    narratorId: "n",
    table,
    votes,
    activeIds: ids,
    pointsBefore: new Map(ids.map((id) => [id, 0])),
    targetPoints: 30,
    ...over,
  });
}

test("steps always come in the five-step order", () => {
  const { steps } = score([]);
  assert.deepEqual(
    steps.map((s) => s.type),
    ["card-flip", "votes", "award-correct", "award-decoy", "board-move"],
  );
});

test("card-flip lists the table in order and marks the narrator's card", () => {
  const { steps } = score([]);
  assert.deepEqual(step(steps, "card-flip").cards, [
    { cardId: "cn", ownerId: "n", narrator: true },
    { cardId: "ca", ownerId: "a", narrator: false },
    { cardId: "cb", ownerId: "b", narrator: false },
    { cardId: "cc", ownerId: "c", narrator: false },
    { cardId: "cd", ownerId: "d", narrator: false },
  ]);
});

test("some guess right: narrator and the right voters get 3, decoy votes add 1 each", () => {
  const votes: Vote[] = [
    { voterId: "a", cardId: "cn" },
    { voterId: "b", cardId: "cn" },
    { voterId: "c", cardId: "cd" },
    { voterId: "d", cardId: "ca" },
  ];
  const { steps, gained } = score(votes);
  const correct = step(steps, "award-correct");
  assert.equal(correct.outcome, "some");
  assert.deepEqual(pts(correct.awards), { n: 3, a: 3, b: 3 });
  assert.deepEqual(pts(step(steps, "award-decoy").awards), { d: 1, a: 1 });
  assert.deepEqual(Object.fromEntries(gained), { n: 3, a: 4, b: 3, c: 0, d: 1 });
});

test("everyone guesses right: narrator 0, each voter 2", () => {
  const votes = ["a", "b", "c", "d"].map((voterId) => ({ voterId, cardId: "cn" }));
  const { steps, gained } = score(votes);
  const correct = step(steps, "award-correct");
  assert.equal(correct.outcome, "all");
  assert.deepEqual(pts(correct.awards), { a: 2, b: 2, c: 2, d: 2 });
  assert.deepEqual(step(steps, "award-decoy").awards, []);
  assert.equal(gained.get("n"), 0);
});

test("nobody guesses right: narrator 0, each voter 2, decoy owners still get 1 per vote", () => {
  const votes: Vote[] = [
    { voterId: "a", cardId: "cb" },
    { voterId: "b", cardId: "ca" },
    { voterId: "c", cardId: "cb" },
    { voterId: "d", cardId: "cb" },
  ];
  const { steps, gained } = score(votes);
  const correct = step(steps, "award-correct");
  assert.equal(correct.outcome, "none");
  assert.deepEqual(pts(correct.awards), { a: 2, b: 2, c: 2, d: 2 });
  assert.deepEqual(pts(step(steps, "award-decoy").awards), { b: 3, a: 1 });
  assert.deepEqual(Object.fromEntries(gained), { n: 0, a: 3, b: 5, c: 2, d: 2 });
});

test("only those who voted count: two voters both right is 'all'", () => {
  const { steps } = score([
    { voterId: "a", cardId: "cn" },
    { voterId: "b", cardId: "cn" },
  ]);
  const correct = step(steps, "award-correct");
  assert.equal(correct.outcome, "all");
  assert.deepEqual(pts(correct.awards), { a: 2, b: 2 });
});

test("no votes: nobody scores and the board does not move", () => {
  const { steps, gained } = score([], {
    pointsBefore: new Map(ids.map((id) => [id, 4])),
  });
  assert.equal(step(steps, "award-correct").outcome, "no-votes");
  assert.deepEqual(step(steps, "award-correct").awards, []);
  assert.deepEqual(step(steps, "award-decoy").awards, []);
  assert.ok([...gained.values()].every((g) => g === 0));
  for (const m of step(steps, "board-move").moves) assert.equal(m.from, m.to);
});

test("the decoy bonus has no cap", () => {
  const voters = Array.from({ length: 7 }, (_, i) => `v${i}`);
  const { gained } = score(
    voters.map((voterId) => ({ voterId, cardId: "cb" })),
    { activeIds: [...ids, ...voters] },
  );
  assert.equal(gained.get("b"), 7);
});

test("three players with two decoys each: votes on both decoys add up", () => {
  const t: TableCard[] = [
    { cardId: "n1", ownerId: "n" },
    { cardId: "a1", ownerId: "a" },
    { cardId: "a2", ownerId: "a" },
    { cardId: "b1", ownerId: "b" },
    { cardId: "b2", ownerId: "b" },
  ];
  const { steps, gained } = score(
    [
      { voterId: "a", cardId: "b1" },
      { voterId: "b", cardId: "a1" },
    ],
    { table: t, activeIds: ["n", "a", "b"] },
  );
  assert.equal(step(steps, "award-correct").outcome, "none");
  assert.deepEqual(Object.fromEntries(gained), { n: 0, a: 3, b: 3 });
  // A single owner of two cards, both voted for.
  const both = score(
    [
      { voterId: "b", cardId: "a1" },
      { voterId: "n", cardId: "a2" },
    ],
    { table: t, activeIds: ["n", "a", "b"] },
  );
  assert.equal(both.gained.get("a"), 2);
});

test("a vote on the decoy of a player who left counts as wrong and pays nobody", () => {
  const { steps, gained } = score(
    [
      { voterId: "a", cardId: "cn" },
      { voterId: "b", cardId: "cd" },
    ],
    { activeIds: ["n", "a", "b", "c"] },
  );
  assert.equal(step(steps, "award-correct").outcome, "some");
  assert.deepEqual(step(steps, "award-decoy").awards, []);
  assert.equal(gained.has("d"), false);
  assert.equal(gained.get("b"), 0);
  assert.deepEqual(
    step(steps, "board-move").moves.map((m) => m.playerId),
    ["n", "a", "b", "c"],
  );
});

test("board-move caps the position at targetPoints", () => {
  const { steps } = score([{ voterId: "a", cardId: "cb" }], {
    pointsBefore: new Map([
      ["n", 29],
      ["a", 28],
      ["b", 29],
      ["c", 33],
      ["d", 0],
    ]),
    targetPoints: 30,
  });
  const moves = Object.fromEntries(step(steps, "board-move").moves.map((m) => [m.playerId, m]));
  assert.deepEqual(moves.b, { playerId: "b", from: 29, to: 30 });
  assert.deepEqual(moves.a, { playerId: "a", from: 28, to: 30 });
  assert.deepEqual(moves.c, { playerId: "c", from: 30, to: 30 });
});
