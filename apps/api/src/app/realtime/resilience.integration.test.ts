import assert from "node:assert/strict";
import { test } from "node:test";
import type { Ack } from "@resenhark/shared";
import type { Socket } from "socket.io-client";
import {
  type TestServer,
  type TestSession,
  connectClient,
  createRoomVia,
  hitlineView,
  joinRoomVia,
  startTestServer,
  stateWhere,
} from "../../test/helpers.js";
import type { Card } from "../games/hitline/engine.js";
import type { PlaylistSource } from "../gateways/ports/playlist-source.js";

type Cleanup = { after: (fn: () => void | Promise<void>) => void };

const emit = (socket: Socket, event: string, ...payload: unknown[]): Promise<Ack> =>
  socket.timeout(2000).emitWithAck(event, ...payload);

const cards: Card[] = Array.from({ length: 20 }, (_, i) => ({
  id: `k${i}`,
  title: `T${i}`,
  artists: ["A"],
  year: 1960 + i,
  isrc: null,
  spotifyUrl: null,
}));
const playlists: PlaylistSource = {
  load: async () => ({ ok: true, playlist: { name: "Fake", cards } }),
};
const withAudio = { playlists, audio: { findPreviewUrl: async () => "u" } };

async function startRoom(t: Cleanup, names: string[]) {
  const app: TestServer = await startTestServer(withAudio);
  t.after(() => app.close());
  const sessions: TestSession[] = [await createRoomVia(app, names[0])];
  for (const name of names.slice(1)) sessions.push(await joinRoomVia(app, sessions[0].code, name));
  const clients: Socket[] = [];
  for (const s of sessions) clients.push(await connectClient(app.url, s.sessionToken));
  t.after(() => {
    for (const c of clients) c.close();
  });
  await stateWhere(clients[0], (s) => s.room.members.every((m) => m.online));
  const owner = clients[0];
  assert.deepEqual(await emit(owner, "lobby:import", { link: "x" }), { ok: true });
  assert.deepEqual(
    await emit(owner, "lobby:configure", {
      targetCards: 5,
      contestSeconds: 15,
      guessSeconds: 120,
      maxPlayers: 15,
    }),
    { ok: true },
  );
  return { app, sessions, clients, owner };
}

/** Starts the game and returns the index of the turn player's client. */
async function startGame(owner: Socket, clients: Socket[]) {
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
  const started = await stateWhere(owner, (s) => s.events.some((e) => e.type === "game-started"));
  const turnId = hitlineView(started)?.turnPlayerId;
  return started.room.members.findIndex((m) => m.id === turnId);
}

test("a game survives an API restart and resolves expired deadlines on reconnect", async (t) => {
  const { app, sessions, clients, owner } = await startRoom(t, ["Ana", "Bia"]);
  const turn = await startGame(owner, clients);
  const driver = clients[turn];
  assert.deepEqual(await emit(driver, "game:action", { type: "draw" }), { ok: true });
  assert.deepEqual(
    await emit(driver, "game:action", { type: "lock-guess", slot: 0, title: "x", artist: "y" }),
    { ok: true },
  );
  const open = await stateWhere(owner, (s) => hitlineView(s)?.phase === "contest");
  const deadline = hitlineView(open)?.contestDeadline as number;

  // Crash: Redis goes away first, so no graceful disconnect mutation reaches the room.
  app.store.redis.disconnect();
  for (const c of clients) c.close();
  await app.close();

  const app2 = await startTestServer({ ...withAudio, keepData: true });
  t.after(() => app2.close());
  app2.clock.set(deadline + 1000);
  const back = await connectClient(app2.url, sessions[turn].sessionToken);
  t.after(() => back.close());
  const first = await stateWhere(back, () => true);
  assert.ok(hitlineView(first)?.lastReveal, "the expired contest is resolved on reconnect");
  assert.notEqual(hitlineView(first)?.phase, "contest");
});

