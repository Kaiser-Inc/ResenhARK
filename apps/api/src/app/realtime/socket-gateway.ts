import {
  type Ack,
  SOCKET_EVENTS,
  hitlineConfigSchema,
  hitlineIntentSchema,
} from "@resenhark/shared";
import type { Server } from "socket.io";
import { validateMessage } from "../domain/room/chat.js";
import { RateLimiter } from "../domain/room/rate-limiter.js";
import { type Room, isOnline, kick, leave } from "../domain/room/room.js";
import { SYSTEM_ACTOR, apply, create } from "../games/hitline/engine.js";
import type { PlaylistSource } from "../gateways/ports/playlist-source.js";
import type { RoomStore } from "../repositories/room-store.js";
import { type MutationResult, type RoomHub, socketRoom } from "./room-hub.js";

type SocketData = { code: string; memberId: string };

export function registerSocketGateway(
  io: Server,
  deps: {
    store: RoomStore;
    hub: RoomHub;
    playlists: PlaylistSource;
    now: () => number;
    rng: () => number;
    newId: () => string;
    onError: (err: unknown) => void;
  },
): void {
  const { store, hub, playlists, now, rng, newId, onError } = deps;
  const ctx = () => ({ now: now(), rng, newId });
  const running = (room: Room) => !!room.game && room.game.state.phase !== "game-over";
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
      async (...args: unknown[]) => {
        // A payload-less emit puts the ack callback first.
        const last = args[args.length - 1];
        const ack = typeof last === "function" ? (last as (result: Ack) => void) : undefined;
        const payload = typeof args[0] === "function" ? undefined : args[0];
        const reply = (result: Ack) => ack?.(result);
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

    const notOwner = (room: Room) => room.ownerId !== memberId;

    socket.on(
      "lobby:configure",
      intent(async (payload) => {
        const parsed = hitlineConfigSchema.safeParse(payload);
        if (!parsed.success) return { ack: { ok: false, error: "invalid-input" } };
        const ack = await hub.mutate(code, (room) => {
          if (notOwner(room)) return { ok: false, error: "not-owner" };
          if (running(room)) return { ok: false, error: "game-running" };
          return { ok: true, room: { ...room, lobby: { ...room.lobby, config: parsed.data } } };
        });
        return { ack };
      }),
    );

    socket.on(
      "lobby:import",
      intent(async (payload) => {
        const link = (payload as { link?: unknown } | null)?.link;
        if (typeof link !== "string" || link.length === 0 || link.length > 500) {
          return { ack: { ok: false, error: "invalid-input" } };
        }
        // Cheap owner check first, so only the owner can trigger an outbound call.
        const current = await store.load(code);
        if (!current) return { ack: { ok: false, error: "room-not-found" } };
        if (notOwner(current)) return { ack: { ok: false, error: "not-owner" } };
        // Network call stays outside the room queue.
        const loaded = await playlists.load(link);
        if (!loaded.ok) return { ack: { ok: false, error: loaded.error } };
        const ack = await hub.mutate(code, (room) => {
          if (notOwner(room)) return { ok: false, error: "not-owner" };
          return { ok: true, room: { ...room, lobby: { ...room.lobby, deck: loaded.playlist } } };
        });
        return { ack };
      }),
    );

    socket.on(
      "game:start",
      intent(async () => {
        const ack = await hub.mutate(code, (room) => {
          if (notOwner(room)) return { ok: false, error: "not-owner" };
          if (running(room)) return { ok: false, error: "game-running" };
          const deck = room.lobby.deck;
          if (!deck) return { ok: false, error: "no-deck" };
          const playerIds = room.members
            .filter(isOnline)
            .sort((a, b) => a.joinedAt - b.joinedAt)
            .slice(0, room.lobby.config.maxPlayers)
            .map((m) => m.id);
          // Each player takes a card and at least one must remain to draw.
          if (deck.cards.length <= playerIds.length) return { ok: false, error: "playlist-empty" };
          const started = create(room.lobby.config, playerIds, deck.cards, ctx());
          return {
            ok: true,
            room: { ...room, game: { type: "hitline", state: started.state, playerIds } },
            events: started.events,
            system: ["Partida de Hitline começou"],
          };
        });
        return { ack };
      }),
    );

    socket.on(
      "game:end",
      intent(async () => {
        const ack = await hub.mutate(code, (room) => {
          if (notOwner(room)) return { ok: false, error: "not-owner" };
          const game = room.game;
          if (!game || !running(room)) return { ok: false, error: "no-game" };
          const result = apply(game.state, SYSTEM_ACTOR, { type: "end" }, ctx());
          if (!result.ok) return result;
          return {
            ok: true,
            room: { ...room, game: { ...game, state: result.state } },
            events: result.events,
          };
        });
        return { ack };
      }),
    );

    socket.on(
      "game:action",
      intent(async (payload) => {
        const parsed = hitlineIntentSchema.safeParse(payload);
        if (!parsed.success) return { ack: { ok: false, error: "invalid-input" } };
        const ack = await hub.mutate(code, (room) => {
          const game = room.game;
          if (!game) return { ok: false, error: "no-game" };
          const result = apply(game.state, memberId, parsed.data, ctx());
          if (!result.ok) return result;
          return {
            ok: true,
            room: { ...room, game: { ...game, state: result.state } },
            events: result.events,
          };
        });
        return { ack };
      }),
    );

    socket.on("disconnect", async () => {
      if (!(await connected).ok) return;
      await hub.mutate(code, adjustConnections(memberId, -1)).catch(onError);
    });
  });
}
