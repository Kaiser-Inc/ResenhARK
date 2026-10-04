"use client";

import { PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { API_URL } from "@/lib/api";

const SNIPPET_SECONDS = 30;

type SnippetPlayerProps = { audioUrl: string };

export function SnippetPlayer({ audioUrl }: SnippetPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [time, setTime] = useState(0);

  useEffect(() => {
    // Autoplay may be rejected until the person interacts: then "Tocar" turns primary.
    audioRef.current?.play().catch(() => setBlocked(true));
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => setBlocked(true));
    else audio.pause();
  }

  if (failed) return <p className="text-sm text-muted-foreground">Trecho indisponível</p>;

  const value = Math.min(time, SNIPPET_SECONDS);
  return (
    <div className="flex items-center gap-3">
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
