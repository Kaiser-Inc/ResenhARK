import type { ErrorCode } from "@resenhark/shared";

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  "not-owner": "Só o dono da sala pode fazer isso.",
  "game-running": "Já tem uma partida rolando.",
  "no-deck": "Importe uma playlist antes de começar.",
  "playlist-empty": "A playlist tem poucas faixas para começar.",
  "not-your-turn": "Não é a sua vez.",
  "wrong-phase": "Essa ação não vale nesta fase.",
  "invalid-slot": "Esse vão não existe mais.",
  "no-game": "Não tem partida rolando.",
  timeout: "Sem resposta do servidor. Tenta de novo.",
};

export function gameErrorMessage(error: ErrorCode): string {
  return MESSAGES[error] ?? "Não deu certo. Tenta de novo.";
}

/** Lobby actions the components get from the room: send an event, know if the socket is up. */
export type Send = (event: string, payload?: unknown) => Promise<import("@resenhark/shared").Ack>;
