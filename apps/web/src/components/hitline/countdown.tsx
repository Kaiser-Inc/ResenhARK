"use client";

import { useEffect, useState } from "react";

import type { ServerClock } from "@/lib/server-clock";

/** Whole seconds left until `deadline`, by the server clock; never below 0. */
export function secondsLeft(deadline: number, clock: ServerClock): number {
  return Math.max(0, Math.ceil((deadline - clock.now()) / 1000));
}

/** Re-renders every 250 ms and returns the whole seconds left until `deadline`. */
export function useSecondsLeft(deadline: number, clock: ServerClock): number {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  return secondsLeft(deadline, clock);
}

export function Countdown({ deadline, clock }: { deadline: number; clock: ServerClock }) {
  const seconds = useSecondsLeft(deadline, clock);
  return (
    <span
      role="timer"
      aria-label="Tempo restante"
      className="font-mono text-base font-semibold tabular-nums"
    >
      {seconds}s
    </span>
  );
}
