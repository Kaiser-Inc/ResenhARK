import type { Hsb, HuehintView } from "@resenhark/shared";

/** HSV brightness differs from HSL lightness. */
export function hsbToCss({ h, s, b }: Hsb): string {
  const lightness = (b / 100) * (1 - s / 200);
  const saturation =
    lightness === 0 || lightness === 1
      ? 0
      : (b / 100 - lightness) / Math.min(lightness, 1 - lightness);
  return `hsl(${h} ${(saturation * 100).toFixed(2)}% ${(lightness * 100).toFixed(2)}%)`;
}

export const formatScore = (score: number): string => score.toFixed(2).replace(".", ",");
export const describeHsb = ({ h, s, b }: Hsb): string => `H ${h}° · S ${s}% · B ${b}%`;

/** Projection and role alone decide which interaction can be shown. */
export function huehintScreen(view: HuehintView, you: string) {
  const player = view.players.some((p) => p.id === you);
  if (view.phase === "game-over") return "result";
  if (view.phase === "reveal") return "reveal";
  if (view.phase === "memorize") return player && view.color ? "memorize" : "waiting";
  if (view.phase === "hint") return player && view.giverId === you ? "hint" : "waiting";
  if (!player) return "spectator";
  if (view.giverId === you) return "giver";
  return view.myGuess ? "submitted" : "guess";
}
