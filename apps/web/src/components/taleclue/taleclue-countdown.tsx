"use client";

import type { ServerClock } from "@/lib/server-clock";
import { taleclueTiming } from "@/lib/taleclue-guidance";
import { cn } from "@/lib/utils";
import type { TaleclueView } from "@resenhark/shared";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const CIRCUMFERENCE = 2 * Math.PI * 18;
export function TaleclueCountdown({
  view,
  clock,
  canAct,
  announcements,
}: { view: TaleclueView; clock: ServerClock; canAct: boolean; announcements?: Set<string> }) {
  const timing = taleclueTiming(view, clock.now(), canAct);
  const phaseKey = `${view.round}:${view.phase}`;
  const localAnnouncements = useRef(new Set<string>());
  const announced = announcements ?? localAnnouncements.current;
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (!timing.urgent || announced.has(phaseKey)) return;
    announced.add(phaseKey);
    setAnnouncement(phaseKey);
  }, [timing.urgent, phaseKey, announced]);
  return (
    <>
      <motion.span
        data-urgent={timing.urgent}
        data-time-fraction={timing.fraction}
        className={cn(
          "relative inline-flex size-12 shrink-0 items-center justify-center",
          timing.urgent && "text-destructive",
        )}
        animate={{
          transform: timing.urgent ? ["scale(1)", "scale(1.08)", "scale(1)"] : "scale(1)",
        }}
        transition={
          timing.urgent
            ? { duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
            : { duration: 0.2 }
        }
      >
        <svg aria-hidden="true" viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
          <circle cx="22" cy="22" r="18" fill="none" strokeWidth="3" className="stroke-border" />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            className={
              timing.urgent
                ? "stroke-destructive"
                : canAct
                  ? "stroke-primary-text"
                  : "stroke-muted-foreground"
            }
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - timing.fraction)}
          />
        </svg>
        <span
          role="timer"
          aria-label="Tempo restante"
          className={cn(
            "font-mono font-semibold tabular-nums",
            timing.seconds > 99 ? "text-xs" : "text-sm",
          )}
        >
          {timing.seconds}s
        </span>
      </motion.span>
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement === phaseKey ? "Faltam 10 segundos." : ""}
      </span>
    </>
  );
}
