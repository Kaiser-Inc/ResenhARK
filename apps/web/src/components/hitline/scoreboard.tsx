"use client";

import type { HitlineView, MemberView } from "@resenhark/shared";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { MemberAvatar } from "@/components/avatar/member-avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ScoreboardProps = {
  view: HitlineView;
  members: MemberView[];
};

export function Scoreboard({ view, members }: ScoreboardProps) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section aria-label="Placar">
      <ul className="flex flex-col">
        {view.players.map((player) => {
          const member = members.find((m) => m.id === player.id);
          if (!member) return null;
          const expanded = open === player.id;
          return (
            <li key={player.id}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : player.id)}
                className="flex min-h-10 w-full items-center gap-3 rounded-md px-1 py-1 text-left text-sm transition-colors duration-[120ms] ease-out outline-hidden hover:bg-accent focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <MemberAvatar
                  name={member.name}
                  avatar={member.avatar}
                  size={32}
                  className={cn(!player.online && "opacity-50")}
                />
                <span title={member.name} className="min-w-0 flex-1 truncate font-medium">
                  {member.name}
                </span>
                {player.online ? null : <Badge>offline</Badge>}
                <span className="font-mono tabular-nums">
                  <span className="sr-only">cartas </span>
                  {player.timeline.length}/{view.config.targetCards}
                </span>
                <span className="w-16 text-right text-muted-foreground">
                  {player.tokens} {player.tokens === 1 ? "ficha" : "fichas"}
                </span>
                <ChevronDownIcon
                  aria-hidden="true"
                  strokeWidth={1.75}
                  className={cn(
                    "size-4 shrink-0 transition-transform duration-[120ms] ease-out",
                    expanded && "rotate-180",
                  )}
                />
              </button>
              {expanded ? (
                <p className="pb-2 pl-11 font-mono text-sm text-muted-foreground">
                  {player.timeline.map((c) => c.year).join(" · ") || "Sem cartas"}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
