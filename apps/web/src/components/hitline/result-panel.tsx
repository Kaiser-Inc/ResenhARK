"use client";

import type { HitlineView, MemberView } from "@resenhark/shared";

import { Button } from "@/components/ui/button";

const REASONS: Record<NonNullable<HitlineView["endReason"]>, string> = {
  target: "Chegou ao número de cartas para vencer.",
  "deck-empty": "Fim da pilha: vence a maior timeline.",
  ended: "Partida encerrada pelo dono.",
};

type ResultPanelProps = {
  view: HitlineView;
  members: MemberView[];
  isOwner: boolean;
  onNewGame: () => Promise<unknown>;
};

export function ResultPanel({ view, members, isOwner, onNewGame }: ResultPanelProps) {
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "Alguém";
  const standings = [...view.players].sort((a, b) => b.timeline.length - a.timeline.length);
  return (
    <section aria-label="Resultado" className="flex flex-col gap-4">
      <h2 className="text-[28px] leading-8 font-semibold tracking-[-0.03em]">
        {view.winners.length === 0
          ? "Sem vencedor"
          : `${view.winners.map(name).join(" e ")} ${view.winners.length > 1 ? "venceram" : "venceu"}`}
      </h2>
      {view.endReason ? (
        <p className="text-sm text-muted-foreground">{REASONS[view.endReason]}</p>
      ) : null}
      <ol className="flex flex-col gap-1 text-sm" aria-label="Placar final">
        {standings.map((player) => (
          <li key={player.id} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate font-medium">{name(player.id)}</span>
            <span className="font-mono tabular-nums">
              {player.timeline.length}/{view.config.targetCards}
            </span>
            <span className="w-16 text-right text-muted-foreground">{player.tokens} fichas</span>
          </li>
        ))}
      </ol>
      {isOwner ? (
        <div>
          <Button type="button" onClick={onNewGame}>
            Nova partida
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Aguardando o dono</p>
      )}
    </section>
  );
}
