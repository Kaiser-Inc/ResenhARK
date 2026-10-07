"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

import { RoomTransition } from "@/components/room/room-transition";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="never">
      <RoomTransition>{children}</RoomTransition>
      <Toaster position="bottom-right" closeButton expand />
    </MotionConfig>
  );
}
