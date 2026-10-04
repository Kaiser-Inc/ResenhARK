import type { GameView, LobbyView, RoomView } from "@resenhark/shared";
import { settings } from "../core/settings.js";
import { type Room, isOnline } from "../domain/room/room.js";
import { project } from "../games/hitline/project.js";
import { audioPath } from "../http/audio-tickets.js";

/** What `viewerId` is allowed to see of the room. Never add hidden game data here. */
export function projectRoom(room: Room, viewerId: string, now: number): RoomView {
  const { game, lobby } = room;
  const onlineCount = room.members.filter(isOnline).length;
  const cap = Math.min(onlineCount, lobby.config.maxPlayers);
  const lobbyView: LobbyView = {
    config: { ...lobby.config },
    playlist: lobby.deck ? { name: lobby.deck.name, count: lobby.deck.cards.length } : null,
    smallPlaylist: lobby.deck
      ? lobby.deck.cards.length < cap * lobby.config.targetCards * 2
      : false,
  };
  const active = !!game && game.state.phase !== "game-over";
  let gameView: GameView | null = null;
  if (game) {
    const view = project(game.state, viewerId);
    if (view.draw) {
      view.draw.audioUrl = audioPath(settings.SESSION_SECRET, view.draw.id, viewerId);
    }
    gameView = { type: "hitline", view };
  }
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
      role: active ? (game.playerIds.includes(member.id) ? "player" : "spectator") : "member",
    })),
    lobby: lobbyView,
    game: gameView,
    serverNow: now,
  };
}
