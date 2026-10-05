import confetti from "canvas-confetti";

const TOKENS = ["--primary", "--primary-text", "--success", "--warning"];
const SENTINEL = "#010203";

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
    ctx.fillStyle = SENTINEL;
    ctx.fillStyle = value;
    // An unparsable value leaves the sentinel in place: skip it instead of painting black.
    if (ctx.fillStyle === SENTINEL) continue;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    colors.push(`#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`);
  }
  return colors;
}

/** One burst of confetti in the theme tokens, on a canvas hidden from assistive tech. */
export function fireConfetti() {
  const colors = tokenColors();
  if (colors.length === 0) return;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "100",
  });
  document.body.appendChild(canvas);
  const fire = confetti.create(canvas, { resize: true, disableForReducedMotion: true });
  void Promise.resolve(fire({ particleCount: 90, spread: 80, origin: { y: 0.4 }, colors })).finally(
    () => canvas.remove(),
  );
}
