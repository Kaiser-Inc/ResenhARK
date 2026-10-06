import assert from "node:assert/strict";
import { test } from "node:test";
import { type Ack, DEFAULT_HUEHINT_CONFIG, type RoomStatePayload } from "@resenhark/shared";
import type { Socket } from "socket.io-client";
import {
  type TestServer,
  type TestSession,
  connectClient,
  createRoomVia,
  joinRoomVia,
  startTestServer,
  stateWhere,
} from "../../test/helpers.js";
import type { PlaylistSource } from "../gateways/ports/playlist-source.js";

const emit = (socket: Socket, event: string, ...payload: unknown[]): Promise<Ack> =>
  socket.timeout(2000).emitWithAck(event, ...payload);

const playlists: PlaylistSource = {
  load: async () => ({
    ok: true,
    playlist: {
      name: "Fake",
      cards: Array.from({ length: 10 }, (_, i) => ({
        id: `k${i}`,
        title: `T${i}`,
        artists: ["A"],
        year: 1960 + i,
        isrc: null,
        spotifyUrl: null,
      })),
    },
  }),
};

async function room(t: { after: (fn: () => void | Promise<void>) => void }, names: string[]) {
  const app: TestServer = await startTestServer({ playlists });
  t.after(() => app.close());
  const owner = await createRoomVia(app, names[0]);
  const sessions: TestSession[] = [owner];
  for (const name of names.slice(1)) sessions.push(await joinRoomVia(app, owner.code, name));
  const clients: Socket[] = [];
  for (const s of sessions) clients.push(await connectClient(app.url, s.sessionToken));
  t.after(() => {
    for (const c of clients) c.close();
  });
  await stateWhere(clients[0], (s) => s.room.members.every((m) => m.online));
  return { app, sessions, clients, owner: clients[0] };
}

test("owner selects Huehint and every member sees the choice", async (t) => {
  const { clients, owner } = await room(t, ["Ana", "Bia"]);
  assert.deepEqual(await emit(owner, "lobby:select-game", { game: "huehint" }), { ok: true });
  const s = await stateWhere(clients[1], (x) => x.room.lobby.selectedGame === "huehint");
  assert.deepEqual(s.room.lobby.huehintConfig, DEFAULT_HUEHINT_CONFIG);
});

test("only the owner selects or configures, with valid input", async (t) => {
  const { clients, owner } = await room(t, ["Ana", "Bia"]);
  const bia = clients[1];
  assert.deepEqual(await emit(bia, "lobby:select-game", { game: "huehint" }), {
    ok: false,
    error: "not-owner",
  });
  assert.deepEqual(await emit(owner, "lobby:select-game", { game: "codetalk" }), {
    ok: false,
    error: "invalid-input",
  });
  const config = { turnsPerPlayer: 1, hintSeconds: 20, guessSeconds: 60, maxPlayers: 4 };
  assert.deepEqual(await emit(bia, "lobby:configure-huehint", config), {
    ok: false,
    error: "not-owner",
  });
  assert.deepEqual(await emit(owner, "lobby:configure-huehint", { ...config, turnsPerPlayer: 4 }), {
    ok: false,
    error: "invalid-input",
  });
  assert.deepEqual(await emit(owner, "lobby:configure-huehint", config), { ok: true });
  await stateWhere(bia, (x) => x.room.lobby.huehintConfig.turnsPerPlayer === 1);
});

test("game choice and Huehint config are locked while a game runs", async (t) => {
  const { owner } = await room(t, ["Ana", "Bia"]);
  assert.deepEqual(await emit(owner, "lobby:import", { link: "x" }), { ok: true });
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
  assert.deepEqual(await emit(owner, "lobby:select-game", { game: "huehint" }), {
    ok: false,
    error: "game-running",
  });
  assert.deepEqual(await emit(owner, "lobby:configure-huehint", DEFAULT_HUEHINT_CONFIG), {
    ok: false,
    error: "game-running",
  });
});

