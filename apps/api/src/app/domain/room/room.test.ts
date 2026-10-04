import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_MEMBERS, type Member, addMember, createRoom, generateRoomCode } from "./room.js";

const member = (id: string, name = id): Member => ({
  id,
  name,
  avatar: { hue: 275, shape: "organic" },
  joinedAt: 0,
  connections: 0,
  offlineSince: null,
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
