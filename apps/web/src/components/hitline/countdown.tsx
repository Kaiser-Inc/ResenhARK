"use client";

import { useEffect, useState } from "react";

import type { ServerClock } from "@/lib/server-clock";

/** Whole seconds left until `deadline`, by the server clock; never below 0. */
export function secondsLeft(deadline: number, clock: ServerClock): number {
  return Math.max(0, Math.ceil((deadline - clock.now()) / 1000));
}

export function Countdown({ deadline, clock }: { deadline: number; clock: ServerClock }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  return (
    <span role="timer" className="font-mono text-base font-semibold tabular-nums">
      {secondsLeft(deadline, clock)}s
    </span>
  );
}
