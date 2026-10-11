import type { TaleclueStep, TaleclueView } from "@resenhark/shared";
import { taleclueRevealElapsed } from "./taleclue";

export type TaleclueMove = Extract<TaleclueStep, { type: "board-move" }>["moves"][number];
export type TaleclueSound = "clue" | "step";
type SoundOutput = { play(kind: TaleclueSound, delayMs?: number): void; cancel(): void };
type SoundView = Pick<TaleclueView, "round" | "phase" | "clue" | "deadline" | "rounds">;

export function taleclueStepSoundTimes(moves: TaleclueMove[]): number[] {
  const times = new Set<number>();
  for (const move of moves) {
    const count = Math.abs(move.to - move.from);
    for (let step = 1; step <= count; step++) times.add(Math.round(9600 + (2400 * step) / count));
  }
  return [...times].sort((a, b) => a - b);
}

/** Retain only public occurrence identity; hands and unrevealed ownership never enter this state. */
export function createTaleclueSoundSequence(output: SoundOutput) {
  let previous: Pick<SoundView, "round" | "phase" | "clue" | "deadline"> | undefined;
  let wasEnabled = false;
  return {
    update(view: SoundView, connected: boolean, now: number, enabled: boolean) {
      if (!connected) {
        if (previous) output.cancel();
        previous = undefined;
        wasEnabled = false;
        return;
      }
      const old = previous;
      previous = { round: view.round, phase: view.phase, clue: view.clue, deadline: view.deadline };
      const changed = old && (old.round !== view.round || old.phase !== view.phase);
      if (changed || (old?.deadline !== null && view.deadline === null) || (wasEnabled && !enabled))
        output.cancel();
      wasEnabled = enabled;
      if (!old || !enabled || view.deadline === null || view.phase === "game-over") return;
      if (old.round === view.round && view.clue && old.clue !== view.clue) output.play("clue");
      if (view.phase === "reveal" && old.phase !== "reveal") {
        const round = view.rounds.find((round) => round.round === view.round);
        const moves = round?.steps.find((step) => step.type === "board-move")?.moves ?? [];
        const elapsed = taleclueRevealElapsed(view.deadline, now);
        for (const time of taleclueStepSoundTimes(moves))
          if (time > elapsed) output.play("step", time - elapsed);
      }
    },
    dispose() {
      output.cancel();
      previous = undefined;
    },
  };
}

/** Construct/resume only inside a real interaction. Unsupported or blocked audio remains optional. */
export function createTaleclueAudio(factory: () => AudioContext = () => new window.AudioContext()) {
  let context: AudioContext | undefined;
  let disposed = false;
  const sources = new Map<AudioScheduledSourceNode, () => void>();
  const cancel = () => {
    for (const [source, cleanup] of sources) {
      try {
        source.stop();
      } catch {
        /* It may already have ended. */
      }
      cleanup();
    }
    sources.clear();
  };
  function schedule(
    source: AudioScheduledSourceNode,
    gain: GainNode,
    start: number,
    duration: number,
    volume: number,
    filter?: BiquadFilterNode,
  ) {
    if (!context) return;
    source.connect(filter ?? gain);
    filter?.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    const cleanup = () => {
      source.onended = null;
      source.disconnect();
      gain.disconnect();
      filter?.disconnect();
      sources.delete(source);
    };
    sources.set(source, cleanup);
    source.onended = cleanup;
    source.start(start);
    source.stop(start + duration);
  }
  return {
    async activate(): Promise<boolean> {
      if (disposed) return false;
      try {
        context ??= factory();
        if (context.state !== "running") await context.resume();
        return !disposed && context.state === "running";
      } catch {
        return false;
      }
    },
    play(kind: TaleclueSound, delayMs = 0) {
      if (disposed || context?.state !== "running") return;
      try {
        const start = context.currentTime + Math.max(0, delayMs) / 1000;
        if (kind === "clue") {
          const tone = context.createOscillator();
          tone.type = "sine";
          tone.frequency.setValueAtTime(740, start);
          tone.frequency.setValueAtTime(1110, start + 0.065);
          schedule(tone, context.createGain(), start, 0.18, 0.025);
        } else {
          const noise = context.createBufferSource();
          const buffer = context.createBuffer(
            1,
            Math.ceil(context.sampleRate * 0.07),
            context.sampleRate,
          );
          const samples = buffer.getChannelData(0);
          for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
          noise.buffer = buffer;
          const filter = context.createBiquadFilter();
          filter.type = "bandpass";
          filter.frequency.setValueAtTime(1100, start);
          filter.Q.setValueAtTime(1.2, start);
          schedule(noise, context.createGain(), start, 0.07, 0.04, filter);
          const body = context.createOscillator();
          body.type = "triangle";
          body.frequency.setValueAtTime(240, start);
          body.frequency.exponentialRampToValueAtTime(120, start + 0.055);
          schedule(body, context.createGain(), start, 0.055, 0.025);
        }
      } catch {
        cancel();
      }
    },
    cancel,
    dispose() {
      disposed = true;
      cancel();
      try {
        void context?.close().catch(() => {});
      } catch {
        /* Optional audio cannot block unmount. */
      }
    },
  };
}
