import assert from "node:assert/strict";
import { test } from "node:test";
import { seededRng } from "../../core/seeded-rng.js";
import { DEFAULT_DECK } from "../../games/hitline/default-deck.js";
import { create as createHitline } from "../../games/hitline/engine.js";
import { create as createTaleclue } from "../../games/taleclue/engine.js";
import { cfg, ctxAt, syntheticDeck } from "../../games/taleclue/test-helpers.js";
import {
  MAX_COLORS,
  MAX_MEMBERS,
  type Member,
  type Room,
  addMember,
  createRoom,
  foldColors,
  foldPlayed,
  foldTaleclueUsed,
  generateRoomCode,
  kick,
  leave,
  playedKey,
  roomDeadline,
  tickRoom,
  transferOwnershipIfAway,
} from "./room.js";

const member = (id: string, name = id): Member => ({
  id,
  name,
  avatar: { hue: 275, shape: "organic" },
  joinedAt: 0,
  connections: 0,
  offlineSince: null,
  greeted: false,
});

test("generateRoomCode returns 5 letters from the alphabet", () => {
  let i = 0;
  const code = generateRoomCode(() => (i++ % 23) / 23);
  assert.match(code, /^[A-HJKMNP-Z]{5}$/);
});

test("createRoom makes the creator the owner and only member", () => {
  const room = createRoom("KXPMR", member("a"), 100);
  assert.equal(room.ownerId, "a");
  assert.deepEqual(
    room.members.map((m) => m.id),
    ["a"],
  );
  assert.equal(room.lastActivityAt, 100);
});

test("addMember rejects a name that differs only by case or accent", () => {
  const room = createRoom("KXPMR", member("a", "Kaíser"), 0);
  assert.deepEqual(addMember(room, member("b", "KAISER"), 1), { ok: false, error: "name-taken" });
});

test("addMember rejects the 21st member", () => {
  let room = createRoom("KXPMR", member("m0"), 0);
  for (let i = 1; i < MAX_MEMBERS; i++) {
    const result = addMember(room, member(`m${i}`), i);
    assert.ok(result.ok);
    room = result.room;
  }
  assert.deepEqual(addMember(room, member("extra"), 99), { ok: false, error: "room-full" });
});

const roomOf = (ownerId: string, members: Member[]): Room => ({
  ...createRoom("KXPMR", members[0], 0),
  ownerId,
  members,
});

const online = (id: string, joinedAt: number): Member => ({
  ...member(id),
  joinedAt,
  connections: 1,
});

const offlineOwner = (id: string, offlineSince: number): Member => ({
  ...member(id),
  offlineSince,
});

test("owner offline for 60s hands ownership to the earliest online member", () => {
  const room = roomOf("a", [offlineOwner("a", 0), online("c", 2), online("b", 1)]);
  const result = transferOwnershipIfAway(room, 60_000);
  assert.equal(result.newOwnerId, "b");
  assert.equal(result.room.ownerId, "b");
});

test("owner offline for 59s keeps ownership", () => {
  const room = roomOf("a", [offlineOwner("a", 0), online("b", 1)]);
  const result = transferOwnershipIfAway(room, 59_999);
  assert.equal(result.newOwnerId, null);
  assert.equal(result.room.ownerId, "a");
});

test("owner offline with nobody online keeps ownership and has no deadline", () => {
  const room = roomOf("a", [offlineOwner("a", 0), member("b")]);
  assert.equal(transferOwnershipIfAway(room, 120_000).newOwnerId, null);
  assert.equal(roomDeadline(room), null);
});

test("roomDeadline is the owner's offlineSince plus 60s when someone can take over", () => {
  const room = roomOf("a", [offlineOwner("a", 5_000), online("b", 1)]);
  assert.equal(roomDeadline(room), 65_000);
  assert.equal(roomDeadline(roomOf("a", [online("a", 0), online("b", 1)])), null);
});

test("tickRoom announces the new owner", () => {
  const room = roomOf("a", [
    { ...offlineOwner("a", 0), name: "Ana" },
    { ...online("b", 1), name: "Bia" },
  ]);
  const result = tickRoom(room, 60_000);
  assert.equal(result.room.ownerId, "b");
  assert.deepEqual(result.system, ["Bia agora é o dono da sala"]);
  assert.deepEqual(tickRoom(room, 1).system, []);
});

test("owner kicking themselves is invalid-target", () => {
  const room = roomOf("a", [member("a"), member("b")]);
  assert.deepEqual(kick(room, "a", "a"), { ok: false, error: "invalid-target" });
  assert.deepEqual(kick(room, "a", "ghost"), { ok: false, error: "invalid-target" });
});

test("non-owner cannot kick", () => {
  const room = roomOf("a", [member("a"), member("b"), member("c")]);
  assert.deepEqual(kick(room, "b", "c"), { ok: false, error: "not-owner" });
});

test("kick removes the target from the room", () => {
  const room = roomOf("a", [member("a"), member("b")]);
  const result = kick(room, "a", "b");
  assert.ok(result.ok);
  assert.deepEqual(
    result.room.members.map((m) => m.id),
    ["a"],
  );
});

