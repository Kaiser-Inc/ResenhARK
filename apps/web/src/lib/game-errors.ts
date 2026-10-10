import type { ErrorCode } from "@resenhark/shared";

import { ERROR_MESSAGES } from "@/lib/error-messages";

export function gameErrorMessage(error: ErrorCode, game?: "taleclue"): string {
  if (game === "taleclue" && error === "invalid-hint")
    return "Pista inválida: use de 1 a 30 caracteres.";
  if (game === "taleclue" && error === "no-deck") return "Não há cartas suficientes para começar.";
  return ERROR_MESSAGES[error] ?? "Não deu certo. Tenta de novo.";
}

/** Lobby actions the components get from the room: send an event, know if the socket is up. */
export type Send = (event: string, payload?: unknown) => Promise<import("@resenhark/shared").Ack>;
