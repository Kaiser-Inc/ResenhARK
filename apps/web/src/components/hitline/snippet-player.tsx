"use client";

import { Slider } from "@base-ui/react/slider";
import { PauseIcon, PlayIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Equalizer } from "@/components/hitline/equalizer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { API_URL } from "@/lib/api";

const SNIPPET_SECONDS = 30;
const VOLUME_KEY = "resenhark:hitline:volume";

type SnippetPlayerProps = { audioUrl: string };

export function SnippetPlayer({ audioUrl }: SnippetPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [time, setTime] = useState(0);

  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const silent = muted || volume === 0;
  const lastAudibleVolume = useRef(1);

  useEffect(() => {
    let storedVolume = 1;
    let storedMuted = false;
    try {
      const stored = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? "null");
      const value = typeof stored === "number" ? stored : stored?.volume;
      if (Number.isFinite(value) && value >= 0 && value <= 1) storedVolume = value;
      storedMuted = stored?.muted === true;
    } catch {
      // Storage is optional; the default remains audible.
    }
    setVolume(storedVolume);
    setMuted(storedMuted);
    if (storedVolume > 0) lastAudibleVolume.current = storedVolume;
    const audio = audioRef.current;
    if (audio) {
      audio.volume = storedVolume;
      // iOS Safari ignores volume, but still honors muted.
      audio.muted = storedMuted || storedVolume === 0;
    }
    // Autoplay may be rejected until the person interacts: then "Tocar" turns primary.
    audioRef.current?.play().catch(() => setBlocked(true));
  }, []);

  function changeVolume(value: number, mute = false) {
    setVolume(value);
    setMuted(mute);
    if (value > 0) lastAudibleVolume.current = value;
    const audio = audioRef.current;
    if (audio) {
      audio.volume = value;
      audio.muted = mute || value === 0;
    }
    try {
      localStorage.setItem(VOLUME_KEY, JSON.stringify({ volume: value, muted: mute }));
    } catch {
      // Keep the control usable when storage is unavailable.
    }
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => setBlocked(true));
    else audio.pause();
  }

  if (failed) return <p className="text-sm text-muted-foreground">Trecho indisponível</p>;

  const value = Math.min(time, SNIPPET_SECONDS);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* biome-ignore lint/a11y/useMediaCaption: a music snippet has no speech to caption */}
      <audio
        ref={audioRef}
        src={`${API_URL}${audioUrl}`}
        preload="auto"
        hidden
        onPlay={() => {
          setPlaying(true);
          setBlocked(false);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onError={() => setFailed(true)}
      />
      <Button type="button" variant={blocked && !playing ? "default" : "outline"} onClick={toggle}>
        {playing ? (
          <PauseIcon aria-hidden="true" strokeWidth={1.75} />
        ) : (
          <PlayIcon aria-hidden="true" strokeWidth={1.75} />
        )}
        {playing ? "Pausar" : "Tocar"}
      </Button>
      <Slider.Root
        value={volume}
        onValueChange={(value) => changeVolume(value)}
        min={0}
        max={1}
        step={0.01}
        largeStep={0.1}
        thumbAlignment="edge"
        format={{ style: "percent", maximumFractionDigits: 0 }}
        locale="pt-BR"
        className="w-36 shrink-0 space-y-1"
      >
        <div className="flex items-center justify-between gap-2">
          <Slider.Label className="text-xs text-muted-foreground">Volume</Slider.Label>
          <Slider.Value className="text-xs font-medium tabular-nums" />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={silent ? "Ativar áudio" : "Silenciar áudio"}
            aria-pressed={silent}
            onClick={() => changeVolume(volume === 0 ? lastAudibleVolume.current : volume, !silent)}
            className={silent ? "text-primary-text" : "text-muted-foreground"}
          >
            <VolumeXIcon aria-hidden="true" strokeWidth={1.75} />
          </Button>
          <Slider.Control className="relative flex h-control min-w-0 flex-1 touch-none items-center select-none">
            <Slider.Track className="relative h-1.5 w-full rounded-full bg-border">
              <Slider.Indicator className="h-full rounded-full bg-primary" />
              <Slider.Thumb
                aria-label="Volume"
                className="size-4 rounded-full border border-border-strong bg-background shadow-sm outline-hidden focus-within:outline-2 focus-within:outline-solid focus-within:outline-offset-2 focus-within:outline-ring"
              />
            </Slider.Track>
          </Slider.Control>
          <Volume2Icon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
            strokeWidth={1.75}
          />
        </div>
      </Slider.Root>
      <Equalizer playing={playing} />
      {loading && !failed ? <Spinner label="Carregando trecho" /> : null}
      {/* biome-ignore lint/a11y/useFocusableInteractive: a progressbar is read-only, not a widget */}
      <div
        role="progressbar"
        aria-label="Progresso do trecho"
        aria-valuemin={0}
        aria-valuemax={SNIPPET_SECONDS}
        aria-valuenow={Math.round(value * 10) / 10}
        className="h-1 min-w-0 flex-1 overflow-hidden rounded-sm bg-border"
      >
        <div
          className="h-full bg-primary transition-[width] duration-[120ms] ease-out"
          style={{ width: `${(value / SNIPPET_SECONDS) * 100}%` }}
        />
      </div>
    </div>
  );
}
