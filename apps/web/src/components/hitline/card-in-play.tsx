"use client";

import type { HitlineView } from "@resenhark/shared";

import { SnippetPlayer } from "@/components/hitline/snippet-player";
import { Button } from "@/components/ui/button";

type CardInPlayProps = {
  view: HitlineView;
  isTurn: boolean;
  connected: boolean;
  chosenSlot: number | null;
  pending: "draw" | "lock" | null;
  onDraw: () => void;
  onLock: () => void;
};

export function CardInPlay({
  view,
  isTurn,
  connected,
  chosenSlot,
  pending,
  onDraw,
  onLock,
}: CardInPlayProps) {
  const { draw, phase } = view;
  return (
    <section aria-label="Carta em jogo" className="flex items-center gap-4">
      <div
        aria-hidden="true"
        className="flex h-24 w-[68px] shrink-0 items-center justify-center rounded-lg border border-border-strong bg-secondary font-mono text-[40px] leading-none font-semibold text-primary-text"
      >
        ?
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-3">
        {draw?.audioUrl ? (
          <div className="w-full max-w-[480px]">
            <SnippetPlayer key={draw.id} audioUrl={draw.audioUrl} />
          </div>
        ) : draw ? (
          <p className="text-sm text-muted-foreground">Trecho indisponível</p>
        ) : null}
        {isTurn && phase === "turn-start" ? (
          <Button type="button" loading={pending === "draw"} disabled={!connected} onClick={onDraw}>
            Puxar carta
          </Button>
        ) : null}
        {isTurn && phase === "guessing" ? (
          <>
            <Button
              type="button"
              loading={pending === "lock"}
              disabled={!connected || chosenSlot === null}
              onClick={onLock}
            >
              Travar palpite
            </Button>
            {chosenSlot === null ? (
              <p className="text-sm text-muted-foreground">Escolha um vão na timeline</p>
            ) : null}
          </>
        ) : null}
        {!isTurn && phase === "turn-start" ? (
          <p className="text-sm text-muted-foreground">Esperando a carta ser puxada</p>
        ) : null}
      </div>
    </section>
  );
}
