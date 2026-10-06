import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_HITLINE_CONFIG, DEFAULT_HUEHINT_CONFIG } from "@resenhark/shared";
import { type Member, createRoom } from "../domain/room/room.js";
import { projectRoom } from "./project-room.js";

const avatar = { hue: 12, shape: "cloud" } as const;
const member = (id: string, connections: number): Member => ({
  id,
  name: id,
  avatar,
  joinedAt: 0,
  connections,
  offlineSince: null,
  greeted: false,
});

test("projectRoom shows presence and ownership from the viewer's side", () => {
  const room = createRoom("ABCDE", member("ana", 1), 0);
  room.members.push(member("bia", 0));
  const view = projectRoom(room, "bia", 42);
  assert.equal(view.you, "bia");
  assert.equal(view.serverNow, 42);
  assert.deepEqual(
    view.members.map((m) => [m.id, m.online, m.isOwner, m.role]),
    [
      ["ana", true, true, "member"],
      ["bia", false, false, "member"],
    ],
  );
  assert.deepEqual(view.lobby, {
    selectedGame: "hitline",
    config: DEFAULT_HITLINE_CONFIG,
    huehintConfig: DEFAULT_HUEHINT_CONFIG,
    playlist: null,
    remaining: null,
    smallPlaylist: false,
  });
  assert.equal(view.game, null);
});

test("projectRoom counts remaining songs and sizes the small-playlist warning against them", () => {
  const card = (i: number) => ({
    id: `c${i}`,
    title: `T${i}`,
    artists: ["A"],
    year: 1990,
    isrc: null,
    spotifyUrl: null,
  });
  const room = createRoom("ABCDE", member("ana", 1), 0);
  room.lobby = {
    ...room.lobby,
    config: { ...DEFAULT_HITLINE_CONFIG, targetCards: 5 },
    deck: { name: "P", cards: Array.from({ length: 12 }, (_, i) => card(i)) },
  };
  // 1 online player, N=5: warns below 10 songs.
  assert.equal(projectRoom(room, "ana", 0).lobby.smallPlaylist, false);
  room.lobby.played = ["t0|a", "t1|a", "t2|a"];
  const view = projectRoom(room, "ana", 0).lobby;
  assert.equal(view.playlist?.count, 12);
  assert.equal(view.remaining, 9);
  assert.equal(view.smallPlaylist, true);
});
