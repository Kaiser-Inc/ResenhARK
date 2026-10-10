import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TALECLUE_CONFIG, type TaleclueView } from "@resenhark/shared";
import { taleclueGuidance, taleclueTiming } from "./taleclue-guidance";

const view: TaleclueView = {
  phase: "clue",
  config: DEFAULT_TALECLUE_CONFIG,
  round: 1,
  narratorId: "ana",
  nextNarratorId: "bia",
  clue: null,
  decoyCount: 2,
  hand: [],
  table: [],
  myCards: [],
  myVote: null,
  acted: [],
  players: ["ana", "bia", "caio"].map((id) => ({ id, online: true, points: 0, position: 0 })),
  deadline: 60000,
  rounds: [],
  winners: [],
  endReason: null,
};

test("guidance explains the narrator task and the next action to waiting players", () => {
  assert.equal(taleclueGuidance(view, "ana", "player", "Ana").title, "Sua vez de dar a pista");
  assert.equal(taleclueGuidance(view, "bia", "player", "Ana").title, "Ana está pensando na pista.");
  assert.match(taleclueGuidance(view, "bia", "player", "Ana").description, /duas cartas/);
  assert.match(
    taleclueGuidance({ ...view, decoyCount: 1 }, "bia", "player", "Ana").description,
    /uma carta/,
  );
});

test("decoy guidance uses the projected count and confirms completed actions", () => {
  const decoy = { ...view, phase: "decoy" as const };
  assert.equal(taleclueGuidance(decoy, "bia", "player", "Ana").title, "Escolha duas iscas");
  assert.equal(
    taleclueGuidance({ ...decoy, decoyCount: 1 }, "bia", "player", "Ana").title,
    "Escolha uma isca",
  );
  assert.equal(
    taleclueGuidance({ ...decoy, acted: ["bia"] }, "bia", "player", "Ana").title,
    "Iscas enviadas.",
  );
  assert.equal(
    taleclueGuidance({ ...decoy, decoyCount: 1, acted: ["bia"] }, "bia", "player", "Ana").title,
    "Isca enviada.",
  );
  assert.equal(taleclueGuidance(decoy, "ana", "player", "Ana").title, "Sua pista já está na mesa.");
});

test("vote guidance distinguishes the narrator, voters and spectators", () => {
  const vote = { ...view, phase: "vote" as const };
  assert.equal(
    taleclueGuidance(vote, "bia", "player", "Ana").title,
    "Encontre a carta do narrador",
  );
  assert.equal(
    taleclueGuidance({ ...vote, myVote: "tc-001" }, "bia", "player", "Ana").title,
    "Voto enviado.",
  );
  assert.equal(
    taleclueGuidance({ ...vote, acted: ["bia"] }, "bia", "player", "Ana").title,
    "Voto enviado.",
  );
  assert.equal(
    taleclueGuidance(vote, "ana", "player", "Ana").description,
    "Você não vota nesta rodada.",
  );
  assert.equal(
    taleclueGuidance(vote, "bia", "spectator", "Ana").title,
    "Você está acompanhando esta partida.",
  );
  assert.equal(
    taleclueGuidance(vote, "outsider", "player", "Ana").title,
    "Você está acompanhando esta partida.",
  );
});

test("the ring uses configured durations and resumes the remaining fraction", () => {
  for (const [phase, duration] of [
    ["clue", 90],
    ["decoy", 60],
    ["vote", 60],
    ["reveal", 15],
  ] as const) {
    const timing = taleclueTiming({ ...view, phase, deadline: 60000 }, 55000, false);
    assert.equal(timing.seconds, 5);
    assert.equal(timing.fraction, 5 / duration);
  }
  assert.equal(
    taleclueTiming({ ...view, config: { ...view.config, clueSeconds: 120 } }, 30000, true).fraction,
    0.25,
  );
  assert.equal(taleclueTiming(view, -40000, true).fraction, 1);
});

test("urgency starts at ten seconds only while an action remains eligible", () => {
  const clock = { ...view, deadline: 20000 };
  assert.equal(taleclueTiming(clock, 10000, true).urgent, true);
  assert.equal(taleclueTiming(clock, 9999, true).urgent, false);
  assert.equal(taleclueTiming(clock, 10000, false).urgent, false);
  assert.equal(taleclueTiming(clock, 19999, true).urgent, true);
  assert.equal(taleclueTiming(clock, 20000, true).urgent, false);
  assert.equal(taleclueTiming({ ...clock, phase: "reveal" }, 10000, true).urgent, false);
  assert.deepEqual(taleclueTiming({ ...clock, deadline: null }, 10000, true), {
    seconds: 0,
    fraction: 0,
    urgent: false,
  });
  assert.deepEqual(taleclueTiming({ ...clock, phase: "game-over" }, 10000, true), {
    seconds: 0,
    fraction: 0,
    urgent: false,
  });
});
