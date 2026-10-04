import { WifiOffIcon } from "lucide-react";

// The live region is always mounted and only its content comes and goes,
// so screen readers announce the change.
export function ConnectionBanner({ visible }: { visible: boolean }) {
  return (
    <output className="block shrink-0">
      {visible ? (
        <div className="flex h-8 items-center justify-center gap-2 border-warning/40 border-b bg-muted px-4 text-sm">
          <WifiOffIcon aria-hidden="true" className="size-4 text-warning" strokeWidth={1.75} />
          <span>Reconectando…</span>
        </div>
      ) : null}
    </output>
  );
}
