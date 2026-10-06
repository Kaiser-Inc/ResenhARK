import {
  type Ack,
  SOCKET_EVENTS,
  hitlineConfigSchema,
  huehintConfigSchema,
  selectGameInputSchema,
} from "@resenhark/shared";
import type { Server } from "socket.io";
import { validateMessage } from "../domain/room/chat.js";
import { RateLimiter } from "../domain/room/rate-limiter.js";
import {
  type Room,
  foldPlayed,
  isOnline,
  kick,
  leave,
  unplayedCards,
} from "../domain/room/room.js";
import { SYSTEM_ACTOR, create } from "../games/hitline/engine.js";
import { create as createHuehint } from "../games/huehint/engine.js";
import { applyGame, isGamePlayer, isRunning, parseIntent } from "../games/registry.js";
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
  const running = (room: Room) => isRunning(room.game);
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
      const before = room.members.find((m) => m.id === memberId);
      const next = Math.max(0, (before?.connections ?? 0) + delta);
      const flipped = (before?.connections ?? 0) > 0 !== next > 0;
      const withPresence = flipped ? setPresence(room, memberId, next > 0) : { room, events: [] };
      return {
        ok: true,
        events: withPresence.events,
        room: {
          ...withPresence.room,
          members: withPresence.room.members.map((member) => {
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

  /** Mirrors a member's presence into the running game, when they are a player. */
  const setPresence = (room: Room, memberId: string, online: boolean) => {
    const game = room.game;
    if (!isRunning(game) || !isGamePlayer(game, memberId)) return { room, events: [] };
    const result = applyGame(game, memberId, { type: "set-online", online }, ctx());
    if (!result.ok) return { room, events: [] };
    return { room: { ...room, game: result.game }, events: result.events };
  };

  /** A kicked or departed player leaves the running game; the turn passes if it was theirs. */
  const removeFromGame = (room: Room, memberId: string) => {
    const game = room.game;
    if (!isRunning(game) || !isGamePlayer(game, memberId)) return { room, events: [] };
    const result = applyGame(game, SYSTEM_ACTOR, { type: "remove", playerId: memberId }, ctx());
    if (!result.ok) return { room, events: [] };
    return {
      room: {
        ...room,
        game: { ...result.game, playerIds: game.playerIds.filter((id) => id !== memberId) },
      },
      events: result.events,
    };
  };

  /** Online members by join order, up to `max`; the rest watch. */
  const seatPlayers = (room: Room, max: number) =>
    room.members
      .filter(isOnline)
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .slice(0, max)
      .map((m) => m.id);

  /** Huehint needs no deck: one online member plays solo, two or more play as a group. */
  const startHuehint = (room: Room): MutationResult => {
    // A finished Hitline game's songs still count as played.
    const folded = foldPlayed(room);
    const playerIds = seatPlayers(folded, folded.lobby.huehintConfig.maxPlayers);
    const started = createHuehint(folded.lobby.huehintConfig, playerIds, ctx());
    return {
      ok: true,
      room: { ...folded, game: { type: "huehint", state: started.state, playerIds } },
      events: started.events,
      system: ["Partida de Huehint começou"],
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
          const removed = removeFromGame(result.room, targetId);
          return { ...removed, ok: true, system: [`${name} foi removido da sala`] };
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
          const removed = removeFromGame(left, memberId);
          return { ok: true, ...removed, system };
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
      "lobby:select-game",
      intent(async (payload) => {
        const parsed = selectGameInputSchema.safeParse(payload);
        if (!parsed.success) return { ack: { ok: false, error: "invalid-input" } };
        const ack = await hub.mutate(code, (room) => {
          if (notOwner(room)) return { ok: false, error: "not-owner" };
          if (running(room)) return { ok: false, error: "game-running" };
          return {
            ok: true,
            room: { ...room, lobby: { ...room.lobby, game: parsed.data.game } },
          };
        });
        return { ack };
      }),
    );

    socket.on(
      "lobby:configure-huehint",
      intent(async (payload) => {
        const parsed = huehintConfigSchema.safeParse(payload);
        if (!parsed.success) return { ack: { ok: false, error: "invalid-input" } };
        const ack = await hub.mutate(code, (room) => {
          if (notOwner(room)) return { ok: false, error: "not-owner" };
          if (running(room)) return { ok: false, error: "game-running" };
          return {
            ok: true,
            room: { ...room, lobby: { ...room.lobby, huehintConfig: parsed.data } },
          };
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
          if (running(room)) return { ok: false, error: "game-running" };
          // A new playlist starts a fresh played-set; a finished game's cards belong to the old deck.
          return {
            ok: true,
            room: {
              ...room,
              game: null,
              lobby: { ...room.lobby, deck: loaded.playlist, played: [] },
            },
          };
        });
        return { ack };
      }),
    );

    socket.on(
      "lobby:reset-played",
      intent(async () => {
        const ack = await hub.mutate(code, (room) => {
          if (notOwner(room)) return { ok: false, error: "not-owner" };
          if (running(room)) return { ok: false, error: "game-running" };
          return { ok: true, room: { ...room, lobby: { ...room.lobby, played: [] } } };
        });
        return { ack };
      }),
    );

    socket.on(
      "game:start",
      intent(async () => {
        const ack = await hub.mutate(code, (folded) => {
          if (notOwner(folded)) return { ok: false, error: "not-owner" };
          if (running(folded)) return { ok: false, error: "game-running" };
          if (folded.lobby.game === "huehint") return startHuehint(folded);
          // A finished game's songs count as played even when the owner skips "Outra rodada".
          const room = foldPlayed(folded);
          if (!room.lobby.deck) return { ok: false, error: "no-deck" };
          const pool = unplayedCards(room.lobby);
          const playerIds = seatPlayers(room, room.lobby.config.maxPlayers);
          // Each player takes a card and at least one must remain to draw.
          if (pool.length <= playerIds.length) {
            const played = (room.lobby.played ?? []).length > 0;
            return { ok: false, error: played ? "playlist-exhausted" : "playlist-empty" };
          }
          const started = create(room.lobby.config, playerIds, pool, ctx());
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
          if (!isRunning(game)) return { ok: false, error: "no-game" };
          const result = applyGame(game, SYSTEM_ACTOR, { type: "end" }, ctx());
          if (!result.ok) return result;
          return { ok: true, room: { ...room, game: result.game }, events: result.events };
        });
        return { ack };
      }),
    );

    socket.on(
      "game:reset",
      intent(async () => {
        const ack = await hub.mutate(code, (room) => {
          if (notOwner(room)) return { ok: false, error: "not-owner" };
          if (!room.game || running(room)) return { ok: false, error: "no-game" };
          return { ok: true, room: { ...foldPlayed(room), game: null } };
        });
        return { ack };
      }),
    );

    socket.on(
      "game:action",
      intent(async (payload) => {
        const ack = await hub.mutate(code, (room) => {
          const game = room.game;
          if (!game) return { ok: false, error: "no-game" };
          // Validated against the active game's intents, which only the loaded room knows.
          const parsed = parseIntent(game, payload);
          if (!parsed.ok) return { ok: false, error: "invalid-input" };
          const result = applyGame(game, memberId, parsed.action, ctx());
          if (!result.ok) return result;
          return { ok: true, room: { ...room, game: result.game }, events: result.events };
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
