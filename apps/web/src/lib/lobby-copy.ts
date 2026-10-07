import type { LobbyView } from "@resenhark/shared";

export function deckLabel(playlist: LobbyView["playlist"]): string {
  return `${playlist.name} · ${playlist.count} músicas`;
}

export function smallDeckWarning(
  small: boolean,
  online: number,
  maxPlayers: number,
  targetCards: number,
): string | null {
  if (!small) return null;
  const players = Math.max(1, Math.min(online, maxPlayers));
  return `Baralho pequeno para ${players} ${players === 1 ? "jogador" : "jogadores"} com ${targetCards} cartas para vencer: a partida pode acabar antes de alguém vencer`;
}
