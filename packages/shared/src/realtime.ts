import { z } from "zod";
import type { HitlineConfig, HitlineEvent, HitlineView } from "./hitline.js";
import type { HuehintConfig, HuehintEvent, HuehintView } from "./huehint.js";
import type { Avatar } from "./room.js";

export const GAME_TYPES = ["hitline", "huehint"] as const;
export type GameType = (typeof GAME_TYPES)[number];
export const selectGameInputSchema = z.object({ game: z.enum(GAME_TYPES) });

export type ErrorCode =
  | "invalid-session"
  | "room-not-found"
  | "name-taken"
  | "room-full"
  | "not-owner"
  | "invalid-target"
  | "rate-limited"
  | "invalid-message"
  | "invalid-input"
  | "spotify-disconnected"
  | "playlist-invalid-link"
  | "playlist-no-access"
  | "playlist-empty"
  | "playlist-exhausted"
  | "no-deck"
  | "game-running"
  | "no-game"
  | "not-your-turn"
  | "wrong-phase"
  | "insufficient-tokens"
  | "already-bought"
  | "slot-taken"
  | "invalid-slot"
  | "already-decided"
  | "not-a-player"
  | "invalid-hint"
  | "already-guessed"
  | "server-error"
  // Client-side only: an emit that got no ack in time.
  | "timeout";

export type Ack = { ok: true } | { ok: false; error: ErrorCode };

export type MemberView = {
  id: string;
  name: string;
  avatar: Avatar;
  online: boolean;
  isOwner: boolean;
  role: "player" | "spectator" | "member";
};

export type LobbyView = {
  /** The game `game:start` starts. */
  selectedGame: GameType;
  /** Hitline config (kept under this name for compatibility). */
  config: HitlineConfig;
  huehintConfig: HuehintConfig;
  playlist: { name: string; count: number } | null;
  /** Songs not yet played in this room (null without a playlist); below `count` once rounds were played. */
  remaining: number | null;
  /** True when the playlist is likely too short for the players and target. */
  smallPlaylist: boolean;
};
export type GameView =
  | { type: "hitline"; view: HitlineView }
  | { type: "huehint"; view: HuehintView };
export type GameEvent = HitlineEvent | HuehintEvent;

export const CHAT_MAX_LENGTH = 500;
export const CHAT_HISTORY = 200;

export type ChatMessage =
  | {
      id: string;
      kind: "user";
      memberId: string;
      name: string;
      avatar: Avatar;
      text: string;
      at: number;
    }
  | { id: string; kind: "system"; text: string; at: number };

export type RoomView = {
  code: string;
  you: string;
  ownerId: string;
  members: MemberView[];
  lobby: LobbyView;
  game: GameView | null;
  serverNow: number;
};

export type RoomStatePayload = { room: RoomView; events: GameEvent[] };

export const SOCKET_EVENTS = {
  state: "room:state",
  chatHistory: "chat:history",
  chatMessage: "chat:message",
  kicked: "room:kicked",
} as const;
