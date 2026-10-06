import assert from "node:assert/strict";
import { test } from "node:test";
import type { Ack, RoomStatePayload } from "@resenhark/shared";
import type { Socket } from "socket.io-client";
import {
  type TestServer,
  type TestSession,
  connectClient,
  createRoomVia,
  hitlineView,
  joinRoomVia,
  nextChatMessage,
  startTestServer,
  stateWhere,
} from "../../test/helpers.js";
import { DEFAULT_DECK } from "../games/hitline/default-deck.js";
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
  assert.equal(hitlineView(s)?.players.length, 2);
  for (const p of hitlineView(s)?.players ?? []) {
    assert.equal(p.timeline.length, 1);
    assert.equal(p.tokens, 2);
  }
  assert.deepEqual(s.room.lobby.playlist, { source: "playlist", name: "Fake", count: 20 });
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

test("without an import the room plays the default deck and counts its songs as played", async (t) => {
  const { clients, owner } = await room(t, ["Ana", "Bia"]);
  const count = DEFAULT_DECK.cards.length;
  const lobby = await stateWhere(clients[1], (x) => x.room.lobby.remaining === count);
  assert.deepEqual(lobby.room.lobby.playlist, {
    source: "default",
    name: "Baralho ResenhARK",
    count,
  });
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
  const first = titles(await stateWhere(clients[1], (x) => x.room.game !== null));
  const songs = DEFAULT_DECK.cards.map((c) => c.title);
  for (const title of first) assert.ok(songs.includes(title), `${title} not in the default deck`);
  const after = await finishRound(owner, clients[1]);
  assert.equal(after.room.lobby.remaining, count - 2);
  assert.deepEqual(await emit(owner, "lobby:reset-played"), { ok: true });
  await stateWhere(clients[1], (x) => x.room.lobby.remaining === count);
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

test("each playlist error reaches the owner as a distinct ack", async (t) => {
  const errors = [
    "spotify-disconnected",
    "playlist-invalid-link",
    "playlist-no-access",
    "playlist-empty",
  ] as const;
  let i = 0;
  const { owner } = await room(t, ["Ana"], {
    playlists: { load: async () => ({ ok: false, error: errors[i++] }) },
  });
  for (const error of errors)
    assert.deepEqual(await emit(owner, "lobby:import", { link: "x" }), { ok: false, error });
});

test("a failed or throwing import keeps the previous deck", async (t) => {
  let mode: "ok" | "error" | "throw" = "ok";
  const { owner } = await room(t, ["Ana"], {
    playlists: {
      load: async () => {
        if (mode === "throw") throw new Error("boom");
        if (mode === "error") return { ok: false, error: "playlist-no-access" };
        return { ok: true, playlist: { name: "Fake", cards: cards(20) } };
      },
    },
  });
  assert.deepEqual(await emit(owner, "lobby:import", { link: "x" }), { ok: true });
  mode = "error";
  assert.deepEqual(await emit(owner, "lobby:import", { link: "x" }), {
    ok: false,
    error: "playlist-no-access",
  });
  mode = "throw";
  assert.deepEqual(await emit(owner, "lobby:import", { link: "x" }), {
    ok: false,
    error: "server-error",
  });
  const s = await stateWhere(owner, () => true);
  assert.deepEqual(s.room.lobby.playlist, { source: "playlist", name: "Fake", count: 20 });
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
  const ended = await stateWhere(owner, (x) => hitlineView(x)?.phase === "game-over");
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
  await stateWhere(clients[1], (x) => hitlineView(x)?.phase === "game-over");
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
  const turn = hitlineView(started)?.turnPlayerId;
  const driver = clients[turn === started.room.you ? 0 : 1];
  assert.deepEqual(await emit(driver, "game:action", { type: "draw" }), { ok: true });
  const first = await stateWhere(owner, (x) => hitlineView(x)?.draw != null);
  const missing = await stateWhere(owner, (x) => x.events.some((e) => e.type === "audio-missing"));
  assert.ok(missing.events.some((e) => e.type === "card-drawn"));
  assert.notEqual(hitlineView(missing)?.draw?.id, hitlineView(first)?.draw?.id);
  assert.equal(calls, 2);
  assert.match(hitlineView(missing)?.draw?.audioUrl ?? "", /^\/audio\/.+\?m=.+&t=.+/);
  const drawId = hitlineView(missing)?.draw?.id as string;
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
  const over = await stateWhere(owner, (x) => hitlineView(x)?.phase === "game-over", 4000);
  assert.equal(hitlineView(over)?.endReason, "deck-empty");
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
  const turn = hitlineView(states[0])?.turnPlayerId;
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
  assert.equal(game?.type === "hitline" && game.state.deck.length, 18); // 1 dealt + the drawn card, which was heard
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
  const loaded = (await store.load(sessions[0].code))?.game;
  assert.equal(loaded?.type === "hitline" ? loaded.state.draw : "not hitline", null);
});

const titles = (s: RoomStatePayload) =>
  (hitlineView(s)?.players ?? []).flatMap((p) => p.timeline.map((c) => c.title));

async function finishRound(owner: Socket, watcher: Socket) {
  assert.deepEqual(await emit(owner, "game:end"), { ok: true });
  await stateWhere(watcher, (x) => hitlineView(x)?.phase === "game-over");
  assert.deepEqual(await emit(owner, "game:reset"), { ok: true });
  return stateWhere(watcher, (x) => x.room.game === null);
}

test("another round never deals a song already played in the room", async (t) => {
  const { clients, owner } = await room(t, ["Ana", "Bia"], { playlists: playlists(8) });
  await ready(owner);
  await emit(owner, "game:start");
  const first = titles(await stateWhere(clients[1], (x) => x.room.game !== null));
  assert.equal(first.length, 2);
  const lobby = await finishRound(owner, clients[1]);
  assert.equal(lobby.room.lobby.remaining, 6);
  assert.equal(lobby.room.lobby.playlist?.count, 8);
  await emit(owner, "game:start");
  const second = await stateWhere(clients[1], (x) => x.room.game !== null);
  assert.equal(hitlineView(second)?.deckCount, 4);
  for (const title of titles(second)) assert.ok(!first.includes(title), `${title} repeated`);
});

test("starting straight from a finished game also counts its songs as played", async (t) => {
  const { clients, owner } = await room(t, ["Ana", "Bia"], { playlists: playlists(8) });
  await ready(owner);
  await emit(owner, "game:start");
  await emit(owner, "game:end");
  await stateWhere(clients[1], (x) => hitlineView(x)?.phase === "game-over");
  await emit(owner, "game:start");
  const s = await stateWhere(clients[1], (x) => hitlineView(x)?.phase === "turn-start");
  assert.equal(hitlineView(s)?.deckCount, 4);
});

test("importing a playlist resets the played songs", async (t) => {
  const { clients, owner } = await room(t, ["Ana", "Bia"], { playlists: playlists(8) });
  await ready(owner);
  await emit(owner, "game:start");
  await finishRound(owner, clients[1]);
  assert.deepEqual(await emit(owner, "lobby:import", { link: "x" }), { ok: true });
  const s = await stateWhere(clients[1], (x) => x.room.lobby.remaining === 8);
  assert.equal(s.room.lobby.playlist?.count, 8);
});

test("lobby:reset-played is owner-only, blocked mid-game, and restores every song", async (t) => {
  const { clients, owner } = await room(t, ["Ana", "Bia"], { playlists: playlists(8) });
  await ready(owner);
  await emit(owner, "game:start");
  assert.deepEqual(await emit(owner, "lobby:reset-played"), { ok: false, error: "game-running" });
  await finishRound(owner, clients[1]);
  assert.deepEqual(await emit(clients[1], "lobby:reset-played"), { ok: false, error: "not-owner" });
  assert.deepEqual(await emit(owner, "lobby:reset-played"), { ok: true });
  const s = await stateWhere(clients[1], (x) => x.room.lobby.remaining === 8);
  assert.equal(s.room.lobby.remaining, 8);
});

test("game:start with nothing left to draw points to Recomeçar músicas", async (t) => {
  const { app, sessions, clients, owner } = await room(t, ["Ana", "Bia"], {
    playlists: playlists(8),
  });
  await ready(owner);
  await emit(owner, "game:start");
  await finishRound(owner, clients[1]);
  const stored = await app.store.load(sessions[0].code);
  assert.ok(stored);
  await app.store.save({
    ...stored,
    lobby: { ...stored.lobby, played: cards(8).map((c) => `${c.title.toLowerCase()}|a`) },
  });
  assert.deepEqual(await emit(owner, "game:start"), { ok: false, error: "playlist-exhausted" });
  assert.deepEqual(await emit(owner, "lobby:reset-played"), { ok: true });
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
});

test("a room stored before the played list existed still reports playlist-empty", async (t) => {
  const { app, sessions, owner } = await room(t, ["Ana", "Bia"], { playlists: playlists(2) });
  await ready(owner);
  const stored = await app.store.load(sessions[0].code);
  assert.ok(stored);
  const { played: _played, ...legacyLobby } = stored.lobby;
  await app.store.save({ ...stored, lobby: legacyLobby as typeof stored.lobby });
  assert.deepEqual(await emit(owner, "game:start"), { ok: false, error: "playlist-empty" });
});

test("a drawn card counts as played even when the owner ends before the reveal", async (t) => {
  const { clients, owner } = await room(t, ["Ana", "Bia"], {
    playlists: playlists(8),
    audio: { findPreviewUrl: async () => "preview" },
  });
  await ready(owner);
  await emit(owner, "game:start");
  const started = await stateWhere(clients[1], (x) => x.room.game !== null);
  const turn = hitlineView(started)?.turnPlayerId;
  const turnClient = clients[started.room.members.findIndex((m) => m.id === turn)];
  assert.deepEqual(await emit(turnClient, "game:action", { type: "draw" }), { ok: true });
  await stateWhere(clients[1], (x) => hitlineView(x)?.phase === "guessing");
  const lobby = await finishRound(owner, clients[1]);
  assert.equal(lobby.room.lobby.remaining, 5); // 2 dealt + 1 drawn
});
