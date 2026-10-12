import type { Ack } from "@resenhark/shared";
import { useEffect, useRef, useState } from "react";

/** Serialize full selections; intermediate snapshots cannot replace newer clicks. */
export function useChipSelection<T>(server: T[], send?: (next: T[]) => Promise<Ack>) {
  const [selected, setSelected] = useState(server);
  const [busy, setBusy] = useState(false);
  const authoritative = useRef(server);
  const running = useRef(false);
  const queued = useRef<T[] | null>(null);
  authoritative.current = server;
  useEffect(() => {
    if (!running.current) setSelected(server);
  }, [server]);

  async function change(next: T[]) {
    if (!send) return;
    setSelected(next);
    queued.current = next;
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      while (queued.current) {
        const selection = queued.current;
        queued.current = null;
        const ack = await send(selection);
        if (!ack.ok && !queued.current) setSelected(authoritative.current);
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { selected, busy, change };
}
