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
import type { CatalogCard } from "../games/hitline/catalog.js";
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

const selected = (s: { room: { lobby: { genres: { id: number; selected: boolean }[] } } }) =>
  s.room.lobby.genres.filter((g) => g.selected).map((g) => g.id);

test("a new room plays genres, with no votes and the default decades", async (t) => {
  const { owner } = await room(t, ["Ana"]);
  await emit(owner, "lobby:vote-genres", { genres: [] }); // forces a state to read
  const s = await stateWhere(owner, () => true);
  assert.equal(s.room.lobby.source, "genres");
  assert.equal(s.room.lobby.genreMode, "votes");
  assert.deepEqual(s.room.lobby.myGenres, []);
  assert.deepEqual(
    s.room.lobby.decades.filter((d) => d.selected).map((d) => d.id),
    ["1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"],
  );
  assert.equal(s.room.lobby.decades[0].id, "pre60");
  assert.equal(s.room.lobby.decades[0].label, "Antes dos 60s");
  assert.equal(s.room.lobby.galeraFallback, true);
});

test("every member votes; the view shows counts, not names", async (t) => {
  const { clients } = await room(t, ["Ana", "Bia"]);
  assert.deepEqual(await emit(clients[0], "lobby:vote-genres", { genres: [132, 80] }), {
    ok: true,
  });
  assert.deepEqual(await emit(clients[1], "lobby:vote-genres", { genres: [80, 80] }), {
    ok: true,
  });
  const s = await stateWhere(clients[1], (x) => x.room.lobby.genres.some((g) => g.votes === 2));
  const byId = new Map(s.room.lobby.genres.map((g) => [g.id, g]));
  assert.equal(byId.get(80)?.votes, 2);
  assert.equal(byId.get(132)?.votes, 1);
  assert.deepEqual(s.room.lobby.myGenres, [80]);
  assert.deepEqual(selected(s), [132, 80]);
  assert.equal(s.room.lobby.galeraFallback, false);
  assert.equal(JSON.stringify(s.room.lobby).includes("Ana"), false);
});

test("a member who leaves stops counting; an offline one still counts", async (t) => {
  const { clients } = await room(t, ["Ana", "Bia", "Cau"]);
  await emit(clients[1], "lobby:vote-genres", { genres: [152] });
  await emit(clients[2], "lobby:vote-genres", { genres: [78] });
  clients[2].close(); // offline, still a member
  assert.deepEqual(await emit(clients[1], "room:leave"), { ok: true });
  const s = await stateWhere(clients[0], (x) => x.room.members.length === 2);
  assert.deepEqual(selected(s), [78]);
});

test("the owner overrides the list and can follow the votes again", async (t) => {
  const { clients, owner } = await room(t, ["Ana", "Bia"]);
  await emit(clients[1], "lobby:vote-genres", { genres: [152] });
  assert.deepEqual(await emit(owner, "lobby:set-genres", { genres: [80] }), { ok: true });
  let s = await stateWhere(owner, (x) => x.room.lobby.genreMode === "manual");
  assert.deepEqual(selected(s), [80]);
  assert.deepEqual(await emit(owner, "lobby:follow-votes"), { ok: true });
  s = await stateWhere(owner, (x) => x.room.lobby.genreMode === "votes");
  assert.deepEqual(selected(s), [152]);
});

test("only the owner sets genres, decades and source; bad payloads are invalid-input", async (t) => {
  const { clients } = await room(t, ["Ana", "Bia"]);
  const bia = clients[1];
  const notOwner = { ok: false, error: "not-owner" };
  assert.deepEqual(await emit(bia, "lobby:set-genres", { genres: [80] }), notOwner);
  assert.deepEqual(await emit(bia, "lobby:follow-votes"), notOwner);
  assert.deepEqual(await emit(bia, "lobby:set-decades", { decades: ["1980s"] }), notOwner);
  assert.deepEqual(await emit(bia, "lobby:set-source", { source: "galera" }), notOwner);
  const invalid = { ok: false, error: "invalid-input" };
  assert.deepEqual(await emit(bia, "lobby:vote-genres", { genres: [95] }), invalid);
  assert.deepEqual(await emit(bia, "lobby:vote-genres", "x"), invalid);
  assert.deepEqual(await emit(clients[0], "lobby:set-decades", { decades: [] }), invalid);
  assert.deepEqual(await emit(clients[0], "lobby:set-source", { source: "playlist" }), invalid);
});

