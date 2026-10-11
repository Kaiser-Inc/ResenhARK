"use client";

import { Button } from "@/components/ui/button";
import type { ServerClock } from "@/lib/server-clock";
import { createTaleclueAudio, createTaleclueSoundSequence } from "@/lib/taleclue-sound";
import type { TaleclueView } from "@resenhark/shared";
import { Volume2Icon, VolumeXIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const PREFERENCE = "resenhark:taleclue:sound-muted";
function saveMuted(muted: boolean) {
  try {
    localStorage.setItem(PREFERENCE, muted ? "1" : "0");
  } catch {
    /* Preference is optional. */
  }
}

export type TaleclueSoundState = {
  enabled: boolean;
  muted: boolean;
  label: string;
  toggle(): void;
};
const inactive: TaleclueSoundState = {
  enabled: false,
  muted: false,
  label: "Ativar som",
  toggle() {},
};

/** RoomShell owns this hook so responsive remounts preserve activation and scheduled effects. */
export function useTaleclueSound(
  view: TaleclueView | null,
  connected: boolean,
  clock: ServerClock,
): TaleclueSoundState {
  const audio = useRef<ReturnType<typeof createTaleclueAudio> | null>(null);
  const sequence = useRef<ReturnType<typeof createTaleclueSoundSequence> | null>(null);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const active = view !== null;
  useEffect(() => {
    try {
      setMuted(localStorage.getItem(PREFERENCE) === "1");
    } catch {
      /* Keep the default. */
    }
    const output = createTaleclueAudio();
    const flow = createTaleclueSoundSequence(output);
    audio.current = output;
    sequence.current = flow;
    return () => {
      flow.dispose();
      output.dispose();
      audio.current = null;
      sequence.current = null;
    };
  }, []);
  const activate = useCallback(async () => {
    const output = audio.current;
    if (!output) return;
    const activated = await output.activate();
    if (audio.current === output) setReady(activated);
  }, []);
  useEffect(() => {
    if (!active || !connected || ready || muted) return;
    const interact = (event: PointerEvent | KeyboardEvent) => {
      if (
        !event.isTrusted ||
        (event.target instanceof Element && event.target.closest("[data-taleclue-sound-control]"))
      )
        return;
      if (
        event instanceof KeyboardEvent &&
        (event.repeat || ["Tab", "Shift", "Control", "Alt", "Meta", "Escape"].includes(event.key))
      )
        return;
      void activate();
    };
    document.addEventListener("pointerdown", interact, true);
    document.addEventListener("keydown", interact, true);
    return () => {
      document.removeEventListener("pointerdown", interact, true);
      document.removeEventListener("keydown", interact, true);
    };
  }, [activate, active, connected, ready, muted]);
  useEffect(() => {
    if (!view) {
      sequence.current?.dispose();
      return;
    }
    sequence.current?.update(view, connected, clock.now(), ready && !muted);
  }, [view, connected, clock, ready, muted]);
  const enabled = ready && !muted;
  return {
    enabled,
    muted,
    label: muted ? "Som desligado" : ready ? "Som ligado" : "Ativar som",
    toggle() {
      if (enabled) {
        audio.current?.cancel();
        setMuted(true);
        saveMuted(true);
      } else {
        setMuted(false);
        saveMuted(false);
        void activate();
      }
    },
  };
}

export function TaleclueSoundControl({ sound = inactive }: { sound?: TaleclueSoundState }) {
  return (
    <Button
      variant="outline"
      data-taleclue-sound-control
      aria-pressed={sound.enabled}
      onClick={sound.toggle}
    >
      {sound.muted ? (
        <VolumeXIcon aria-hidden="true" strokeWidth={1.75} />
      ) : (
        <Volume2Icon aria-hidden="true" strokeWidth={1.75} />
      )}
      {sound.label}
    </Button>
  );
}
