"use client";

import { motion } from "motion/react";

import { FADE, ODOMETER_SECONDS, useReduced } from "@/components/hitline/motion";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Year whose digits roll from 0 to the value in 600 ms. The year is also there as text for readers. */
export function OdometerYear({ year, className }: { year: number; className?: string }) {
  const reduce = useReduced();
  // Reduced: no rolling column, just the final number fading in.
  if (reduce)
    return (
      <span className={className}>
        <span className="sr-only">{year}</span>
        <motion.span
          aria-hidden="true"
          data-testid="odometer"
          className="inline-block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={FADE}
        >
          {year}
        </motion.span>
      </span>
    );
  return (
    <span className={className}>
      <span className="sr-only">{year}</span>
      <span aria-hidden="true" data-testid="odometer" className="inline-flex h-7 overflow-hidden">
        {String(year)
          .split("")
          .map((digit, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: digit position is the identity
            <span key={i} className="inline-block h-7 w-[1ch] overflow-hidden">
              <motion.span
                data-motion="odometer"
                className="flex flex-col"
                initial={{ y: "0%" }}
                animate={{ y: `${-Number(digit) * 10}%` }}
                transition={{ duration: ODOMETER_SECONDS, ease: [0.23, 1, 0.32, 1] }}
              >
                {DIGITS.map((d) => (
                  <span key={d} className="h-7 leading-7">
                    {d}
                  </span>
                ))}
              </motion.span>
            </span>
          ))}
      </span>
    </span>
  );
}
