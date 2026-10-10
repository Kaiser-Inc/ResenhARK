import {
  type MemberView,
  type TaleclueIntent,
  type TaleclueView,
  isValidClue,
} from "@resenhark/shared";

export const TALECLUE_REVEAL_STAGES = [
  { type: "card-flip", label: "Esta era a carta do narrador", duration: 2400 },
  { type: "votes", label: "Quem votou em quê", duration: 2400 },
  { type: "award-correct", label: "Pontos por acertar", duration: 2400 },
  { type: "award-decoy", label: "Pontos das iscas", duration: 2400 },
  { type: "board-move", label: "Avanço no tabuleiro", duration: 2400 },
] as const;

export function taleclueRevealStage(elapsed: number) {
  const index = Math.min(4, Math.floor(Math.max(0, elapsed) / 2400));
  return { index, type: TALECLUE_REVEAL_STAGES[index].type, active: elapsed < 12000 };
}

/** The full image is reserved for the zoom dialog. */
export function taleclueThumbnail(image: string): string {
  return image.replace(/\.webp$/, ".thumb.webp");
}

/** The projection and server clock are the only authority for action eligibility. */
export function taleclueAction(
  view: TaleclueView,
  you: string,
  role: MemberView["role"],
  now: number,
): TaleclueIntent["type"] | null {
  if (
    role !== "player" ||
    !view.players.some((p) => p.id === you && p.online) ||
    view.deadline === null ||
    now >= view.deadline
  )
    return null;
  if (view.phase === "clue") return view.narratorId === you ? "give-clue" : null;
  if (view.narratorId === you || view.acted.includes(you)) return null;
  if (view.phase === "decoy") return "play-decoys";
  if (view.phase === "vote" && view.myVote === null) return "vote";
  return null;
}
export function taleclueVotableCards(view: TaleclueView): string[] {
  return view.table.filter((id) => !view.myCards.includes(id));
}
export function taleclueWaitingCount(view: TaleclueView): number {
  if (view.phase === "clue")
    return Number(view.players.some((p) => p.id === view.narratorId && p.online));
  if (view.phase !== "decoy" && view.phase !== "vote") return 0;
  return view.players.filter(
    (p) => p.online && p.id !== view.narratorId && !view.acted.includes(p.id),
  ).length;
}
export function taleclueRevealElapsed(deadline: number | null, now: number): number {
  return deadline === null ? 0 : Math.max(0, Math.min(15000, 15000 - (deadline - now)));
}
export function taleclueSelectionValid(view: TaleclueView, selected: string[], clue = ""): boolean {
  if (new Set(selected).size !== selected.length) return false;
  if (view.phase === "vote")
    return selected.length === 1 && taleclueVotableCards(view).includes(selected[0]);
  if (!selected.every((id) => view.hand.includes(id))) return false;
  if (view.phase === "clue") return selected.length === 1 && isValidClue(clue);
  return view.phase === "decoy" && selected.length === view.decoyCount;
}
