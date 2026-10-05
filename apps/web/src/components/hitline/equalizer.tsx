"use client";

import { motion } from "motion/react";

import { useReduced } from "@/components/hitline/motion";

const BARS = [0.55, 0.7, 0.5, 0.65, 0.6];

/** Five decorative bars that dance while the snippet plays and rest when it is paused. */
export function Equalizer({ playing }: { playing: boolean }) {
  const reduce = useReduced();
  const dancing = playing && !reduce;
  return (
    <span aria-hidden="true" className="flex h-5 shrink-0 items-end gap-0.5">
      {BARS.map((duration, i) => (
        <motion.span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed list of five identical bars
          key={i}
          className="h-full w-[3px] origin-bottom rounded-sm bg-primary-text"
          style={{ scaleY: 0.3 }}
          animate={dancing ? { scaleY: [0.3, 1, 0.45, 0.85, 0.3] } : { scaleY: 0.3 }}
          transition={
            dancing
              ? { duration, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: i * 0.08 }
              : { duration: 0.12 }
          }
        />
      ))}
    </span>
  );
}
