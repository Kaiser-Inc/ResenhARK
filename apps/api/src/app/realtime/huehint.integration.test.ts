import assert from "node:assert/strict";
import { test } from "node:test";
import { type Ack, DEFAULT_HUEHINT_CONFIG } from "@resenhark/shared";
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
