import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_HITLINE_CONFIG } from "@resenhark/shared";
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
    config: DEFAULT_HITLINE_CONFIG,
    playlist: null,
    smallPlaylist: false,
  });
  assert.equal(view.game, null);
});