test("switching source resets the played songs; changing votes does not", async (t) => {
  const { owner } = await room(t, ["Ana", "Bia"]);
  assert.deepEqual(await emit(owner, "lobby:set-source", { source: "galera" }), { ok: true });
  await emit(owner, "lobby:configure", config());
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
  await emit(owner, "game:end");
  await emit(owner, "game:reset");
  let s = await stateWhere(
    owner,
    (x) => x.room.game === null && x.room.lobby.remaining < x.room.lobby.playlist.count,
  );
  const played = s.room.lobby.playlist.count - s.room.lobby.remaining;
  assert.ok(played > 0);
  await emit(owner, "lobby:vote-genres", { genres: [132] });
  s = await stateWhere(owner, (x) => x.room.lobby.myGenres.length === 1);
  assert.equal(s.room.lobby.playlist.count - s.room.lobby.remaining, played);
  await emit(owner, "lobby:set-source", { source: "genres" });
  await emit(owner, "lobby:set-source", { source: "galera" });
  s = await stateWhere(
    owner,
    (x) =>
      x.room.lobby.source === "galera" && x.room.lobby.remaining === x.room.lobby.playlist.count,
  );
  assert.equal(s.room.lobby.source, "galera");
});

test("lobby:import and lobby:use-default-deck still work and set the source", async (t) => {
  const { owner } = await room(t, ["Ana"]);
  assert.deepEqual(await emit(owner, "lobby:import", { link: "x" }), { ok: true });
  let s = await stateWhere(owner, (x) => x.room.lobby.source === "playlist");
  assert.equal(s.room.lobby.playlist.source, "playlist");
  assert.deepEqual(await emit(owner, "lobby:use-default-deck"), { ok: true });
  s = await stateWhere(owner, (x) => x.room.lobby.source === "galera");
  assert.equal(s.room.lobby.playlist.source, "default");
});

test("votes, decades and source are locked while a game runs", async (t) => {
  const { clients, owner } = await room(t, ["Ana", "Bia"]);
  await emit(owner, "lobby:configure", config());
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
  const running = { ok: false, error: "game-running" };
  assert.deepEqual(await emit(clients[1], "lobby:vote-genres", { genres: [132] }), running);
  assert.deepEqual(await emit(owner, "lobby:set-genres", { genres: [132] }), running);
  assert.deepEqual(await emit(owner, "lobby:follow-votes"), running);
  assert.deepEqual(await emit(owner, "lobby:set-decades", { decades: ["1980s"] }), running);
  assert.deepEqual(await emit(owner, "lobby:set-source", { source: "galera" }), running);
  await emit(owner, "game:end");
  assert.deepEqual(await emit(clients[1], "lobby:vote-genres", { genres: [132] }), { ok: true });
});

// 100 songs in each of three genres, years 1970 to 2019.
const catalog: CatalogCard[] = [132, 80, 152].flatMap((genre, g) =>
  Array.from({ length: 100 }, (_, i) => ({
    id: `cat-${g * 1000 + i}`,
    title: `G${genre}-${i}`,
    artists: ["A"],
    year: 1970 + (i % 50),
    isrc: `ISRC${g * 1000 + i}`,
    spotifyUrl: null,
    deezerId: g * 1000 + i,
    genre,
  })),
);
const withCatalog = (cards: CatalogCard[] = catalog) => ({
  playlists: playlists(20),
  catalog: cards,
});

test("a genre game deals a limited deck split evenly between the chosen genres", async (t) => {
  const { owner, clients } = await room(t, ["Ana", "Bia"], withCatalog());
  await emit(owner, "lobby:configure", config()); // 2 players, 5 to win: deck of 60
  await emit(clients[1], "lobby:vote-genres", { genres: [132, 80] });
  await stateWhere(owner, (x) => x.room.lobby.genres.filter((g) => g.selected).length === 2);
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
  const s = await stateWhere(owner, (x) => x.room.game !== null);
  const view = hitlineView(s);
  const dealt = (view?.players ?? []).flatMap((p) => p.timeline);
  assert.equal((view?.deckCount ?? 0) + dealt.length, 60);
  for (const c of dealt) assert.match(c.title, /^G(132|80)-/);
});

test("with no genre chosen the game plays the Baralho da galera", async (t) => {
  const { owner } = await room(t, ["Ana", "Bia"], withCatalog());
  await emit(owner, "lobby:configure", config());
  assert.deepEqual(await emit(owner, "game:start"), { ok: true });
  const s = await stateWhere(owner, (x) => x.room.game !== null);
  assert.equal(s.room.lobby.galeraFallback, true);
  assert.equal(s.room.lobby.available, DEFAULT_DECK.cards.length);
  const titles = new Set(DEFAULT_DECK.cards.map((c) => c.title));
  for (const p of hitlineView(s)?.players ?? []) assert.ok(titles.has(p.timeline[0].title));
});

