import type { MemberView, RevealView } from "@resenhark/shared";
import { CheckIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Mark({ ok, label, children }: { ok: boolean; label: string; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 text-sm">
      <span
        className={cn(
          "flex items-center gap-1.5 font-medium",
          ok ? "text-success" : "text-destructive",
        )}
      >
        {ok ? (
          <CheckIcon aria-hidden="true" strokeWidth={1.75} className="size-4" />
        ) : (
          <XIcon aria-hidden="true" strokeWidth={1.75} className="size-4" />
        )}
        {label} {ok ? "acertou" : "errou"}
      </span>
      {children}
    </li>
  );
}

const typed = (text: string) => (
  <span className="min-w-0 truncate text-muted-foreground">
    {text ? `escreveu "${text}"` : "em branco"}
  </span>
);

export function RevealPanel({ reveal, members }: { reveal: RevealView; members: MemberView[] }) {
  const { card, guess } = reveal;
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? "Alguém";
  const playerName = name(reveal.turnPlayerId);
  const artists = card.artists.join(", ");
  const summary = !guess ? "ficou sem tempo" : guess.correct ? "acertou" : "errou";
  return (
    <section aria-label="Virada" className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">Virada</h2>
      <p className="font-mono text-2xl leading-7 font-semibold">{card.year}</p>
      <p className="text-sm leading-[22px]">
        {card.title} · {artists}
      </p>
      {card.spotifyUrl ? (
        <a
          href={card.spotifyUrl}
          target="_blank"
          rel="noreferrer"
          className="w-fit text-sm text-primary-text underline-offset-4 hover:underline"
        >
          Ouvir no Spotify
        </a>
      ) : null}
      <div className="flex flex-col gap-1">
        {guess ? (
          <>
            <p className="text-sm font-medium">Palpite de {playerName}</p>
            <ul className="flex flex-col gap-1">
              <Mark ok={guess.correct} label="Posição" />
              <Mark ok={guess.titleOk} label="Música">
                {typed(guess.title)}
              </Mark>
              <Mark ok={guess.artistOk} label="Artista">
                {typed(guess.artist)}
              </Mark>
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{playerName} ficou sem tempo</p>
        )}
        {reveal.contests.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {reveal.contests.map((c) => (
              <Mark key={c.playerId} ok={c.correct} label={`${name(c.playerId)} contestou:`} />
            ))}
          </ul>
        ) : null}
      </div>
      <p className="text-sm">
        {reveal.receiverId ? `${name(reveal.receiverId)} levou a carta` : "Ninguém levou a carta"}
        {reveal.tokenAwarded ? ` · +1 ficha para ${playerName}` : ""}
      </p>
      <p aria-live="polite" className="sr-only">
        Carta virada: {card.year}, {card.title}, {artists}, {playerName} {summary}
      </p>
    </section>
  );
}
