"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ResenharkLogo } from "@/components/brand/resenhark-logo";
import { useReduced } from "@/components/hitline/motion";

const RoomTransitionContext = createContext({ begin: async () => {}, finish: () => {} });

export const useRoomTransition = () => useContext(RoomTransitionContext);

/** Keeps the loading layer across navigation until the destination can render its room. */
export function RoomTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduced = useReduced();
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const closed = useRef<(() => void) | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const previousPath = useRef(pathname);
  const restoreFocus = useRef(false);

  const begin = useCallback(() => {
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    active.current = true;
    setBusy(true);
    return new Promise<void>((resolve) => {
      closed.current = resolve;
    });
  }, []);

  const finish = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    closed.current?.();
    closed.current = null;
    restoreFocus.current = true;
    setBusy(false);
  }, []);

  useEffect(() => {
    if (pathname === "/" && previousPath.current !== "/") finish();
    previousPath.current = pathname;
  }, [pathname, finish]);

  useEffect(() => {
    if (busy || !restoreFocus.current) return;
    restoreFocus.current = false;
    const target = pathname.startsWith("/sala/")
      ? document.getElementById("main-content")
      : previousFocus.current;
    target?.focus({ preventScroll: true });
  }, [busy, pathname]);

  const actions = useMemo(() => ({ begin, finish }), [begin, finish]);
  return (
    <RoomTransitionContext.Provider value={actions}>
      <motion.div
        data-testid="route-surface"
        inert={busy || undefined}
        className="transition-transform duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ transform: busy && !reduced ? "translateY(-24px) scale(0.94)" : "none" }}
        initial={false}
        animate={{
          opacity: busy ? 0 : 1,
        }}
        transition={{ duration: reduced ? 0.12 : 0.22, ease: [0.23, 1, 0.32, 1] }}
        onAnimationComplete={() => {
          if (!busy) return;
          closed.current?.();
          closed.current = null;
        }}
      >
        {children}
      </motion.div>
      <AnimatePresence>
        {busy ? (
          <motion.output
            key="room-loading"
            aria-label="Carregamento da sala"
            aria-live="polite"
            aria-atomic="true"
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          >
            <motion.div
              aria-hidden="true"
              data-loading-boat
              animate={
                reduced
                  ? { transform: "none" }
                  : {
                      transform: [
                        "translateY(4px) rotate(-6deg)",
                        "translateY(-8px) rotate(6deg)",
                        "translateY(4px) rotate(-6deg)",
                      ],
                    }
              }
              transition={{
                duration: 1.8,
                repeat: Number.POSITIVE_INFINITY,
                ease: [0.77, 0, 0.175, 1],
              }}
            >
              <ResenharkLogo width={96} height={90} withKaiserMark />
            </motion.div>
            <p className="text-sm font-medium">
              {pathname.startsWith("/sala/") ? "Entrando na sala…" : "Criando sala…"}
            </p>
          </motion.output>
        ) : null}
      </AnimatePresence>
    </RoomTransitionContext.Provider>
  );
}
