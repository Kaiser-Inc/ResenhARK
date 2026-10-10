"use client";

import { MemberAvatar } from "@/components/avatar/member-avatar";
import type { MemberView, TaleclueStep, TaleclueView } from "@resenhark/shared";
import { motion } from "motion/react";

export function TaleclueScoreboard({
  view,
  members,
  moves = [],
  moving = false,
  seek = false,
}: {
  view: TaleclueView;
  members: MemberView[];
  moves?: Extract<TaleclueStep, { type: "board-move" }>["moves"];
  moving?: boolean;
  seek?: boolean;
}) {
  return (
    <section aria-label="Tabuleiro" className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Tabuleiro</h2>
      <ul className="flex flex-col gap-3">
        {view.players.map((player) => {
          const member = members.find((member) => member.id === player.id);
          const move = moves.find((move) => move.playerId === player.id);
          const position = move ? (moving ? move.to : move.from) : player.position;
          return (
            <li
              key={player.id}
              data-player-id={player.id}
              data-position={position}
              className="flex items-center gap-3"
            >
              {member ? (
                <MemberAvatar
                  name={member.name}
                  avatar={member.avatar}
                  online={player.online}
                  size={24}
                />
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{member?.name ?? player.id}</span>
                  <span className="font-mono tabular-nums">
                    {position} / {view.config.targetPoints}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-primary"
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
