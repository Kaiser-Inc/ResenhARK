"use client";

import { Button } from "@/components/ui/button";
import { describeHsb, hsbToCss } from "@/lib/huehint";
import type { Hsb } from "@resenhark/shared";
import { CheckIcon } from "lucide-react";
import { useState } from "react";

const INITIAL: Hsb = { h: 180, s: 50, b: 75 };
const BARS = [
  { key: "h", label: "Matiz", max: 359 },
  { key: "s", label: "Saturação", max: 100 },
  { key: "b", label: "Brilho", max: 100 },
] as const;

export function ColorSelector({
  round,
  totalRounds,
  disabled,
  pending,
  onConfirm,
}: {
  round: number;
  totalRounds: number;
  disabled: boolean;
  pending: boolean;
  onConfirm: (color: Hsb) => void;
}) {
  const [color, setColor] = useState<Hsb>(INITIAL);
  const gradients = {
    h: "linear-gradient(to top, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
    s: `linear-gradient(to top, ${hsbToCss({ ...color, s: 0 })}, ${hsbToCss({ ...color, s: 100 })})`,
    b: `linear-gradient(to top, #000, ${hsbToCss({ ...color, b: 100 })})`,
  };
  return (
    <div aria-label="Seletor de cor" className="flex flex-col gap-3">
      <div className="flex h-[320px] min-w-0 sm:h-[400px]">
        <div className="flex shrink-0 gap-2 rounded-l-xl bg-muted p-3 pr-4">
          {BARS.map(({ key, label, max }) => (
            <div key={key} className="flex flex-col items-center gap-2">
              <span className="text-xs font-medium" aria-hidden="true">
                {label.slice(0, 1)}
              </span>
              <div
                role="slider"
                tabIndex={disabled ? -1 : 0}
                aria-label={label}
                aria-orientation="vertical"
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={color[key]}
                aria-valuetext={`${color[key]}${key === "h" ? " graus" : " por cento"}`}
                aria-disabled={disabled}
                className="relative w-6 flex-1 touch-none rounded-full ring-1 ring-border focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                style={{ background: gradients[key] }}
                onPointerDown={(event) => {
                  if (disabled) return;
                  event.currentTarget.focus();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  const rect = event.currentTarget.getBoundingClientRect();
                  const value = Math.round(
                    Math.max(0, Math.min(1, (rect.bottom - event.clientY) / rect.height)) * max,
                  );
                  setColor((current) => ({ ...current, [key]: value }));
                }}
                onPointerMove={(event) => {
                  if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const value = Math.round(
                    Math.max(0, Math.min(1, (rect.bottom - event.clientY) / rect.height)) * max,
                  );
                  setColor((current) => ({ ...current, [key]: value }));
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onKeyDown={(event) => {
                  if (disabled) return;
                  const direction = ["ArrowUp", "ArrowRight"].includes(event.key)
                    ? 1
                    : ["ArrowDown", "ArrowLeft"].includes(event.key)
                      ? -1
                      : 0;
                  if (!direction && event.key !== "Home" && event.key !== "End") return;
                  event.preventDefault();
                  setColor((current) => ({
                    ...current,
                    [key]:
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? max
                          : Math.max(
                              0,
                              Math.min(max, current[key] + direction * (event.shiftKey ? 10 : 1)),
                            ),
                  }));
                }}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 size-5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-black bg-white shadow"
                  style={{ bottom: `${(color[key] / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div
          className="relative min-w-0 flex-1 rounded-r-xl"
          style={{ background: hsbToCss(color) }}
        >
          <span className="absolute top-4 right-4 rounded-full bg-white px-3 py-1 text-sm font-medium text-black">
            Rodada {round} / {totalRounds}
          </span>
          <Button
            type="button"
            aria-label="Confirmar palpite"
            size="icon"
            loading={pending}
            disabled={disabled}
            onClick={() => onConfirm(color)}
            className="absolute right-4 bottom-4 size-14 rounded-full bg-white text-black hover:bg-white/90"
          >
            <CheckIcon aria-hidden="true" />
          </Button>
        </div>
      </div>
      <p className="font-mono text-sm tabular-nums">{describeHsb(color)}</p>
      <p className="text-xs text-muted-foreground">
        Arraste as barras ou use as setas. Shift + seta ajusta de 10 em 10.
      </p>
    </div>
  );
}