const hue = (s: RoomStatePayload) =>
  s.room.game?.type === "huehint" ? s.room.game.view : undefined;
const triple = (c: { h: number; s: number; b: number }) => `"h":${c.h},"s":${c.s},"b":${c.b}`;

/** Selects Huehint, starts it and returns each client's first Huehint state, plus the giver's index. */
async function startHuehint(
  sessions: TestSession[],
  clients: Socket[],
  config?: Record<string, number>,
) {
  const owner = clients[0];
  assert.deepEqual(await emit(owner, "lobby:select-game", { game: "huehint" }), { ok: true });
  if (config) assert.deepEqual(await emit(owner, "lobby:configure-huehint", config), { ok: true });
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
  const states = await Promise.all(clients.map((c) => stateWhere(c, (s) => !!hue(s))));
  const giverId = hue(states[0])?.giverId;
  const giver = sessions.findIndex((s) => s.memberId === giverId);
  assert.ok(giver >= 0);
  return { states, giver };
}

test("owner starts Huehint without a playlist; only the giver gets the color", async (t) => {
  const { sessions, clients } = await room(t, ["Ana", "Bia", "Cid"]);
  const { states, giver } = await startHuehint(sessions, clients);
  const view = hue(states[giver]);
  assert.equal(view?.mode, "group");
  assert.equal(view?.phase, "hint");
  assert.equal(view?.totalRounds, 6);
  assert.ok(view?.color);
  assert.ok(states[0].events.some((e) => e.type === "game-started"));
  for (const [i, s] of states.entries()) {
    if (i === giver) continue;
    assert.equal(hue(s)?.color, null);
    assert.equal(
      JSON.stringify(s).includes(triple(view.color)),
      false,
      `client ${i} saw the color`,
    );
  }
});

test("full round over sockets: hint, guesses, reveal with scores, then the next giver", async (t) => {
  const { app, sessions, clients } = await room(t, ["Ana", "Bia", "Cid"]);
  const { giver } = await startHuehint(sessions, clients);
  const guessers = clients.filter((_, i) => i !== giver);
  assert.deepEqual(await emit(guessers[0], "game:action", { type: "give-hint", hint: "Azul" }), {
    ok: false,
    error: "not-your-turn",
  });
  assert.deepEqual(
    await emit(clients[giver], "game:action", { type: "give-hint", hint: "Azul 2077" }),
    { ok: false, error: "invalid-hint" },
  );
  assert.deepEqual(
    await emit(clients[giver], "game:action", { type: "give-hint", hint: "Azul Piscina" }),
    { ok: true },
  );
  await stateWhere(guessers[0], (s) => hue(s)?.hint === "Azul Piscina");
  assert.deepEqual(
    await emit(guessers[0], "game:action", { type: "guess", color: { h: 400, s: 1, b: 1 } }),
    { ok: false, error: "invalid-input" },
  );
  for (const g of guessers) {
    assert.deepEqual(
      await emit(g, "game:action", { type: "guess", color: { h: 190, s: 70, b: 80 } }),
      { ok: true },
    );
  }
  const revealed = await stateWhere(clients[giver], (s) => hue(s)?.phase === "reveal");
  const [round] = hue(revealed)?.rounds ?? [];
  assert.equal(round.hint, "Azul Piscina");
  assert.equal(round.guesses.length, 2);
  assert.ok(round.giverScore !== null && round.giverScore >= 0 && round.giverScore <= 10);

  app.clock.set(app.clock.now() + 12_000);
  await app.hub.runDueTimers();
  const next = await stateWhere(clients[0], (s) => hue(s)?.phase === "hint");
  assert.equal(hue(next)?.round, 2);
  assert.notEqual(hue(next)?.giverId, sessions[giver].memberId);
});

