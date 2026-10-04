import type { ErrorCode } from "@resenhark/shared";

import { ERROR_MESSAGES } from "@/lib/error-messages";

export function gameErrorMessage(error: ErrorCode): string {
  return ERROR_MESSAGES[error] ?? "Não deu certo. Tenta de novo.";
}

/** Lobby actions the components get from the room: send an event, know if the socket is up. */
export type Send = (event: string, payload?: unknown) => Promise<import("@resenhark/shared").Ack>;
