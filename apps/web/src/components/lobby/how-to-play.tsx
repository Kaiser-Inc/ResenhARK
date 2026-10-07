"use client";

import { GameRules } from "@/components/game-rules";
import { Button } from "@/components/ui/button";
import { GAME_RULES, type RulesSetup } from "@/lib/game-rules";
import { ChevronDownIcon } from "lucide-react";
import { useId, useState } from "react";

export function HowToPlay({ setup }: { setup: RulesSetup }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className="flex flex-col gap-4">
      <Button
        type="button"
        variant="ghost"
        className="self-start px-0"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        Como jogar {GAME_RULES[setup.type].name}
        <ChevronDownIcon
          aria-hidden="true"
          strokeWidth={1.75}
          className={open ? "rotate-180" : undefined}
        />
      </Button>
      <div id={id} hidden={!open}>
        <GameRules game={setup.type} setup={setup} />
      </div>
    </section>
  );
}
