import { type Ack, SOCKET_EVENTS } from "@resenhark/shared";
import type { Server } from "socket.io";
import { validateMessage } from "../domain/room/chat.js";
import { RateLimiter } from "../domain/room/rate-limiter.js";
import { type Room, kick, leave } from "../domain/room/room.js";
import type { RoomStore } from "../repositories/room-store.js";
import { type MutationResult, type RoomHub, socketRoom } from "./room-hub.js";

type SocketData = { code: string; memberId: string };

export function registerSocketGateway(
  io: Server,
  deps: {
    store: RoomStore;
    hub: RoomHub;
    now: () => number;
    newId: () => string;
    onError: (err: unknown) => void;
  },
): void {
  const { store, hub, now, newId, onError } = deps;
  const chatLimiter = new RateLimiter(5, 5000);

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
      const system: string[] = [];
      return {
        ok: true,
        room: {
          ...room,
          members: room.members.map((member) => {
            if (member.id !== memberId) return member;
            const connections = Math.max(0, member.connections + delta);
            const greet = delta === 1 && !member.greeted;
            if (greet) system.push(`${member.name} entrou`);
            return {
              ...member,
              connections,
              offlineSince: connections === 0 ? now() : null,
              greeted: member.greeted || greet,
            };
          }),
        },
        system,
      };
    };

  /** Revokes the member's sessions and drops their sockets, telling them first if `event` is given. */
  const dropMember = async (code: string, targetId: string, event?: string) => {
    await store.revokeMemberSessions(code, targetId);
    for (const s of await io.in(socketRoom(code)).fetchSockets()) {
      if (s.data.memberId !== targetId) continue;
      if (event) s.emit(event);
      s.disconnect(true);
    }
  };

  io.on("connection", (socket) => {
    const { code, memberId } = socket.data as SocketData;
    // Join before the mutation so the first broadcast already reaches this socket.
    const connected: Promise<Ack> = (async () => {
      await socket.join(socketRoom(code));
      return hub.mutate(code, adjustConnections(memberId, 1));
    })().catch((err): Ack => {
      onError(err);
      return { ok: false, error: "invalid-session" };
    });

    // Joined before this read, so a message sent meanwhile may also arrive live: clients dedupe by id.
    void connected
      .then(async (ack) => {
        if (!ack.ok) return socket.disconnect(true);
        socket.emit(SOCKET_EVENTS.chatHistory, await store.chatHistory(code));
      })
      .catch(onError);

    socket.on("chat:send", async (payload: unknown, ack?: (result: Ack) => void) => {
      const reply = (result: Ack) => typeof ack === "function" && ack(result);
      try {
        const parsed = validateMessage((payload as { text?: unknown } | null)?.text);
        if (!parsed.ok) return reply(parsed);
        if (!chatLimiter.allow(memberId, now())) return reply({ ok: false, error: "rate-limited" });
        const member = (await store.load(code))?.members.find((m) => m.id === memberId);
        if (!member) return reply({ ok: false, error: "invalid-session" });
        const message = {
          id: newId(),
          kind: "user",
          memberId,
          name: member.name,
          avatar: member.avatar,
          text: parsed.text,
          at: now(),
        } as const;
        await store.appendChat(code, message);
        io.to(socketRoom(code)).emit(SOCKET_EVENTS.chatMessage, message);
        // Commit boundary: stored and delivered, so a failed TTL renewal is logged, not acked as an error.
        await store.touch(code).catch(onError);
        reply({ ok: true });
      } catch (err) {
        onError(err);
        reply({ ok: false, error: "server-error" });
      }
    });

    // The ack goes out before `after` runs, so a disconnect cannot swallow it.
    const intent =
      (handler: (payload: unknown) => Promise<{ ack: Ack; after?: () => Promise<void> }>) =>
      async (payload: unknown, ack?: (result: Ack) => void) => {
        const reply = (result: Ack) => typeof ack === "function" && ack(result);
        try {
          const outcome = await handler(payload);
          reply(outcome.ack);
          await outcome.after?.();
        } catch (err) {
          onError(err);
          reply({ ok: false, error: "server-error" });
        }
      };

    socket.on(
      "room:kick",
      intent(async (payload) => {
        const targetId = (payload as { targetId?: unknown } | null)?.targetId;
        if (typeof targetId !== "string") return { ack: { ok: false, error: "invalid-input" } };
        const ack = await hub.mutate(code, (room) => {
          const result = kick(room, memberId, targetId);
          if (!result.ok) return result;
          const name = room.members.find((m) => m.id === targetId)?.name;
          return { ...result, system: [`${name} foi removido da sala`] };
        });
        return {
          ack,
          after: ack.ok ? () => dropMember(code, targetId, SOCKET_EVENTS.kicked) : undefined,
        };
      }),
    );

    socket.on(
      "room:leave",
      intent(async () => {
        const ack = await hub.mutate(code, (room) => {
          const leaver = room.members.find((m) => m.id === memberId);
          if (!leaver) return { ok: false, error: "invalid-session" };
          const left = leave(room, memberId);
          const system = [`${leaver.name} saiu`];
          const heir = left.members.find((m) => m.id === left.ownerId);
          if (left.ownerId !== room.ownerId && heir) {
            system.push(`${heir.name} agora é o dono da sala`);
          }
          return { ok: true, room: left, system };
        });
        return { ack, after: ack.ok ? () => dropMember(code, memberId) : undefined };
      }),
    );

    socket.on("disconnect", async () => {
      if (!(await connected).ok) return;
      await hub.mutate(code, adjustConnections(memberId, -1)).catch(onError);
    });
  });
}