test("owner leaving hands ownership to the next online member by joinedAt", () => {
  const room = roomOf("a", [
    { ...online("a", 0) },
    { ...member("b"), joinedAt: 1 },
    online("c", 2),
  ]);
  const left = leave(room, "a");
  assert.equal(left.ownerId, "c");
  assert.deepEqual(
    left.members.map((m) => m.id),
    ["b", "c"],
  );
});

test("owner leaving with nobody online hands ownership to the next by joinedAt", () => {
  const room = roomOf("a", [
    member("a"),
    { ...member("c"), joinedAt: 2 },
    { ...member("b"), joinedAt: 1 },
  ]);
  assert.equal(leave(room, "a").ownerId, "b");
});

test("a non-owner leaving keeps the owner", () => {
  const room = roomOf("a", [member("a"), member("b")]);
  assert.equal(leave(room, "b").ownerId, "a");
});

const colorsOf = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ h: (from + i) % 360, s: 50, b: 50 }));

test("a new room remembers no colors", () => {
  assert.deepEqual(createRoom("KXPMR", member("a"), 0).lobby.colors, []);
});

test("foldColors appends a game's colors and keeps only the newest MAX_COLORS", () => {
  const room = createRoom("KXPMR", member("a"), 0);
  const once = foldColors(room, colorsOf(4));
  assert.deepEqual(once.lobby.colors, colorsOf(4));
  const full = foldColors(once, colorsOf(MAX_COLORS, 100));
  assert.equal(full.lobby.colors.length, MAX_COLORS);
  assert.deepEqual(full.lobby.colors, colorsOf(MAX_COLORS, 100));
});

test("foldColors treats a room saved before the color memory as empty", () => {
  const room = createRoom("KXPMR", member("a"), 0);
  const old = { ...room, lobby: { ...room.lobby, colors: undefined } } as unknown as Room;
  assert.deepEqual(foldColors(old, colorsOf(2)).lobby.colors, colorsOf(2));
});

test("foldTaleclueUsed adds a finished game's dealt cards once and is idempotent", () => {
  const base = createRoom("KXPMR", member("a"), 0);
  const started = createTaleclue(cfg, ["a", "b", "c", "d"], syntheticDeck(40), ctxAt(0));
  const room: Room = {
    ...base,
    lobby: { ...base.lobby, taleclueUsed: ["old", started.state.used[0]] },
    game: { type: "taleclue", state: started.state, playerIds: ["a", "b", "c", "d"] },
  };
  const folded = foldTaleclueUsed(room);
  assert.equal(folded.lobby.taleclueUsed.length, 1 + started.state.used.length);
  assert.ok(folded.lobby.taleclueUsed.includes("old"));
  assert.deepEqual(foldTaleclueUsed(folded), folded);
});

test("foldTaleclueUsed ignores rooms without a Taleclue game", () => {
  const room = createRoom("KXPMR", member("a"), 0);
  assert.equal(foldTaleclueUsed(room), room);
});

test("foldPlayed with startKeys counts only the cards that left the pile, not the rest of the catalog", () => {
  const cards = Array.from({ length: 5 }, (_, i) => ({
    id: `cat-${i}`,
    title: `T${i}`,
    artists: ["A"],
    year: 1990,
    isrc: `ISRC${i}`,
    spotifyUrl: null,
  }));
  const dealt = cards.slice(0, 4);
  const started = createHitline(
    { targetCards: 5, contestSeconds: 15, guessSeconds: 120, maxPlayers: 15 },
    ["a", "b"],
    dealt,
    { now: 0, rng: seededRng(1), newId: () => "id" },
  );
  const room = createRoom("KXPMR", member("a"), 0);
  room.game = {
    type: "hitline",
    state: started.state,
    playerIds: ["a", "b"],
    startKeys: dealt.map(playedKey),
  };
  const folded = foldPlayed(room);
  // 2 players took one card each; the other 2 are still in the pile, and cat-4 was never in the game.
  assert.equal(folded.lobby.played.length, 2);
  assert.ok(!folded.lobby.played.includes(playedKey(cards[4])));
  assert.deepEqual(foldPlayed(folded).lobby.played, folded.lobby.played);
});

test("a game saved with position-based default ids still folds only the cards it dealt", () => {
  // Before the Baralho da galera used Deezer ids, cards were `default-{position}`.
  const legacy = DEFAULT_DECK.cards.map((card, i) => ({ ...card, id: `default-${i}` }));
  const started = createHitline(
    { targetCards: 5, contestSeconds: 15, guessSeconds: 120, maxPlayers: 15 },
    ["a", "b"],
    legacy,
    { now: 0, rng: seededRng(1), newId: () => "id" },
  );
  const room = createRoom("KXPMR", member("a"), 0);
  room.lobby.source = "galera";
  room.game = { type: "hitline", state: started.state, playerIds: ["a", "b"] };
  assert.equal(foldPlayed(room).lobby.played.length, 2);
});
