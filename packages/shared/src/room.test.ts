import assert from "node:assert/strict";
import { test } from "node:test";
import { ROOM_CODE_ALPHABET, avatarSchema, joinRoomInputSchema, normalizeName, roomCodeSchema } from "./room.js";

test("room code alphabet has no ambiguous letters", () => {
  for (const letter of ["O", "I", "L"]) assert.equal(ROOM_CODE_ALPHABET.includes(letter), false);
  assert.equal(ROOM_CODE_ALPHABET.length, 23);
});

test("room code schema accepts 5 alphabet letters and uppercases input", () => {
  assert.equal(roomCodeSchema.parse("kxpmr"), "KXPMR");
  assert.equal(roomCodeSchema.safeParse("KXPM").success, false);
  assert.equal(roomCodeSchema.safeParse("KXPMO").success, false);
});

test("normalizeName ignores case, accents and surrounding spaces", () => {
  assert.equal(normalizeName("  Kaíser "), normalizeName("kaiser"));
});

test("join input trims the name and limits it to 20 characters", () => {
  assert.equal(joinRoomInputSchema.parse({ name: "  Ana ", avatar: { hue: 275, shape: "organic" } }).name, "Ana");
  assert.equal(joinRoomInputSchema.safeParse({ name: "x".repeat(21), avatar: { hue: 275, shape: "organic" } }).success, false);
  assert.equal(joinRoomInputSchema.safeParse({ name: "   ", avatar: { hue: 275, shape: "organic" } }).success, false);
});

test("avatar accepts only known shapes and hues in 0..359", () => {
  assert.equal(avatarSchema.safeParse({ hue: 360, shape: "organic" }).success, false);
  assert.equal(avatarSchema.safeParse({ hue: 10, shape: "star" }).success, false);
});
