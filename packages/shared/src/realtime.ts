import type { Avatar } from "./room.js";

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

// Placeholders, filled in when lobby and game views exist.
export type LobbyView = null;
export type GameView = null;
export type GameEvent = never;
// Placeholder until chat messages exist (Task 7).
export type ChatMessage = never;

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
