import assert from "node:assert/strict";
import { test } from "node:test";
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
  assert.equal(view.lobby, null);
  assert.equal(view.game, null);
});