test("after a genre game only the cards that left the pile count as played", async (t) => {
  const { owner, clients } = await room(t, ["Ana", "Bia"], withCatalog());
  await emit(owner, "lobby:configure", config());
  await emit(clients[1], "lobby:vote-genres", { genres: [132, 80] });
  await stateWhere(owner, (x) => x.room.lobby.available === 200);
  await emit(owner, "game:start");
  await emit(owner, "game:end");
  await emit(owner, "game:start"); // straight from the finished game: folds what was dealt
  // The first game dealt one card to each of the 2 players and drew none.
  const s = await stateWhere(
    owner,
    (x) => x.room.game?.type === "hitline" && x.room.lobby.available < 200,
  );
  assert.equal(s.room.lobby.available, 198);
});

test("genre counts reflect the catalog and the songs already played", async (t) => {
  const { owner } = await room(t, ["Ana"], withCatalog());
  await emit(owner, "lobby:vote-genres", { genres: [] }); // forces a state to read
  const s = await stateWhere(owner, () => true);
  const byId = new Map(s.room.lobby.genres.map((g) => [g.id, g.available]));
  assert.equal(byId.get(132), 100);
  assert.equal(byId.get(80), 100);
  assert.equal(byId.get(173), 0);
});

test("a genre pool too small for the players blocks the start", async (t) => {
  const tiny = catalog.filter((c) => c.genre === 152).slice(0, 2);
  const { owner, clients } = await room(t, ["Ana", "Bia"], withCatalog(tiny));
  await emit(clients[1], "lobby:vote-genres", { genres: [152] });
  await stateWhere(owner, (x) => x.room.lobby.galeraFallback === false);
  assert.deepEqual(await emit(owner, "game:start"), { ok: false, error: "playlist-empty" });
  await emit(owner, "lobby:vote-genres", { genres: [152] }); // forces a state to read
  const s = await stateWhere(owner, (x) => x.room.lobby.available === 2);
  assert.equal(s.room.lobby.smallPlaylist, true);
});

test("the decade filter applies to the genre catalog", async (t) => {
  const { owner, clients } = await room(t, ["Ana", "Bia"], withCatalog());
  await emit(clients[1], "lobby:vote-genres", { genres: [132] });
  assert.deepEqual(await emit(owner, "lobby:set-decades", { decades: ["1980s"] }), { ok: true });
  const s = await stateWhere(
    owner,
    (x) => x.room.lobby.decades.filter((d) => d.selected).length === 1,
  );
  // Years are 1970 + (i % 50), so 20 of each genre's 100 songs fall in one decade.
  assert.equal(s.room.lobby.available, 20);
  assert.equal(new Map(s.room.lobby.genres.map((g) => [g.id, g.available])).get(132), 20);
  // Decade counts ignore the decade filter itself: they show what each decade holds.
  assert.equal(new Map(s.room.lobby.decades.map((d) => [d.id, d.available])).get("1970s"), 20);
});

test("the decade filter applies to the Baralho da galera and to an imported playlist", async (t) => {
  const { owner } = await room(t, ["Ana"], withCatalog());
  await emit(owner, "lobby:set-source", { source: "galera" });
  await emit(owner, "lobby:set-decades", { decades: ["1990s"] });
  const nineties = DEFAULT_DECK.cards.filter((c) => c.year >= 1990 && c.year < 2000).length;
  await stateWhere(
    owner,
    (x) => x.room.lobby.source === "galera" && x.room.lobby.available === nineties,
  );
  await emit(owner, "lobby:import", { link: "x" }); // the fake playlist spans 1960 to 1979
  await emit(owner, "lobby:set-decades", { decades: ["1970s"] });
  await stateWhere(
    owner,
    (x) => x.room.lobby.source === "playlist" && x.room.lobby.available === 10,
  );
});

test("a decade filter that empties the pool blocks the start", async (t) => {
  const { owner, clients } = await room(t, ["Ana", "Bia"], withCatalog());
  await emit(clients[1], "lobby:vote-genres", { genres: [132] });
  await emit(owner, "lobby:set-decades", { decades: ["pre60"] });
  await stateWhere(
    owner,
    (x) => x.room.lobby.available === 0 && x.room.lobby.galeraFallback === false,
  );
  assert.deepEqual(await emit(owner, "game:start"), { ok: false, error: "playlist-empty" });
});
