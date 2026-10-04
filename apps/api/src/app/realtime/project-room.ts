import type { RoomView } from "@resenhark/shared";
import { type Room, isOnline } from "../domain/room/room.js";

/** What `viewerId` is allowed to see of the room. Never add hidden game data here. */
export function projectRoom(room: Room, viewerId: string, now: number): RoomView {
  return {
    code: room.code,
    you: viewerId,
    ownerId: room.ownerId,
    members: room.members.map((member) => ({
      id: member.id,
      name: member.name,
      avatar: member.avatar,
      online: isOnline(member),
      isOwner: member.id === room.ownerId,
      role: "member",
    })),
    lobby: null,
    game: null,
    serverNow: now,
  };
}
