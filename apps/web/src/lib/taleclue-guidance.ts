import type { MemberView, TaleclueView } from "@resenhark/shared";
import { TALECLUE_REVEAL_STAGES } from "./taleclue";

export type TaleclueGuidance = {
  title: string;
  description: string;
  help: string;
  waiting: boolean;
};
const HELP = {
  clue: "Uma boa pista combina com a imagem, mas não deve ser óbvia para todo mundo.",
  decoy:
    "Isca é uma carta sua que pode fazer os outros pensarem que ela é do narrador. Cada voto nela dá 1 ponto a você.",
  vote: "As cartas da mesa estão embaralhadas. Encontre a carta que o narrador escolheu para dar a pista.",
  reveal:
    "Veja a carta do narrador, os votos e os pontos. As peças avançam no tabuleiro conforme a pontuação.",
  "game-over": "",
};

export function taleclueGuidance(
  view: TaleclueView,
  you: string,
  role: MemberView["role"],
  narratorName: string,
): TaleclueGuidance {
  const help = HELP[view.phase];
  const instruction = (title: string, description: string, waiting = false) => ({
    title,
    description,
    help,
    waiting,
  });
  if (role !== "player" || !view.players.some((player) => player.id === you))
    return instruction(
      "Você está acompanhando esta partida.",
      "Você acompanha a rodada sem enviar pistas, iscas ou votos.",
      view.phase !== "reveal" && view.phase !== "game-over",
    );
  const narrator = view.narratorId === you;
  if (view.phase === "clue")
    return narrator
      ? instruction(
          "Sua vez de dar a pista",
          "Escolha 1 carta da sua mão e escreva uma pista de até 30 caracteres.",
        )
      : instruction(
          `${narratorName} está pensando na pista.`,
          `Aguarde a pista. Depois, você escolherá ${view.decoyCount === 2 ? "duas cartas" : "uma carta"} da sua mão.`,
          true,
        );
  if (view.phase === "decoy") {
    if (narrator)
      return instruction(
        "Sua pista já está na mesa.",
        "Aguarde os outros jogadores escolherem as iscas.",
        true,
      );
    if (view.acted.includes(you))
      return instruction(
        view.decoyCount === 2 ? "Iscas enviadas." : "Isca enviada.",
        "Aguarde os outros jogadores. Sua escolha já foi confirmada.",
        true,
      );
    return instruction(
      view.decoyCount === 2 ? "Escolha duas iscas" : "Escolha uma isca",
      `Escolha ${view.decoyCount} carta${view.decoyCount === 2 ? "s" : ""} da sua mão que ${view.decoyCount === 2 ? "combinem" : "combine"} com a pista.`,
    );
  }
  if (view.phase === "vote") {
    if (narrator)
      return instruction("Os jogadores estão votando.", "Você não vota nesta rodada.", true);
    if (view.myVote !== null || view.acted.includes(you))
      return instruction(
        "Voto enviado.",
        "Aguarde os outros jogadores. Sua escolha já foi confirmada.",
        true,
      );
    return instruction(
      "Encontre a carta do narrador",
      "Escolha 1 carta da mesa e confirme seu voto. Você não pode votar nas suas cartas.",
    );
  }
  return instruction(TALECLUE_REVEAL_STAGES[0].label, HELP.reveal);
}

export function taleclueTiming(view: TaleclueView, now: number, canAct: boolean) {
  if (view.deadline === null || view.phase === "game-over")
    return { seconds: 0, fraction: 0, urgent: false };
  const duration =
    view.phase === "clue"
      ? view.config.clueSeconds
      : view.phase === "decoy"
        ? view.config.decoySeconds
        : view.phase === "vote"
          ? view.config.voteSeconds
          : 15;
  const remaining = Math.max(0, view.deadline - now);
  return {
    seconds: Math.ceil(remaining / 1000),
    fraction: Math.min(1, remaining / (duration * 1000)),
    urgent: canAct && view.phase !== "reveal" && remaining > 0 && remaining <= 10000,
  };
}
