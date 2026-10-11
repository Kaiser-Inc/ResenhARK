"use client";

import { MemberAvatar } from "@/components/avatar/member-avatar";
import type { ServerClock } from "@/lib/server-clock";
import {
  taleclueBoardCell,
  taleclueBoardLayout,
  taleclueMovePosition,
  taleclueMoveRoute,
  taleclueRevealElapsed,
  taleclueStackOffset,
} from "@/lib/taleclue";
import { cn } from "@/lib/utils";
import type { MemberView, TaleclueStep, TaleclueView } from "@resenhark/shared";
import { CheckIcon, ChevronsDownIcon, FlagIcon } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";

type BoardMove = Extract<TaleclueStep, { type: "board-move" }>["moves"][number];
type PawnProps = {
  player: TaleclueView["players"][number];
  member?: MemberView;
  move?: BoardMove;
  elapsed: number;
  target: number;
  width: number;
  columns: number;
  rowHeight: number;
  number: number;
  offset: { x: number; y: number };
  highlighted: boolean;
  paused: boolean;
};

function TalecluePawn({
  player,
  member,
  move,
  elapsed,
  target,
  width,
  columns,
  rowHeight,
  number,
  offset,
  highlighted,
  paused,
}: PawnProps) {
  const position = move ? taleclueMovePosition(move.from, move.to, elapsed) : player.position;
  // Remount only for geometry/phase changes: each route seeks the same server deadline.
  const [animation] = useState(() => {
    const cell = taleclueBoardCell(position, target, columns, rowHeight);
    const route =
      move && elapsed >= 9600
        ? taleclueMoveRoute(move.from, move.to, elapsed, target, columns, rowHeight)
        : { x: [cell.x], y: [cell.y], times: [0], duration: 0 };
    const remaining = paused
      ? { x: [route.x[0]], y: [route.y[0]], times: [0], duration: 0 }
      : route;
    return {
      ...remaining,
      x: remaining.x.map((x) => (x * width) / 100 + offset.x),
      y: remaining.y.map((y) => y + 34 + offset.y),
    };
  });
  const moving = !paused && !!move && move.from !== move.to && elapsed >= 9600 && elapsed < 12000;
  return (
    <motion.span
      data-player-id={player.id}
      data-position={position}
      data-moving={moving}
      aria-hidden="true"
      className="absolute left-0 top-0 z-10"
      initial={{ x: animation.x[0], y: animation.y[0] }}
      animate={{ x: animation.x, y: animation.y }}
      transition={{ duration: animation.duration, ease: "linear", times: animation.times }}
    >
      <span
        className={cn(
          "relative inline-flex size-6 rounded-full -translate-x-1/2 taleclue-pawn",
          highlighted && "taleclue-selection taleclue-attention",
        )}
      >
        {member ? <MemberAvatar name={member.name} avatar={member.avatar} size={24} /> : null}
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
  elapsed: projectedElapsed = 15000,
  clock,
  focusedPlayers = [],
}: {
  view: TaleclueView;
  members: MemberView[];
  moves?: BoardMove[];
  elapsed?: number;
  clock?: ServerClock;
  focusedPlayers?: string[];
}) {
  const board = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLElement>(null);
  const title = useId();
  const [width, setWidth] = useState(288);
  const [viewportState, setViewportState] = useState({ height: 384, top: 0 });
  useEffect(() => {
    const node = board.current;
    if (!node) return;
    const resize = new ResizeObserver(() => {
      setWidth(node.clientWidth);
      const scroll = viewport.current;
      if (scroll) setViewportState({ height: scroll.clientHeight, top: scroll.scrollTop });
    });
    resize.observe(node);
    if (viewport.current) resize.observe(viewport.current);
    return () => resize.disconnect();
  }, []);
  const elapsed =
    clock && view.phase === "reveal" && view.deadline !== null
      ? taleclueRevealElapsed(view.deadline, clock.now())
      : projectedElapsed;
  const paused = view.phase === "reveal" && view.deadline === null;
  const target = view.config.targetPoints;
  const layout = taleclueBoardLayout(width, target);
  const boardWidth = layout.cellWidth * layout.columns;
  const cells = Array.from({ length: target + 1 }, (_, position) => ({
    position,
    ...taleclueBoardCell(position, target, layout.columns, layout.rowHeight),
  }));
  const positions = view.players.map((player) => {
    const move = moves.find((move) => move.playerId === player.id);
    return move ? taleclueMovePosition(move.from, move.to, elapsed) : player.position;
  });
  const followPosition = moves.find((move) => move.from !== move.to);
  const followY = followPosition
    ? taleclueBoardCell(
        taleclueMovePosition(followPosition.from, followPosition.to, elapsed),
        target,
        layout.columns,
        layout.rowHeight,
      ).y
    : null;
  useEffect(() => {
    const node = viewport.current;
    if (paused || !node || followY === null || elapsed < 9600 || elapsed > 12000) return;
    const center = followY + layout.rowHeight / 2;
    if (center < node.scrollTop + 64 || center > node.scrollTop + node.clientHeight - 64)
      node.scrollTop = Math.max(0, center - node.clientHeight / 2);
  }, [followY, elapsed, layout.rowHeight, paused]);
  const name = (id: string) => members.find((member) => member.id === id)?.name ?? id;
  return (
    <section aria-label="Tabuleiro" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={title} className="text-sm font-semibold">
          Tabuleiro
        </h2>
        <span className="text-xs text-muted-foreground">Meta: {target} pontos</span>
      </div>
      <section
        ref={viewport}
        aria-label="Avanço no tabuleiro"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The scrollable board needs keyboard access.
        tabIndex={0}
        onScroll={(event) =>
          setViewportState({
            height: event.currentTarget.clientHeight,
            top: event.currentTarget.scrollTop,
          })
        }
        data-board-viewport
        className="relative max-h-[384px] overflow-auto rounded-lg border border-border bg-card p-1 outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 xl:max-h-[512px]"
      >
        <div
          ref={board}
          data-taleclue-path
          data-columns={layout.columns}
          className="relative w-full"
          style={{ height: layout.height, minWidth: 96 }}
        >
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full"
            viewBox={`0 0 ${boardWidth} ${layout.height}`}
            fill="none"
          >
            <path
              d={cells
                .map((cell, i) => `${i ? "L" : "M"}${(cell.x * boardWidth) / 100} ${cell.y + 64}`)
                .join(" ")}
              stroke="var(--border-strong)"
              strokeWidth="12"
              strokeLinejoin="round"
            />
          </svg>
          {cells.map((cell) => (
            <div
              key={cell.position}
              data-board-cell={cell.position}
              data-x={cell.x}
              data-y={cell.y}
              aria-hidden="true"
              className="absolute taleclue-house"
              style={{
                left: `${(cell.column * 100) / layout.columns}%`,
                top: cell.y,
                width: `${100 / layout.columns}%`,
                height: layout.rowHeight,
              }}
            >
              <span className="taleclue-house-surface absolute inset-x-1 top-1 bottom-2 rounded-lg bg-muted" />
              <span className="absolute inset-x-0 top-3 flex items-center justify-center gap-1 font-mono text-xs tabular-nums">
                {cell.position}
                {cell.position === target ? (
                  <FlagIcon className="size-3 text-primary-text" strokeWidth={1.75} />
                ) : null}
              </span>
            </div>
          ))}
          {view.players.map((player, index) => {
            const acted =
              (view.phase === "decoy" || view.phase === "vote") && view.acted.includes(player.id);
            return (
              <TalecluePawn
                key={`${player.id}:${view.round}:${view.phase}:${view.deadline ?? "paused"}:${width}:${elapsed >= 9600 ? "move" : "wait"}`}
                player={player}
                member={members.find((member) => member.id === player.id)}
                move={moves.find((move) => move.playerId === player.id)}
                elapsed={elapsed}
                paused={paused}
                target={target}
                width={boardWidth}
                columns={layout.columns}
                rowHeight={layout.rowHeight}
                number={index + 1}
                offset={taleclueStackOffset(index, view.players.length)}
                highlighted={
                  focusedPlayers.includes(player.id) ||
                  acted ||
                  (view.phase === "clue" && player.id === view.narratorId)
                }
              />
            );
          })}
        </div>
      </section>
      {layout.height > viewportState.height ? (
        <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          Role para acompanhar a trilha.
          {layout.height > viewportState.height + viewportState.top + 1 ? (
            <ChevronsDownIcon data-board-more aria-hidden="true" className="size-4" />
          ) : null}
        </p>
      ) : null}
      <ul
        className="grid gap-x-6 gap-y-3"
        style={{
          gridTemplateColumns: width >= 480 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)",
        }}
      >
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
