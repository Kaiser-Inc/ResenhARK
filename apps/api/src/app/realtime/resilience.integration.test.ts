import assert from "node:assert/strict";
import { test } from "node:test";
import type { Ack } from "@resenhark/shared";
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
  const turnId = started.room.game?.view.turnPlayerId;
  return clients.findIndex((_, i) => i >= 0 && turnId !== undefined && turnId === idOf(i));
  function idOf(i: number) {
    return started.room.members[i].id;
  }
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
  const open = await stateWhere(owner, (s) => s.room.game?.view.phase === "contest");
  const deadline = open.room.game?.view.contestDeadline as number;

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
  assert.ok(first.room.game?.view.lastReveal, "the expired contest is resolved on reconnect");
  assert.notEqual(first.room.game?.view.phase, "contest");
});

test("rehydrate schedules timers for rooms with pending deadlines", async (t) => {
  const { app, sessions, clients, owner } = await startRoom(t, ["Ana", "Bia"]);
  const turn = await startGame(owner, clients);
  await emit(clients[turn], "game:action", { type: "draw" });
  await emit(clients[turn], "game:action", {
    type: "lock-guess",
    slot: 0,
    title: "x",
    artist: "y",
  });
  const open = await stateWhere(owner, (s) => s.room.game?.view.phase === "contest");
  const deadline = open.room.game?.view.contestDeadline as number;
  app.store.redis.disconnect();
  for (const c of clients) c.close();
  await app.close();

  const app2 = await startTestServer({ ...withAudio, keepData: true });
  t.after(() => app2.close());
  app2.clock.set(deadline + 1000);
  await app2.hub.runDueTimers();
  const before = await app2.store.load(sessions[0].code);
  assert.equal(before?.game?.state.phase, "contest", "nothing is scheduled before rehydrate");

  await app2.hub.rehydrate();
  await app2.hub.runDueTimers();
  const after = await app2.store.load(sessions[0].code);
  assert.ok(after?.game?.state.lastReveal);
});

test("kicking the turn player mid-game passes the turn", async (t) => {
  const { sessions, clients, owner } = await startRoom(t, ["Ana", "Bia", "Cid"]);
  let turn = await startGame(owner, clients);
  // The owner cannot kick themselves: restart until someone else holds the turn.
  for (let i = 0; turn === 0 && i < 20; i++) {
    assert.deepEqual(await emit(owner, "game:end"), { ok: true });
    turn = await startGame(owner, clients);
  }
  assert.notEqual(turn, 0);
  const victim = sessions[turn].memberId;
  assert.deepEqual(await emit(owner, "room:kick", { targetId: victim }), { ok: true });
  const s = await stateWhere(owner, (x) => x.room.members.length === 2);
  assert.ok(s.events.some((e) => e.type === "turn-passed" && e.reason === "removed"));
  assert.notEqual(s.room.game?.view.turnPlayerId, victim);
  assert.equal(s.room.game?.view.players.length, 2);
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
  assert.equal(next.room.game?.view.players.length, 3);
  assert.equal(next.room.members.find((m) => m.id === cid.memberId)?.role, "player");
});

test("owner ends the game and starts a new one with the same playlist", async (t) => {
  const { clients, owner } = await startRoom(t, ["Ana", "Bia"]);
  await startGame(owner, clients);
  assert.deepEqual(await emit(owner, "game:end"), { ok: true });
  const over = await stateWhere(owner, (s) => s.room.game?.view.phase === "game-over");
  assert.deepEqual(over.room.lobby.playlist, { name: "Fake", count: 20 });
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
  const fresh = await stateWhere(
    owner,
    (s) =>
      s.events.some((e) => e.type === "game-started") && s.room.game?.view.phase !== "game-over",
  );
  assert.equal(fresh.room.game?.view.players.length, 2);
  assert.deepEqual(fresh.room.lobby.playlist, { name: "Fake", count: 20 });
});
