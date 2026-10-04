import type { RevealView } from "@resenhark/shared";
import { CheckIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function RevealPanel({ reveal, playerName }: { reveal: RevealView; playerName: string }) {
  const { card, guess } = reveal;
  const outcome = !guess ? "tempo esgotado" : guess.correct ? "acertou" : "errou";
  const artists = card.artists.join(", ");
  return (
    <section aria-label="Virada" className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">Virada</h2>
      <p className="font-mono text-2xl leading-7 font-semibold">{card.year}</p>
      <p className="text-sm leading-[22px]">
        {card.title} · {artists}
      </p>
      <p
        className={cn(
          "flex items-center gap-1.5 text-sm font-medium",
          guess?.correct ? "text-success" : "text-destructive",
        )}
      >
        {guess?.correct ? (
          <CheckIcon aria-hidden="true" strokeWidth={1.75} className="size-4" />
        ) : (
          <XIcon aria-hidden="true" strokeWidth={1.75} className="size-4" />
        )}
        {playerName} {outcome}
        {reveal.tokenAwarded ? " · +1 ficha" : ""}
      </p>
      <p aria-live="polite" className="sr-only">
        Carta virada: {card.year}, {card.title}, {artists}, {outcome}
      </p>
    </section>
  );
}
