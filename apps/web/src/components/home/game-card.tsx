"use client";

import { GameRules } from "@/components/game-rules";
import { useReduced } from "@/components/hitline/motion";
import { GAME_RULES, type GameType } from "@/lib/game-rules";
import { cn } from "@/lib/utils";
import { motion, useSpring, useTransform } from "motion/react";
import { type PointerEvent, useId, useState } from "react";
import { GameIllustration } from "./game-illustration";

export function GameCard({ game }: { game: GameType }) {
  const [flipped, setFlipped] = useState(false);
  const id = useId();
  const rules = GAME_RULES[game];
  const reducedMotion = useReduced();
  const pointerX = useSpring(0, { duration: 0.5, bounce: 0.2 });
  const pointerY = useSpring(0, { duration: 0.5, bounce: 0.2 });
  const tilt = useTransform(
    () =>
      `perspective(1000px) rotateX(${Math.max(-5, Math.min(5, -pointerY.get() * 5))}deg) rotateY(${Math.max(-5, Math.min(5, pointerX.get() * 5))}deg)`,
  );
  const artwork = useTransform(
    () => `translate3d(${pointerX.get() * 10}px, ${pointerY.get() * 10}px, 0)`,
  );
  const copy = useTransform(
    () => `translate3d(${pointerX.get() * 3}px, ${pointerY.get() * 3}px, 0)`,
  );

  function resetTilt() {
    pointerX.set(0);
    pointerY.set(0);
  }

  function followPointer(event: PointerEvent<HTMLButtonElement>) {
    if (
      reducedMotion ||
      flipped ||
      event.pointerType !== "mouse" ||
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches
    )
      return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set(Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width) * 2 - 1)));
    pointerY.set(Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height) * 2 - 1)));
  }
  return (
    <button
      type="button"
      aria-label={rules.name}
      aria-describedby={flipped ? `${id}-rules` : id}
      aria-pressed={flipped}
      data-game={game}
      className="game-card rounded-lg text-left text-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-ring active:outline-2 active:outline-border-strong"
      onPointerMove={followPointer}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
      onBlur={resetTilt}
      onClick={() => {
        resetTilt();
        setFlipped(!flipped);
      }}
    >
      {flipped ? (
        <span id={`${id}-rules`} className="sr-only">
          {rules.rules.join(" ")}
        </span>
      ) : null}
      <motion.span
        className={cn(
          "game-card-tilt grid h-full rounded-lg",
          game === "hitline" ? "bg-game-hitline" : "bg-game-huehint",
        )}
        style={{ transform: reducedMotion ? "none" : tilt }}
      >
        <span className="game-card-inner">
          <span
            data-face="front"
            aria-hidden={flipped}
            className="game-card-face game-card-front flex flex-col justify-between gap-6"
          >
            <motion.span
              className="w-full max-w-xs self-center"
              style={{ transform: reducedMotion ? "none" : artwork }}
            >
              <GameIllustration game={game} />
            </motion.span>
            <motion.span
              className="flex flex-col gap-2"
              style={{ transform: reducedMotion ? "none" : copy }}
            >
              <span className="text-xl leading-7 font-semibold">{rules.name}</span>
              <span id={id} className="text-base leading-6">
                {rules.summary}
              </span>
              <span className="text-sm">{rules.players}</span>
            </motion.span>
          </span>
          <span data-face="back" aria-hidden={!flipped} className="game-card-face game-card-back">
            <GameRules game={game} variant="short" />
          </span>
        </span>
      </motion.span>
    </button>
  );
}
