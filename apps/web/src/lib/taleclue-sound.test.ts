import assert from "node:assert/strict";
import { test } from "node:test";
import type { TaleclueView } from "@resenhark/shared";
import {
  type TaleclueSound,
  createTaleclueAudio,
  createTaleclueSoundSequence,
  taleclueStepSoundTimes,
} from "./taleclue-sound";

type SoundView = Pick<TaleclueView, "round" | "phase" | "clue" | "deadline" | "rounds">;
const clue: SoundView = { round: 1, phase: "clue", clue: null, deadline: 60000, rounds: [] };
const decoy: SoundView = { ...clue, phase: "decoy", clue: "Porta" };
const reveal: SoundView = {
  ...decoy,
  phase: "reveal",
  deadline: 15000,
  rounds: [
    {
      round: 1,
      narratorId: "ana",
      clue: "Porta",
      steps: [
        {
          type: "board-move",
          moves: [
            { playerId: "ana", from: 0, to: 2 },
            { playerId: "bia", from: 3, to: 5 },
          ],
        },
      ],
    },
  ],
};
function output() {
  const played: { kind: TaleclueSound; delay: number }[] = [];
  let cancelled = 0;
  return {
    played,
    get cancelled() {
      return cancelled;
    },
    play(kind: TaleclueSound, delay = 0) {
      played.push({ kind, delay });
    },
    cancel() {
      cancelled++;
    },
  };
}
test("step times deduplicate simultaneous arrivals and omit stationary pieces", () => {
  assert.deepEqual(
    taleclueStepSoundTimes([
      { playerId: "ana", from: 0, to: 2 },
      { playerId: "bia", from: 3, to: 5 },
    ]),
    [10800, 12000],
  );
  assert.deepEqual(taleclueStepSoundTimes([{ playerId: "ana", from: 10, to: 10 }]), []);
  assert.deepEqual(taleclueStepSoundTimes([{ playerId: "ana", from: 48, to: 50 }]), [10800, 12000]);
  assert.deepEqual(
    taleclueStepSoundTimes([{ playerId: "ana", from: 0, to: 3 }]),
    [10400, 11200, 12000],
  );
});
test("mount, activation after a clue, repeated projections and history are silent", () => {
  const sound = output();
  const flow = createTaleclueSoundSequence(sound);
  flow.update(decoy, true, 0, false);
  flow.update(decoy, true, 1, true);
  flow.update({ ...decoy, rounds: reveal.rounds }, true, 2, true);
  assert.deepEqual(sound.played, []);
  flow.update({ ...clue, round: 2 }, true, 3, true);
  flow.update({ ...decoy, round: 2 }, true, 4, true);
  flow.update({ ...decoy, round: 2 }, true, 5, true);
  assert.deepEqual(sound.played, [{ kind: "clue", delay: 0 }]);
});
test("live reveal schedules exact remaining arrivals once and mute cancels them", () => {
  const sound = output();
  const flow = createTaleclueSoundSequence(sound);
  flow.update(clue, true, 0, true);
  flow.update(decoy, true, 0, true);
  flow.update(reveal, true, 1000, true);
  flow.update(reveal, true, 2000, true);
  assert.deepEqual(sound.played, [
    { kind: "clue", delay: 0 },
    { kind: "step", delay: 9800 },
    { kind: "step", delay: 11000 },
  ]);
  const before = sound.cancelled;
  flow.update(reveal, true, 3000, false);
  assert.equal(sound.cancelled, before + 1);
  flow.update(reveal, true, 4000, true);
  assert.equal(sound.played.length, 3);
  const late = output();
  const lateFlow = createTaleclueSoundSequence(late);
  lateFlow.update(decoy, true, 10000, true);
  lateFlow.update(reveal, true, 11000, true);
  assert.deepEqual(late.played, [{ kind: "step", delay: 1000 }]);
});
test("disconnect, resumed reveal, pause, new round and game end discard scheduled effects", () => {
  const sound = output();
  const flow = createTaleclueSoundSequence(sound);
  flow.update(decoy, true, 0, true);
  flow.update(reveal, true, 0, true);
  flow.update(reveal, false, 1000, true);
  const length = sound.played.length;
  flow.update(reveal, true, 10500, true);
  flow.update(reveal, true, 11000, true);
  assert.equal(sound.played.length, length);
  const before = sound.cancelled;
  flow.update({ ...reveal, deadline: null }, true, 11000, true);
  assert.equal(sound.cancelled, before + 1);
  flow.update({ ...clue, round: 2 }, true, 0, true);
  flow.update({ ...decoy, round: 2 }, true, 0, true);
  assert.equal(sound.played.at(-1)?.kind, "clue");
  const end = sound.cancelled;
  flow.update({ ...reveal, round: 2, phase: "game-over" }, true, 0, true);
  assert.equal(sound.cancelled, end + 1);
  flow.dispose();
});
test("audio is lazy and blocked or unavailable activation cannot throw into the game", async () => {
  let created = 0;
  const unsupported = createTaleclueAudio(() => {
    created++;
    throw new Error("unsupported");
  });
  unsupported.play("clue");
  assert.equal(created, 0);
  assert.equal(await unsupported.activate(), false);
  unsupported.cancel();
  unsupported.dispose();
  assert.equal(await unsupported.activate(), false);
  const blocked = createTaleclueAudio(
    () =>
      ({
        state: "suspended",
        resume: async () => {
          throw new Error("autoplay");
        },
        close: async () => {},
      }) as unknown as AudioContext,
  );
  assert.equal(await blocked.activate(), false);
  blocked.play("step", 1000);
  blocked.dispose();
});
test("mute and disposal stop every scheduled source and disconnect their graph", async () => {
  const calls: string[] = [];
  const param = {
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  };
  const source = () => ({
    type: "",
    frequency: param,
    onended: null,
    connect() {},
    disconnect() {
      calls.push("disconnect");
    },
    start(time: number) {
      calls.push(`start:${time}`);
    },
    stop(time?: number) {
      calls.push(time === undefined ? "cancel" : "end");
    },
  });
  const context = {
    state: "running",
    currentTime: 10,
    sampleRate: 48000,
    destination: {},
    createOscillator: source,
    createBufferSource: source,
    createGain: () => ({ gain: param, connect() {}, disconnect() {} }),
    createBiquadFilter: () => ({
      type: "",
      frequency: param,
      Q: param,
      connect() {},
      disconnect() {},
    }),
    createBuffer: () => ({ getChannelData: () => new Float32Array(3360) }),
    close: async () => {
      calls.push("close");
    },
  } as unknown as AudioContext;
  const audio = createTaleclueAudio(() => context);
  assert.equal(await audio.activate(), true);
  audio.play("clue", 2000);
  audio.play("step", 3000);
  assert.deepEqual(
    calls.filter((c) => c.startsWith("start")),
    ["start:12", "start:13", "start:13"],
  );
  audio.cancel();
  assert.equal(calls.filter((c) => c === "cancel").length, 3);
  assert.equal(calls.filter((c) => c === "disconnect").length, 3);
  audio.play("clue");
  audio.dispose();
  assert.equal(calls.filter((c) => c === "cancel").length, 4);
  assert.equal(calls.at(-1), "close");
  audio.play("clue");
  assert.equal(await audio.activate(), false);
});
