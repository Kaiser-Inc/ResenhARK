import type { ErrorCode, HitlineView } from "@resenhark/shared";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  "invalid-session": "Sua sessão expirou. Entra de novo.",
  "room-not-found": "Sala não encontrada.",
  "name-taken": "Esse nome já está em uso na sala. Escolha outro.",
  "room-full": "A sala está cheia.",
  "not-owner": "Só o dono da sala pode fazer isso.",
  "invalid-target": "Essa pessoa já saiu da sala.",
  "rate-limited": "Devagar aí",
  "invalid-message": "Mensagem inválida.",
  "invalid-input": "Confere os dados e tenta de novo.",
  "spotify-disconnected": "Spotify desconectado.",
  "playlist-invalid-link": "Link inválido. Cole o link de uma playlist do Spotify.",
  "playlist-no-access": "Sem acesso a esta playlist. Deixe-a pública ou conecte a conta dona dela.",
  "playlist-empty": "A playlist tem poucas faixas para começar.",
  "playlist-exhausted": "Todas as músicas já foram sorteadas. Use Recomeçar músicas no lobby.",
  "no-deck": "Importe uma playlist antes de começar.",
  "game-running": "Já tem uma partida rolando.",
  "no-game": "Não tem partida rolando.",
  "not-your-turn": "Não é sua vez",
  "wrong-phase": "Essa ação não vale agora",
  "insufficient-tokens": "Sem fichas",
  "already-bought": "Uma compra por vez",
  "slot-taken": "Posição já contestada",
  "invalid-slot": "Esse vão não existe mais.",
  "already-decided": "Você já decidiu nesta contestação",
  "not-a-player": "Você está só olhando esta partida",
  "server-error": "Algo deu errado no servidor. Tenta de novo.",
  timeout: "Sem resposta do servidor. Tenta de novo.",
};

export const BUY_COST = 3;
export const SKIP_COST = 1;
export const CONTEST_COST = 1;

/** Short reason an action is unavailable to `you` right now, or null when it is allowed. */
export function disabledReason(
  view: HitlineView,
  you: string,
  action: "skip" | "buy" | "contest",
): string | null {
  const me = view.players.find((p) => p.id === you);
  if (!me) return ERROR_MESSAGES["not-a-player"];
  if (action === "contest") {
    if (view.phase !== "contest" || view.turnPlayerId === you) return ERROR_MESSAGES["wrong-phase"];
    if (view.passed.includes(you) || view.contests.some((c) => c.playerId === you))
      return ERROR_MESSAGES["already-decided"];
    return me.tokens < CONTEST_COST ? ERROR_MESSAGES["insufficient-tokens"] : null;
  }
  if (view.turnPlayerId !== you) return ERROR_MESSAGES["not-your-turn"];
  if (action === "skip") {
    if (view.phase !== "guessing") return ERROR_MESSAGES["wrong-phase"];
    return me.tokens < SKIP_COST ? ERROR_MESSAGES["insufficient-tokens"] : null;
  }
  if (view.phase !== "turn-start" && view.phase !== "guessing")
    return ERROR_MESSAGES["wrong-phase"];
  if (view.bought) return ERROR_MESSAGES["already-bought"];
  return me.tokens < BUY_COST ? ERROR_MESSAGES["insufficient-tokens"] : null;
}
