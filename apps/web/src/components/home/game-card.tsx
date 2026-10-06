"use client";

import { GameRules } from "@/components/game-rules";
import { GAME_RULES, type GameType } from "@/lib/game-rules";
import { cn } from "@/lib/utils";
import { useId, useState } from "react";
import { GameIllustration } from "./game-illustration";

export function GameCard({ game }: { game: GameType }) {
  const [flipped, setFlipped] = useState(false);
  const id = useId();
  const rules = GAME_RULES[game];
  return (
    <button
      type="button"
      aria-label={rules.name}
      aria-describedby={flipped ? `${id}-rules` : id}
      aria-pressed={flipped}
      data-game={game}
      className={cn(
        "game-card rounded-lg text-left text-foreground outline-hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring active:outline-2 active:outline-border-strong",
        game === "hitline" ? "bg-game-hitline" : "bg-game-huehint",
      )}
      onClick={() => setFlipped(!flipped)}
    >
      {flipped ? (
        <span id={`${id}-rules`} className="sr-only">
          {rules.rules.join(" ")}
        </span>
      ) : null}
      <span className="game-card-inner">
        <span
          data-face="front"
          aria-hidden={flipped}
          className="game-card-face game-card-front flex flex-col justify-between gap-6"
        >
          <GameIllustration game={game} />
          <span className="flex flex-col gap-2">
            <span className="text-xl leading-7 font-semibold">{rules.name}</span>
            <span id={id} className="text-base leading-6">
              {rules.summary}
            </span>
            <span className="text-sm">{rules.players}</span>
          </span>
        </span>
        <span data-face="back" aria-hidden={!flipped} className="game-card-face game-card-back">
          <GameRules game={game} variant="short" />
        </span>
      </span>
    </button>
  );
}