test("rehydrate resets ghost presence and arms the game and owner deadlines", async (t) => {
  const { app, sessions, clients, owner } = await startRoom(t, ["Ana", "Bia"]);
  const turn = await startGame(owner, clients);
  assert.equal(turn, 0, "seeded rng gives Ana the first turn");
  await emit(clients[0], "game:action", { type: "draw" });
  app.store.redis.disconnect();
  for (const c of clients) c.close();
  await app.close();

  const app2 = await startTestServer({ ...withAudio, keepData: true });
  t.after(() => app2.close());
  await app2.hub.rehydrate();
  const bia = await connectClient(app2.url, sessions[1].sessionToken);
  t.after(() => bia.close());
  await stateWhere(bia, (s) => s.room.members[1].online);
  const base = app2.clock.now();

  app2.clock.set(base + 31_000);
  await app2.hub.runDueTimers();
  const passed = await app2.store.load(sessions[0].code);
  assert.equal(
    passed?.game?.type === "hitline" && passed.game.state.turn,
    1,
    "ghost-online Ana loses the turn after 30 s",
  );

  app2.clock.set(base + 61_000);
  await app2.hub.runDueTimers();
  const handed = await app2.store.load(sessions[0].code);
  assert.equal(handed?.ownerId, sessions[1].memberId, "ownership moves after 60 s");
});

test("a corrupt room does not stop rehydrate", async (t) => {
  const { app, sessions, clients } = await startRoom(t, ["Ana"]);
  app.store.redis.disconnect();
  for (const c of clients) c.close();
  await app.close();

  const app2 = await startTestServer({ ...withAudio, keepData: true });
  t.after(() => app2.close());
  await app2.store.redis.set("room:ZZZZZ", "{not json");
  await app2.hub.rehydrate();
  const room = await app2.store.load(sessions[0].code);
  assert.equal(room?.members[0].connections, 0);
});

test("kicking the turn player mid-game passes the turn", async (t) => {
  const { sessions, clients, owner } = await startRoom(t, ["Ana", "Bia", "Cid", "Dan", "Eli"]);
  const turn = await startGame(owner, clients);
  assert.notEqual(turn, 0, "seeded rng gives a non-owner the first turn");
  const victim = sessions[turn].memberId;
  assert.deepEqual(await emit(owner, "room:kick", { targetId: victim }), { ok: true });
  const s = await stateWhere(owner, (x) => x.room.members.length === 4);
  assert.ok(s.events.some((e) => e.type === "turn-passed" && e.reason === "removed"));
  assert.notEqual(hitlineView(s)?.turnPlayerId, victim);
  assert.equal(hitlineView(s)?.players.length, 4);
});

test("a member who joins mid-game is a spectator and plays the next game", async (t) => {
  const { app, sessions, clients, owner } = await startRoom(t, ["Ana", "Bia"]);
  await startGame(owner, clients);
  const cid = await joinRoomVia(app, sessions[0].code, "Cid");
  const cidClient = await connectClient(app.url, cid.sessionToken);
  t.after(() => cidClient.close());
  const mid = await stateWhere(owner, (s) => s.room.members.some((m) => m.role === "spectator"));
  assert.equal(mid.room.members.find((m) => m.id === cid.memberId)?.role, "spectator");

  assert.deepEqual(await emit(owner, "game:end"), { ok: true });
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
  const next = await stateWhere(owner, (s) => s.events.some((e) => e.type === "game-started"));
  assert.equal(hitlineView(next)?.players.length, 3);
  assert.equal(next.room.members.find((m) => m.id === cid.memberId)?.role, "player");
});

test("owner ends the game and starts a new one with the same playlist", async (t) => {
  const { clients, owner } = await startRoom(t, ["Ana", "Bia"]);
  await startGame(owner, clients);
  assert.deepEqual(await emit(owner, "game:end"), { ok: true });
  const over = await stateWhere(owner, (s) => hitlineView(s)?.phase === "game-over");
  assert.deepEqual(over.room.lobby.playlist, { source: "playlist", name: "Fake", count: 20 });
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
  const fresh = await stateWhere(
    owner,
    (s) => s.events.some((e) => e.type === "game-started") && hitlineView(s)?.phase !== "game-over",
  );
  assert.equal(hitlineView(fresh)?.players.length, 2);
  assert.deepEqual(fresh.room.lobby.playlist, { source: "playlist", name: "Fake", count: 20 });
});
