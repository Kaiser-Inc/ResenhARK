"use client";

import { MemberAvatar } from "@/components/avatar/member-avatar";
import { cn } from "@/lib/utils";
import type { MemberView, TaleclueStep, TaleclueView } from "@resenhark/shared";
import { CheckIcon } from "lucide-react";
import { motion } from "motion/react";

export function TaleclueScoreboard({
  view,
  members,
  moves = [],
  moving = false,
  seek = false,
  focusedPlayers = [],
}: {
  view: TaleclueView;
  members: MemberView[];
  moves?: Extract<TaleclueStep, { type: "board-move" }>["moves"];
  moving?: boolean;
  seek?: boolean;
  focusedPlayers?: string[];
}) {
  return (
    <section aria-label="Tabuleiro" className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Tabuleiro</h2>
      <ul className="flex flex-col gap-3">
        {view.players.map((player) => {
          const member = members.find((member) => member.id === player.id);
          const move = moves.find((move) => move.playerId === player.id);
          const position = move ? (moving ? move.to : move.from) : player.position;
          const acted =
            (view.phase === "decoy" || view.phase === "vote") && view.acted.includes(player.id);
          const focused =
            focusedPlayers.includes(player.id) ||
            acted ||
            (view.phase === "clue" && view.narratorId === player.id);
          return (
            <li
              key={player.id}
              data-player-id={player.id}
              data-position={position}
              className="flex items-center gap-3"
            >
              {member ? (
                <span
                  className={cn(
                    "relative inline-flex rounded-full",
                    focused &&
                      "taleclue-attention ring-2 ring-ring ring-offset-2 ring-offset-background",
                  )}
                >
                  <MemberAvatar
                    name={member.name}
                    avatar={member.avatar}
                    online={player.online}
                    size={24}
                  />
                  {acted ? (
                    <CheckIcon
                      aria-hidden="true"
                      data-acted
                      className="absolute -right-1 -top-1 size-3 rounded-full bg-background text-primary-text"
                      strokeWidth={1.75}
                    />
                  ) : null}
                </span>
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{member?.name ?? player.id}</span>
                  {acted ? (
                    <span className="sr-only" aria-live="polite">
                      {member?.name ?? player.id}:{" "}
                      {view.phase === "decoy"
                        ? "Iscas enviadas. Aguardando os outros jogadores."
                        : "Voto enviado. Aguardando os outros jogadores."}
                    </span>
                  ) : null}
                  <span className="flex shrink-0 flex-col items-end font-mono tabular-nums">
                    {view.phase === "game-over" ? <span>{player.points} pontos</span> : null}
                    {position} / {view.config.targetPoints}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-sm bg-muted">
                  <motion.div
                    className="h-full rounded-sm bg-primary"
                    initial={false}
                    style={{ transformOrigin: "left" }}
                    animate={{ transform: `scaleX(${position / view.config.targetPoints})` }}
                    transition={{ duration: seek ? 0 : 1.8, ease: [0.23, 1, 0.32, 1] }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
