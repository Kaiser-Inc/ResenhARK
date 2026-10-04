import type { Ack } from "@resenhark/shared";
import type { Server } from "socket.io";
import type { Room } from "../domain/room/room.js";
import type { RoomStore } from "../repositories/room-store.js";
import { type MutationResult, type RoomHub, socketRoom } from "./room-hub.js";

type SocketData = { code: string; memberId: string };

export function registerSocketGateway(
  io: Server,
  deps: { store: RoomStore; hub: RoomHub; now: () => number; onError: (err: unknown) => void },
): void {
  const { store, hub, now, onError } = deps;

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.sessionToken;
    try {
      const session = typeof token === "string" ? await store.resolveSession(token) : null;
      if (!session) return next(new Error("invalid-session"));
      socket.data = { code: session.code, memberId: session.memberId } satisfies SocketData;
      next();
    } catch (err) {
      onError(err);
      next(new Error("internal-error"));
    }
  });

  const adjustConnections =
    (memberId: string, delta: 1 | -1) =>
    (room: Room): MutationResult => {
      if (!room.members.some((m) => m.id === memberId)) {
        return { ok: false, error: "invalid-session" };
      }
      return {
        ok: true,
        room: {
          ...room,
          members: room.members.map((member) => {
            if (member.id !== memberId) return member;
            const connections = Math.max(0, member.connections + delta);
            return { ...member, connections, offlineSince: connections === 0 ? now() : null };
          }),
        },
      };
    };

  io.on("connection", (socket) => {
    const { code, memberId } = socket.data as SocketData;
    // Join and enqueue in the same tick so a fast disconnect is queued after the connect.
    void socket.join(socketRoom(code));
    const connected: Promise<Ack> = hub
      .mutate(code, adjustConnections(memberId, 1))
      .catch((err) => {
        onError(err);
        return { ok: false, error: "invalid-session" };
      });

    void connected.then((ack) => {
      if (!ack.ok) socket.disconnect(true);
    });

    socket.on("disconnect", async () => {
      if (!(await connected).ok) return;
      await hub.mutate(code, adjustConnections(memberId, -1)).catch(onError);
    });
  });
}
