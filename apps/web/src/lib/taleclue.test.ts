import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TALECLUE_CONFIG, type TaleclueView } from "@resenhark/shared";
import {
  taleclueAction,
  taleclueRevealElapsed,
  taleclueSelectionValid,
  taleclueVotableCards,
  taleclueWaitingCount,
} from "./taleclue";

const view: TaleclueView = {
  phase: "vote",
  config: DEFAULT_TALECLUE_CONFIG,
  round: 1,
  narratorId: "ana",
  nextNarratorId: "bia",
  clue: "Porta 42",
  decoyCount: 2,
  hand: ["tc-010", "tc-011"],
  table: ["tc-001", "tc-002", "tc-003"],
  myCards: ["tc-002"],
  myVote: null,
  acted: [],
  players: ["ana", "bia", "caio"].map((id) => ({ id, online: true, points: 0, position: 0 })),
  deadline: 60000,
  rounds: [],
  winners: [],
  endReason: null,
};
test("own cards are excluded from voting without changing the table", () => {
  assert.deepEqual(taleclueVotableCards(view), ["tc-001", "tc-003"]);
  assert.deepEqual(view.table, ["tc-001", "tc-002", "tc-003"]);
});
test("only the online narrator can give a clue", () => {
  const clue = { ...view, phase: "clue" as const };
  assert.equal(taleclueAction(clue, "ana", "player", 10000), "give-clue");
  assert.equal(taleclueAction(clue, "bia", "player", 10000), null);
  assert.equal(
    taleclueAction(
      { ...clue, players: clue.players.map((p) => ({ ...p, online: false })) },
      "ana",
      "player",
      10000,
    ),
    null,
  );
});
test("narrators cannot play decoys or vote", () => {
  for (const phase of ["decoy", "vote"] as const)
    assert.equal(taleclueAction({ ...view, phase }, "ana", "player", 10000), null);
  assert.equal(taleclueAction({ ...view, phase: "decoy" }, "bia", "player", 10000), "play-decoys");
  assert.equal(taleclueAction(view, "bia", "player", 10000), "vote");
});
test("spectators and unknown members never act", () => {
  for (const phase of ["clue", "decoy", "vote"] as const) {
    assert.equal(taleclueAction({ ...view, phase }, "ana", "spectator", 10000), null);
    assert.equal(taleclueAction({ ...view, phase }, "unknown", "player", 10000), null);
  }
});
test("paused, expired and finished phases cannot send stale actions", () => {
  for (const patch of [
    { deadline: null },
    { deadline: 10000 },
    { phase: "reveal" as const },
    { phase: "game-over" as const },
  ])
    assert.equal(taleclueAction({ ...view, ...patch }, "bia", "player", 10000), null);
});
test("submitted decoys and votes cannot be changed", () => {
  assert.equal(
    taleclueAction({ ...view, acted: ["bia"], phase: "decoy" }, "bia", "player", 10000),
    null,
  );
  assert.equal(taleclueAction({ ...view, acted: ["bia"] }, "bia", "player", 10000), null);
  assert.equal(taleclueAction({ ...view, myVote: "tc-001" }, "bia", "player", 10000), null);
});
test("waiting counts only online players who still owe an action", () => {
  assert.equal(taleclueWaitingCount(view), 2);
  assert.equal(taleclueWaitingCount({ ...view, acted: ["bia", "outsider"] }), 1);
  assert.equal(
    taleclueWaitingCount({
      ...view,
      players: view.players.map((p) => ({ ...p, online: p.id !== "caio" })),
      acted: ["bia"],
    }),
    0,
  );
  assert.equal(taleclueWaitingCount({ ...view, phase: "clue" }), 1);
  assert.equal(taleclueWaitingCount({ ...view, phase: "reveal" }), 0);
});
test("selection must be unique, owned and match the projected decoy count", () => {
  const decoy = { ...view, phase: "decoy" as const };
  assert.equal(taleclueSelectionValid(decoy, ["tc-010", "tc-011"]), true);
  for (const cards of [[], ["tc-010"], ["tc-010", "tc-010"], ["tc-010", "tc-001"]])
    assert.equal(taleclueSelectionValid(decoy, cards), false);
  assert.equal(taleclueSelectionValid({ ...decoy, decoyCount: 1 }, ["tc-010"]), true);
  assert.equal(taleclueSelectionValid(view, ["tc-002"]), false);
  assert.equal(taleclueSelectionValid(view, ["tc-001"]), true);
  assert.equal(
    taleclueSelectionValid({ ...view, phase: "clue" }, ["tc-010"], "  Porta 42  "),
    true,
  );
  assert.equal(taleclueSelectionValid({ ...view, phase: "clue" }, ["tc-010"], "   "), false);
  assert.equal(
    taleclueSelectionValid({ ...view, phase: "clue" }, ["tc-010"], "a".repeat(31)),
    false,
  );
});
test("a reveal reconnect seeks using the server deadline", () => {
  assert.equal(taleclueRevealElapsed(25000, 19000), 9000);
  assert.equal(taleclueRevealElapsed(25000, 10000), 0);
  assert.equal(taleclueRevealElapsed(25000, 9000), 0);
  assert.equal(taleclueRevealElapsed(25000, 26000), 15000);
  assert.equal(taleclueRevealElapsed(null, 19000), 0);
});
