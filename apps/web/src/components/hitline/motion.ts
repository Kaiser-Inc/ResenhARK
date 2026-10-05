import { useReducedMotion } from "motion/react";

/** Game motion tokens. Decorative only: nothing here may delay state or block input. */
export const FADE = { duration: 0.12, ease: "easeOut" } as const;
export const SPRING = { type: "spring", stiffness: 260, damping: 22 } as const;
export const ODOMETER_SECONDS = 0.6;
export const STAGGER_SECONDS = 0.12;

/** `prefers-reduced-motion: reduce`: every moment becomes an opacity fade, no x/y/scale/rotate. */
export function useReduced(): boolean {
  return useReducedMotion() ?? false;
}
