import assert from "node:assert/strict";
import { test } from "node:test";
import type { Ack, RoomStatePayload } from "@resenhark/shared";
import type { Socket } from "socket.io-client";
import {
  type TestServer,
  type TestSession,
  connectClient,
  createRoomVia,
  joinRoomVia,
  nextChatMessage,
  startTestServer,
  stateWhere,
} from "../../test/helpers.js";
import type { Card } from "../games/hitline/engine.js";
import type { PlaylistSource } from "../gateways/ports/playlist-source.js";

const emit = (socket: Socket, event: string, ...payload: unknown[]): Promise<Ack> =>
  socket.timeout(2000).emitWithAck(event, ...payload);

const cards = (n: number): Card[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `k${i}`,
    title: `T${i}`,
    artists: ["A"],
    year: 1960 + i,
    isrc: null,
    spotifyUrl: null,
  }));
const playlists = (n: number): PlaylistSource => ({
  load: async () => ({ ok: true, playlist: { name: "Fake", cards: cards(n) } }),
});
const config = (maxPlayers = 15) => ({
  targetCards: 5,
  contestSeconds: 15,
  guessSeconds: 120,
  maxPlayers,
});

async function room(
  t: { after: (fn: () => void | Promise<void>) => void },
  names: string[],
  overrides: Parameters<typeof startTestServer>[0] = { playlists: playlists(20) },
) {
  const app: TestServer = await startTestServer(overrides);
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
const ready = async (owner: Socket, maxPlayers?: number) => {
  assert.deepEqual(await emit(owner, "lobby:import", { link: "x" }), { ok: true });
  assert.deepEqual(await emit(owner, "lobby:configure", config(maxPlayers)), { ok: true });
};

test("owner imports, configures and starts; members get 1 card and 2 tokens", async (t) => {
  const { clients, owner } = await room(t, ["Ana", "Bia"]);
  await ready(owner);
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
  const s = await stateWhere(clients[1], (x) => x.room.game !== null);
  assert.ok(s.events.some((e) => e.type === "game-started"));
  assert.equal(s.room.game?.view.players.length, 2);
  for (const p of s.room.game?.view.players ?? []) {
    assert.equal(p.timeline.length, 1);
    assert.equal(p.tokens, 2);
  }
  assert.deepEqual(s.room.lobby.playlist, { name: "Fake", count: 20 });
});

test("non-owner cannot configure, import or start", async (t) => {
  const { clients, owner } = await room(t, ["Ana", "Bia"]);
  await ready(owner);
  const bia = clients[1];
  const notOwner = { ok: false, error: "not-owner" };
  assert.deepEqual(await emit(bia, "lobby:configure", config()), notOwner);
  assert.deepEqual(await emit(bia, "lobby:import", { link: "x" }), notOwner);
  assert.deepEqual(await emit(bia, "game:start"), notOwner);
  assert.deepEqual(await emit(bia, "game:end"), notOwner);
});

test("invalid configure and import payloads are invalid-input", async (t) => {
  const { owner } = await room(t, ["Ana"]);
  assert.deepEqual(await emit(owner, "lobby:configure", { targetCards: 1 }), {
    ok: false,
    error: "invalid-input",
  });
  assert.deepEqual(await emit(owner, "lobby:import", { link: 3 }), {
    ok: false,
    error: "invalid-input",
  });
});

test("starting without a deck is no-deck", async (t) => {
  const { owner } = await room(t, ["Ana"]);
  assert.deepEqual(await emit(owner, "game:start"), { ok: false, error: "no-deck" });
});

test("import errors from the source are returned", async (t) => {
  const { owner } = await room(t, ["Ana"], {
    playlists: { load: async () => ({ ok: false, error: "playlist-no-access" }) },
  });
  assert.deepEqual(await emit(owner, "lobby:import", { link: "x" }), {
    ok: false,
    error: "playlist-no-access",
  });
});

test("start twice is game-running, configure during a game too, end then restart works", async (t) => {
  const { owner } = await room(t, ["Ana", "Bia"]);
  await ready(owner);
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
  assert.deepEqual(await emit(owner, "game:start"), { ok: false, error: "game-running" });
  assert.deepEqual(await emit(owner, "lobby:configure", config()), {
    ok: false,
    error: "game-running",
  });
  assert.deepEqual(await emit(owner, "game:end"), { ok: true });
  const ended = await stateWhere(owner, (x) => x.room.game?.view.phase === "game-over");
  assert.ok(ended.room.members.every((m) => m.role === "member"));
  assert.deepEqual(await emit(owner, "game:end"), { ok: false, error: "no-game" });
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
});

test("game:reset returns every client to the lobby and keeps the deck", async (t) => {
  const { clients, owner } = await room(t, ["Ana", "Bia"]);
  await ready(owner);
  await emit(owner, "game:start");
  assert.deepEqual(await emit(owner, "game:reset"), { ok: false, error: "no-game" }); // still running
  await emit(owner, "game:end");
  await stateWhere(clients[1], (x) => x.room.game?.view.phase === "game-over");
  assert.deepEqual(await emit(clients[1], "game:reset"), { ok: false, error: "not-owner" });
  assert.deepEqual(await emit(owner, "game:reset"), { ok: true });
  const s = await stateWhere(clients[1], (x) => x.room.game === null);
  assert.ok(s.room.lobby.playlist);
  assert.deepEqual(await emit(owner, "game:reset"), { ok: false, error: "no-game" });
});

test("members beyond maxPlayers become spectators", async (t) => {
  const { clients, owner } = await room(t, ["Ana", "Bia"]);
  await ready(owner, 1);
  await emit(owner, "game:start");
  const s = await stateWhere(clients[1], (x) => x.room.game !== null);
  assert.deepEqual(
    s.room.members.map((m) => m.role),
    ["player", "spectator"],
  );
  assert.deepEqual(await emit(clients[1], "game:action", { type: "draw" }), {
    ok: false,
    error: "not-a-player",
  });
});

test("members have role member when no game is running", async (t) => {
  const { clients } = await room(t, ["Ana", "Bia"]);
  const s = await stateWhere(clients[1], () => true);
  assert.ok(s.room.members.every((m) => m.role === "member"));
});

test("a card without audio is skipped with an audio-missing event", async (t) => {
  let calls = 0;
  const { app, sessions, clients, owner } = await room(t, ["Ana", "Bia"], {
    playlists: playlists(20),
    audio: { findPreviewUrl: async () => (++calls === 1 ? null : "u") },
  });
  await ready(owner);
  await emit(owner, "game:start");
  const started = await stateWhere(owner, (x) => x.room.game !== null);
  const turn = started.room.game?.view.turnPlayerId;
  const driver = clients[turn === started.room.you ? 0 : 1];
  assert.deepEqual(await emit(driver, "game:action", { type: "draw" }), { ok: true });
  const first = await stateWhere(owner, (x) => x.room.game?.view.draw != null);
  const missing = await stateWhere(owner, (x) => x.events.some((e) => e.type === "audio-missing"));
  assert.ok(missing.events.some((e) => e.type === "card-drawn"));
  assert.notEqual(missing.room.game?.view.draw?.id, first.room.game?.view.draw?.id);
  assert.equal(calls, 2);
  assert.match(missing.room.game?.view.draw?.audioUrl ?? "", /^\/audio\/.+\?m=.+&t=.+/);
  const drawId = missing.room.game?.view.draw?.id as string;
  assert.equal(await app.store.roomOfDraw(drawId), sessions[0].code);
});

test("ten consecutive misses are tolerated, the next one ends by deck-empty", async (t) => {
  let lookups = 0;
  const { owner } = await room(t, ["Ana"], {
    playlists: playlists(20),
    audio: {
      findPreviewUrl: async () => {
        lookups++;
        return null;
      },
    },
  });
  await ready(owner);
  await emit(owner, "game:start");
  assert.deepEqual(await emit(owner, "game:action", { type: "draw" }), { ok: true });
  const over = await stateWhere(owner, (x) => x.room.game?.view.phase === "game-over", 4000);
  assert.equal(over.room.game?.view.endReason, "deck-empty");
  assert.equal(over.room.members[0].role, "member");
  assert.equal(lookups, 11);
  for (let i = 0; ; i++) {
    assert.ok(i < 20, "no winner message");
    if ((await nextChatMessage(owner)).text === "Ana venceu") break;
  }
});

test("small playlist sets the warning flag", async (t) => {
  const { owner } = await room(t, ["Ana", "Bia"], { playlists: playlists(3) });
  await emit(owner, "lobby:import", { link: "x" });
  const s = await stateWhere(owner, (x) => x.room.lobby.playlist !== null);
  assert.equal(s.room.lobby.smallPlaylist, true);
});

test("projection to a spectator equals a non-turn player's except for `you`", async (t) => {
  const { clients, owner } = await room(t, ["Ana", "Bia", "Cam"]);
  await ready(owner, 2);
  await emit(owner, "game:start");
  const states: RoomStatePayload[] = [];
  for (const c of clients) states.push(await stateWhere(c, (x) => x.room.game !== null));
  const turn = states[0].room.game?.view.turnPlayerId;
  const other = states.findIndex((s, i) => i < 2 && s.room.you !== turn);
  const spectator = states[2];
  assert.equal(spectator.room.members[2].role, "spectator");
  assert.deepEqual(spectator.room.game, states[other].room.game);
  assert.deepEqual(spectator.room.lobby, states[other].room.lobby);
});

test("a stale missing-preview result after the game ended is ignored", async (t) => {
  let release: (url: string | null) => void = () => {};
  const { app, sessions, owner } = await room(t, ["Ana"], {
    playlists: playlists(20),
    audio: {
      findPreviewUrl: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    },
  });
  await ready(owner);
  await emit(owner, "game:start");
  await emit(owner, "game:action", { type: "draw" });
  await emit(owner, "game:end");
  release(null);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const game = (await app.store.load(sessions[0].code))?.game;
  assert.equal(game?.state.endReason, "ended");
  assert.equal(game?.state.deck.length, 19);
});

test("a draw that cannot be indexed fails the mutation and is not saved", async (t) => {
  const { app, sessions, owner } = await room(t, ["Ana"]);
  await ready(owner);
  await emit(owner, "game:start");
  const store = app.store;
  store.indexDraw = async () => {
    throw new Error("index down");
  };
  assert.deepEqual(await emit(owner, "game:action", { type: "draw" }), {
    ok: false,
    error: "server-error",
  });
  assert.equal((await store.load(sessions[0].code))?.game?.state.draw, null);
});
