/** Game motion tokens. Decorative only: nothing here may delay state or block input. */
export const FADE = { duration: 0.12, ease: "easeOut" } as const;
export const SPRING = { type: "spring", stiffness: 260, damping: 22 } as const;
export const CARD_MOTION = { duration: 0.24, ease: [0.23, 1, 0.32, 1] } as const;
export const CARD_LAND_DELAY = 0.24;
export const SCORE_DELAY = 0.4;
export const ODOMETER_SECONDS = 0.28;
export const STAGGER_SECONDS = 0.04;

/** Product direction: keep the complete game motion regardless of the system preference. */
export function useReduced(): boolean {
  return false;
}