test("a member above maxPlayers is a spectator and never sees the color", async (t) => {
  const { sessions, clients } = await room(t, ["Ana", "Bia", "Cid"]);
  const { states, giver } = await startHuehint(sessions, clients, {
    ...DEFAULT_HUEHINT_CONFIG,
    maxPlayers: 2,
  });
  const cid = states[2];
  assert.equal(cid.room.members.find((m) => m.id === sessions[2].memberId)?.role, "spectator");
  assert.notEqual(giver, 2);
  const color = hue(states[giver])?.color;
  assert.ok(color);
  assert.equal(JSON.stringify(cid).includes(triple(color)), false);
  assert.deepEqual(
    await emit(clients[2], "game:action", { type: "guess", color: { h: 1, s: 1, b: 1 } }),
    { ok: false, error: "not-a-player" },
  );
});

test("owner ends and resets a Huehint game", async (t) => {
  const { sessions, clients } = await room(t, ["Ana", "Bia"]);
  await startHuehint(sessions, clients);
  assert.deepEqual(await emit(clients[0], "game:end"), { ok: true });
  const over = await stateWhere(clients[1], (s) => hue(s)?.phase === "game-over");
  assert.equal(hue(over)?.endReason, "ended");
  assert.deepEqual(await emit(clients[0], "game:reset"), { ok: true });
  await stateWhere(clients[1], (s) => s.room.game === null);
});

test("starting Huehint after a Hitline game keeps that game's songs as played", async (t) => {
  const { clients, owner } = await room(t, ["Ana", "Bia"]);
  assert.deepEqual(await emit(owner, "lobby:import", { link: "x" }), { ok: true });
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
  assert.deepEqual(await emit(owner, "game:end"), { ok: true });
  assert.deepEqual(await emit(owner, "lobby:select-game", { game: "huehint" }), { ok: true });
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
  const s = await stateWhere(clients[1], (x) => !!hue(x));
  assert.equal(s.room.lobby.remaining, 8, "the 2 dealt cards stay played");
});

const giveHint = async (giver: Socket) =>
  assert.deepEqual(await emit(giver, "game:action", { type: "give-hint", hint: "Verde Musgo" }), {
    ok: true,
  });
const guessOf = (color = { h: 100, s: 50, b: 40 }) => ({ type: "guess", color });

test("reconnecting mid-round: the giver gets the color back, a guesser gets myGuess back", async (t) => {
  const { app, sessions, clients } = await room(t, ["Ana", "Bia", "Cid"]);
  const { states, giver } = await startHuehint(sessions, clients);
  const color = hue(states[giver])?.color;
  await giveHint(clients[giver]);
  const g = [0, 1, 2].find((i) => i !== giver) as number;
  assert.deepEqual(await emit(clients[g], "game:action", guessOf()), { ok: true });
  clients[giver].close();
  clients[g].close();
  const giverAgain = await connectClient(app.url, sessions[giver].sessionToken);
  const guesserAgain = await connectClient(app.url, sessions[g].sessionToken);
  t.after(() => {
    giverAgain.close();
    guesserAgain.close();
  });
  const gs = await stateWhere(giverAgain, (s) => hue(s)?.phase === "guessing");
  assert.deepEqual(hue(gs)?.color, color);
  const us = await stateWhere(guesserAgain, (s) => hue(s)?.phase === "guessing");
  assert.deepEqual(hue(us)?.myGuess, { h: 100, s: 50, b: 40 });
  assert.equal(hue(us)?.color, null);
});

test("duplicate concurrent guesses from one player: exactly one ok, the rest already-guessed", async (t) => {
  const { sessions, clients } = await room(t, ["Ana", "Bia", "Cid"]);
  const { giver } = await startHuehint(sessions, clients);
  await giveHint(clients[giver]);
  const g = clients[[0, 1, 2].find((i) => i !== giver) as number];
  const acks = await Promise.all(
    Array.from({ length: 5 }, () => emit(g, "game:action", guessOf())),
  );
  assert.equal(acks.filter((a) => a.ok).length, 1);
  assert.equal(acks.filter((a) => !a.ok && a.error === "already-guessed").length, 4);
});

