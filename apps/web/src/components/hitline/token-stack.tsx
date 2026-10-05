"use client";

import { animate } from "motion/react";
import { useEffect, useRef } from "react";

import { useReduced } from "@/components/hitline/motion";
import { cn } from "@/lib/utils";

const MAX_TOKENS = 5;

/** Flat board-game chip: accent disc, border and a crease across the center. Decorative. */
function Token() {
  return (
    <span
      data-token=""
      className="relative size-4 shrink-0 rounded-full border border-primary-foreground/40 bg-primary"
    >
      <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-primary-foreground/50" />
    </span>
  );
}

/**
 * Balance as up to 5 chips, "+N" for the rest, and the number beside them.
 * Screen readers get "N fichas" only; the chips are aria-hidden. Pops (scale) when the balance changes.
 */
export function TokenStack({ count, className }: { count: number; className?: string }) {
  const reduce = useReduced();
  const pop = useRef<HTMLSpanElement>(null);
  const previous = useRef(count);
  useEffect(() => {
    if (previous.current !== count && !reduce && pop.current)
      animate(pop.current, { scale: [1, 1.2, 1] }, { duration: 0.25, ease: "easeOut" });
    previous.current = count;
  }, [count, reduce]);
  return (
    <span
      data-testid="token-stack"
      className={cn("inline-flex shrink-0 items-center gap-2 whitespace-nowrap", className)}
    >
      <span ref={pop} data-token-motion="" className="inline-flex items-center gap-1">
        <span
          data-testid="token-discs"
          aria-hidden="true"
          className="inline-flex items-center -space-x-1"
        >
          {Array.from({ length: Math.min(count, MAX_TOKENS) }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: identical decorative chips
            <Token key={i} />
          ))}
        </span>
        {count > MAX_TOKENS ? (
          <span
            data-testid="token-more"
            aria-hidden="true"
            className="font-mono text-xs text-muted-foreground tabular-nums"
          >
            +{count - MAX_TOKENS}
          </span>
        ) : null}
      </span>
      <span data-testid="token-count" className="font-mono text-sm tabular-nums">
        {count}
        <span className="sr-only"> {count === 1 ? "ficha" : "fichas"}</span>
      </span>
    </span>
  );
}
