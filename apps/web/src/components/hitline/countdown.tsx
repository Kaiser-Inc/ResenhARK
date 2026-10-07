"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";

import { useReduced } from "@/components/hitline/motion";

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

const RING = 18;
const CIRCUMFERENCE = 2 * Math.PI * RING;

/** Seconds text inside an SVG ring that empties with the time; pulses in the last 5 s. */
export function Countdown({ deadline, clock }: { deadline: number; clock: ServerClock }) {
  const seconds = useSecondsLeft(deadline, clock);
  const reduce = useReduced();
  // The ring is relative to the time left when the countdown appeared (the parent keys it by deadline).
  const [total] = useState(() => Math.max(1, secondsLeft(deadline, clock)));
  const pulse = !reduce && seconds > 0 && seconds <= 5;
  return (
    <motion.span
      className="relative inline-flex size-12 shrink-0 items-center justify-center"
      animate={
        pulse ? { transform: ["scale(1)", "scale(1.1)", "scale(1)"] } : { transform: "scale(1)" }
      }
      transition={pulse ? { duration: 1, repeat: Number.POSITIVE_INFINITY } : { duration: 0.12 }}
    >
      <svg aria-hidden="true" viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r={RING} fill="none" strokeWidth="3" className="stroke-border" />
        <circle
          cx="22"
          cy="22"
          r={RING}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className="stroke-primary-text"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - Math.min(1, seconds / total))}
          style={reduce ? undefined : { transition: "stroke-dashoffset 250ms linear" }}
        />
      </svg>
      <span
        role="timer"
        aria-label="Tempo restante"
        className={`font-mono font-semibold tabular-nums ${seconds > 99 ? "text-xs" : "text-sm"}`}
      >
        {seconds}s
      </span>
    </motion.span>
  );
}