test("concurrent guesses from different players are all recorded and the round reveals once", async (t) => {
  const { sessions, clients } = await room(t, ["Ana", "Bia", "Cid", "Dan"]);
  const { giver } = await startHuehint(sessions, clients);
  let reveals = 0;
  clients[giver].on("room:state", (s: RoomStatePayload) => {
    reveals += s.events.filter((e) => e.type === "round-revealed").length;
  });
  await giveHint(clients[giver]);
  const guessers = clients.filter((_, i) => i !== giver);
  const acks = await Promise.all(guessers.map((c) => emit(c, "game:action", guessOf())));
  assert.deepEqual(acks, [{ ok: true }, { ok: true }, { ok: true }]);
  const s = await stateWhere(clients[giver], (x) => hue(x)?.phase === "reveal");
  assert.equal(hue(s)?.rounds[0].guesses.length, 3);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(reveals, 1);
});

test("giver leaving during the hint cancels the round and drops their future rounds", async (t) => {
  const { sessions, clients } = await room(t, ["Ana", "Bia", "Cid"]);
  const { giver } = await startHuehint(sessions, clients);
  const watcher = clients[(giver + 1) % 3];
  assert.deepEqual(await emit(clients[giver], "room:leave"), { ok: true });
  const s = await stateWhere(watcher, (x) => x.events.some((e) => e.type === "round-canceled"));
  const view = hue(s);
  assert.equal(view?.phase, "hint");
  assert.equal(view?.round, 2);
  assert.equal(view?.totalRounds, 5, "6 rounds minus the leaver's second turn");
  assert.equal(view?.rounds.length, 0);
});

test("a guesser disconnecting lets the round reveal when the others are in", async (t) => {
  const { sessions, clients } = await room(t, ["Ana", "Bia", "Cid"]);
  const { giver } = await startHuehint(sessions, clients);
  await giveHint(clients[giver]);
  const [g1, g2] = [0, 1, 2].filter((i) => i !== giver);
  assert.deepEqual(await emit(clients[g1], "game:action", guessOf()), { ok: true });
  clients[g2].close();
  const s = await stateWhere(clients[giver], (x) => hue(x)?.phase === "reveal");
  assert.deepEqual(
    hue(s)?.rounds[0].guesses.map((g) => g.playerId),
    [sessions[g1].memberId],
  );
});

test("an api restart mid-round keeps the Huehint game", async (t) => {
  const { app, sessions, clients } = await room(t, ["Ana", "Bia"]);
  const { states, giver } = await startHuehint(sessions, clients);
  const color = hue(states[giver])?.color;
  await giveHint(clients[giver]);
  app.store.redis.disconnect();
  for (const c of clients) c.close();
  await app.close();

  const app2 = await startTestServer({ playlists, keepData: true });
  t.after(() => app2.close());
  await app2.hub.rehydrate();
  const back = await connectClient(app2.url, sessions[giver].sessionToken);
  t.after(() => back.close());
  const s = await stateWhere(back, (x) => hue(x)?.phase === "guessing");
  assert.equal(hue(s)?.hint, "Verde Musgo");
  assert.deepEqual(hue(s)?.color, color);
});

test("starting Huehint with one online member runs solo", async (t) => {
  const { app, clients, owner } = await room(t, ["Ana"]);
  assert.deepEqual(await emit(owner, "lobby:select-game", { game: "huehint" }), { ok: true });
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
  const s = await stateWhere(owner, (x) => hue(x)?.phase === "memorize");
  assert.equal(hue(s)?.mode, "solo");
  assert.equal(hue(s)?.totalRounds, 5);
  assert.ok(hue(s)?.color);
  app.clock.set(app.clock.now() + 3000);
  await app.hub.runDueTimers();
  const open = await stateWhere(clients[0], (x) => hue(x)?.phase === "guessing");
  assert.equal(hue(open)?.color, null);
  assert.ok(open.events.some((e) => e.type === "memorize-ended"));
});
