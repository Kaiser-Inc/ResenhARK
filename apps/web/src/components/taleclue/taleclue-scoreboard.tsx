"use client";

import { MemberAvatar } from "@/components/avatar/member-avatar";
import {
  taleclueBoardCell,
  taleclueMovePath,
  taleclueMovePosition,
  taleclueStackOffset,
} from "@/lib/taleclue";
import { cn } from "@/lib/utils";
import type { MemberView, TaleclueStep, TaleclueView } from "@resenhark/shared";
import { CheckIcon, FlagIcon } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

type BoardMove = Extract<TaleclueStep, { type: "board-move" }>["moves"][number];
type PawnProps = {
  player: TaleclueView["players"][number];
  member?: MemberView;
  move?: BoardMove;
  elapsed: number;
  target: number;
  columns: number;
  number: number;
  offset: { x: number; y: number };
  highlighted: boolean;
};

function TalecluePawn({
  player,
  member,
  move,
  elapsed,
  target,
  columns,
  number,
  offset,
  highlighted,
}: PawnProps) {
  const position = move ? taleclueMovePosition(move.from, move.to, elapsed) : player.position;
  // A mount or responsive remount seeks the server clock and only plays the remaining path.
  const [animation] = useState(() => {
    const route = move && elapsed >= 9600 ? taleclueMovePath(position, move.to) : [position];
    const cells = route.map((house) => taleclueBoardCell(house, target, columns));
    return {
      left: cells.map((cell) => `${cell.x}%`),
      top: cells.map((cell) => cell.y + 24),
      duration: move && elapsed >= 9600 ? Math.max(0, 12000 - elapsed) / 1000 : 0,
    };
  });
  const moving = !!move && move.from !== move.to && elapsed >= 9600 && elapsed < 12000;
  const size = columns === 6 ? 16 : 20;
  return (
    <motion.span
      data-player-id={player.id}
      data-position={position}
      data-moving={moving}
      aria-hidden="true"
      className="absolute z-10"
      initial={{ left: animation.left[0], top: animation.top[0] }}
      animate={{ left: animation.left, top: animation.top }}
      transition={{ duration: animation.duration, ease: "linear" }}
    >
      <span
        className={cn(
          "relative inline-flex rounded-full",
          highlighted && "taleclue-selection taleclue-attention",
        )}
        style={{
          width: size,
          height: size,
          transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px)`,
        }}
      >
        {member ? <MemberAvatar name={member.name} avatar={member.avatar} size={size} /> : null}
        <span className="absolute -bottom-1 -right-1 rounded-sm bg-background px-0.5 font-mono text-[10px] leading-3 text-foreground">
          {number}
        </span>
      </span>
    </motion.span>
  );
}

export function TaleclueScoreboard({
  view,
  members,
  moves = [],
  elapsed = 15000,
  focusedPlayers = [],
}: {
  view: TaleclueView;
  members: MemberView[];
  moves?: BoardMove[];
  elapsed?: number;
  focusedPlayers?: string[];
}) {
  const board = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(6);
  useEffect(() => {
    const node = board.current;
    if (!node) return;
    const resize = new ResizeObserver(([entry]) =>
      setColumns(entry.contentRect.width >= 760 ? 10 : 6),
    );
    resize.observe(node);
    return () => resize.disconnect();
  }, []);
  const target = view.config.targetPoints;
  const cells = Array.from({ length: target + 1 }, (_, position) => ({
    position,
    ...taleclueBoardCell(position, target, columns),
  }));
  const rowHeight = columns === 10 ? 104 : 80;
  const height = Math.ceil((target + 1) / columns) * rowHeight;
  const positions = view.players.map((player) => {
    const move = moves.find((move) => move.playerId === player.id);
    return move ? taleclueMovePosition(move.from, move.to, elapsed) : player.position;
  });
  const name = (id: string) => members.find((member) => member.id === id)?.name ?? id;
  return (
    <section aria-label="Tabuleiro" className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold">Tabuleiro</h2>
      <div
        ref={board}
        data-taleclue-path
        data-columns={columns}
        className="relative w-full"
        style={{ height }}
      >
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full"
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          fill="none"
        >
          <path
            d={cells.map((cell, index) => `${index ? "L" : "M"}${cell.x} ${cell.y + 12}`).join(" ")}
            stroke="var(--border-strong)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {cells.map((cell, position) => (
          <div
            key={cell.position}
            data-board-cell={position}
            data-x={cell.x}
            data-y={cell.y}
            aria-hidden="true"
            className="absolute flex items-start justify-center rounded-md bg-muted pt-1 font-mono text-xs tabular-nums"
            style={{
              left: `${(cell.column * 100) / columns}%`,
              top: cell.y,
              width: `calc(${100 / columns}% - 4px)`,
              height: rowHeight - 4,
            }}
          >
            {position}
            {position === target ? (
              <FlagIcon className="ml-1 size-3 text-primary-text" strokeWidth={1.75} />
            ) : null}
          </div>
        ))}
        {view.players.map((player, index) => {
          const position = positions[index];
          const stack = view.players.filter((_, other) => positions[other] === position);
          const slot = stack.findIndex((other) => other.id === player.id);
          const acted =
            (view.phase === "decoy" || view.phase === "vote") && view.acted.includes(player.id);
          return (
            <TalecluePawn
              key={`${player.id}:${view.round}:${view.phase}:${columns}:${elapsed >= 9600 ? "move" : "wait"}`}
              player={player}
              member={members.find((member) => member.id === player.id)}
              move={moves.find((move) => move.playerId === player.id)}
              elapsed={elapsed}
              target={target}
              columns={columns}
              number={index + 1}
              offset={taleclueStackOffset(slot, stack.length, columns === 6 ? 18 : 22)}
              highlighted={
                focusedPlayers.includes(player.id) ||
                acted ||
                (view.phase === "clue" && player.id === view.narratorId)
              }
            />
          );
        })}
      </div>
      <ul className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {view.players.map((player, index) => {
          const member = members.find((member) => member.id === player.id);
          const acted =
            (view.phase === "decoy" || view.phase === "vote") && view.acted.includes(player.id);
          return (
            <li
              key={player.id}
              data-legend-player-id={player.id}
              className="flex min-w-0 items-center gap-2 text-sm"
            >
              <span className="font-mono text-xs tabular-nums">{index + 1}</span>
              <span
                className={cn(
                  "relative inline-flex rounded-full",
                  acted && "taleclue-selection taleclue-attention",
                )}
              >
                {member ? (
                  <MemberAvatar
                    name={member.name}
                    avatar={member.avatar}
                    online={player.online}
                    size={24}
                  />
                ) : null}
                {acted ? (
                  <CheckIcon
                    aria-hidden="true"
                    data-acted
                    className="absolute -right-1 -top-1 size-3 rounded-full bg-background text-primary-text"
                    strokeWidth={1.75}
                  />
                ) : null}
              </span>
              <span className="min-w-0 flex-1 break-words font-medium">{name(player.id)}</span>
              <span className="shrink-0 text-right font-mono text-xs tabular-nums">
                <span className="block">{player.points} pontos</span>
                <span className="text-muted-foreground">
                  {positions[index]} / {target}
                </span>
              </span>
              {acted ? (
                <span className="sr-only" aria-live="polite">
                  {name(player.id)}:{" "}
                  {view.phase === "decoy"
                    ? "Iscas enviadas. Aguardando os outros jogadores."
                    : "Voto enviado. Aguardando os outros jogadores."}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {moves.length > 0 && elapsed >= 12000
          ? view.players
              .map(
                (player) =>
                  `${name(player.id)}: ${player.points} pontos, ${player.position} / ${target}`,
              )
              .join("; ")
          : ""}
      </output>
    </section>
  );
}
