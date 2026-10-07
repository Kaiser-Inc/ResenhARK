import type { MemberView, RevealView } from "@resenhark/shared";
import { CheckIcon, XIcon } from "lucide-react";
import { motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";

import { CARD_MOTION, FADE, STAGGER_SECONDS, useReduced } from "@/components/hitline/motion";
import { OdometerYear } from "@/components/hitline/odometer-year";
import { cn } from "@/lib/utils";

function Mark({ ok, label, children }: { ok: boolean; label: string; children?: React.ReactNode }) {
  const reduce = useReduced();
  return (
    <motion.li
      variants={{
        hidden: reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(12px)" },
        shown: reduce ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" },
      }}
      transition={reduce ? FADE : CARD_MOTION}
      className="flex flex-wrap items-center gap-x-2 text-sm"
    >
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
    </motion.li>
  );
}

/** Guesses (and contests) appear one after the other. */
function Sequence({ children }: { children: React.ReactNode }) {
  const reduce = useReduced();
  return (
    <motion.ul
      className="flex flex-col gap-1"
      initial="hidden"
      animate="shown"
      transition={{
        delayChildren: reduce ? 0 : CARD_MOTION.duration,
        staggerChildren: reduce ? 0 : STAGGER_SECONDS,
      }}
    >
      {children}
    </motion.ul>
  );
}

/** The drawn card turns over (rotateY 0 to 180) and shows the outcome. A miss shakes, falls and fades. */
function FlipCard({ hit }: { hit: boolean }) {
  const reduce = useReduced();
  return (
    <motion.div
      data-motion="miss-fall"
      className="shrink-0 [perspective:600px]"
      initial={{ transform: "translate(0px, 0px) rotate(0deg)" }}
      animate={
        hit || reduce
          ? { transform: "translate(0px, 0px) rotate(0deg)" }
          : {
              transform: [
                "translate(0px, 0px) rotate(0deg)",
                "translate(-8px, 0px) rotate(-3deg)",
                "translate(8px, 0px) rotate(3deg)",
                "translate(-4px, 0px) rotate(-2deg)",
                "translate(4px, 0px) rotate(2deg)",
                "translate(0px, 28px) rotate(6deg)",
              ],
              opacity: 0,
            }
      }
      transition={{
        transform: {
          duration: 0.4,
          delay: CARD_MOTION.duration,
          times: [0, 0.15, 0.3, 0.45, 0.6, 1],
          ease: "linear",
        },
        opacity: { duration: 0.22, delay: 0.42 },
      }}
    >
      <motion.div
        aria-hidden="true"
        data-motion="reveal-card"
        className="relative h-24 w-[68px]"
        style={{ transformStyle: "preserve-3d" }}
        initial={reduce ? { opacity: 0 } : { transform: "rotateY(0deg)" }}
        animate={reduce ? { opacity: 1, transform: "none" } : { transform: "rotateY(180deg)" }}
        transition={reduce ? FADE : CARD_MOTION}
      >
        {reduce ? null : (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg border border-border-strong bg-secondary font-mono text-[40px] font-semibold text-primary-text [backface-visibility:hidden]">
            ?
          </div>
        )}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-lg border border-border-strong bg-secondary font-mono text-[40px] font-semibold [backface-visibility:hidden]",
            reduce ? "" : "[transform:rotateY(180deg)]",
            hit ? "text-success" : "text-destructive",
          )}
        >
          {hit ? "✓" : "✗"}
        </div>
      </motion.div>
    </motion.div>
  );
}

const typed = (text: string) => (
  <span className="min-w-0 truncate text-muted-foreground">
    {text ? `escreveu “${text}”` : "em branco"}
  </span>
);

export function RevealPanel({ reveal, members }: { reveal: RevealView; members: MemberView[] }) {
  const { card, guess } = reveal;
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? "Alguém";
  const playerName = name(reveal.turnPlayerId);
  const artists = card.artists.join(", ");
  const hit = reveal.receiverId === reveal.turnPlayerId;
  return (
    <section aria-label="Virada" className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">Virada</h2>
      <div className="flex items-center gap-4">
        <FlipCard key={`flip-${card.id}`} hit={hit} />
        <OdometerYear
          key={card.id}
          year={card.year}
          className="font-mono text-2xl leading-7 font-semibold"
        />
      </div>
      <p className="text-sm leading-[22px]">
        {card.title} · {artists}
      </p>
      {card.spotifyUrl ? (
        <div className="flex items-center gap-4">
          <a
            href={card.spotifyUrl}
            target="_blank"
            rel="noreferrer"
            className="w-fit text-sm text-primary-text underline-offset-4 outline-hidden hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Ouvir no Spotify
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
          {/* Dark modules on a light tile in both themes (scanners expect that polarity): the tile is the
              light token and the modules the dark one, set by CSS because attributes cannot use var(). */}
          <QRCodeSVG
            value={card.spotifyUrl}
            size={96}
            marginSize={2}
            role="img"
            aria-label="QR code para ouvir no Spotify"
            className="shrink-0 rounded-sm [&>path:first-child]:fill-background dark:[&>path:first-child]:fill-foreground [&>path:last-child]:fill-foreground dark:[&>path:last-child]:fill-background"
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        {guess ? (
          <>
            <p className="text-sm font-medium">Palpite de {playerName}</p>
            <Sequence key={card.id}>
              <Mark ok={guess.correct} label="Posição" />
              <Mark ok={guess.titleOk} label="Música">
                {typed(guess.title)}
              </Mark>
              <Mark ok={guess.artistOk} label="Artista">
                {typed(guess.artist)}
              </Mark>
            </Sequence>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{playerName} ficou sem tempo</p>
        )}
        {reveal.contests.length > 0 ? (
          <Sequence key={card.id}>
            {reveal.contests.map((c) => (
              <Mark key={c.playerId} ok={c.correct} label={`${name(c.playerId)} contestou:`} />
            ))}
          </Sequence>
        ) : null}
      </div>
      <p className="text-sm">
        {reveal.receiverId ? `${name(reveal.receiverId)} levou a carta` : "Ninguém levou a carta"}
        {reveal.tokenAwarded ? ` · +1 ficha para ${playerName}` : ""}
      </p>
    </section>
  );
}
