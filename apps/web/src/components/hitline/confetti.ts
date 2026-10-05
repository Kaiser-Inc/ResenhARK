import confetti from "canvas-confetti";

const TOKENS = ["--primary", "--primary-text", "--success", "--warning"];

/** canvas-confetti does not parse oklch(): a 1x1 canvas resolves any CSS color to RGB. */
function tokenColors(): string[] {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  const style = getComputedStyle(document.documentElement);
  const colors: string[] = [];
  for (const token of TOKENS) {
    const value = style.getPropertyValue(token).trim();
    if (!value) continue;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    colors.push(`#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`);
  }
  return colors;
}

/** One burst of confetti in the theme tokens. Callers skip it under reduced motion. */
export function fireConfetti() {
  const colors = tokenColors();
  void confetti({
    particleCount: 90,
    spread: 80,
    origin: { y: 0.4 },
    colors: colors.length ? colors : undefined,
    disableForReducedMotion: true,
  });
}
