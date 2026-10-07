import { cn } from "@/lib/utils";
import { ResenharkLogo } from "./resenhark-logo";

export function HeroBoat({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 480 320"
      aria-hidden="true"
      data-testid="hero-boat"
      data-intro="true"
      className={cn("hero-boat block w-full overflow-visible", className)}
    >
      <g transform="translate(110 18)">
        <g className="hero-boat-float">
          <g className="hero-boat-landing">
            <g className="hero-boat-sway">
              <ResenharkLogo className="hero-boat-logo" width={260} height={244} withKaiserMark />
            </g>
          </g>
        </g>
      </g>
      <g
        className="hero-boat-waves"
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth="3"
        strokeLinecap="round"
      >
        <path d="M32 264c20-12 40-12 60 0s40 12 60 0 40-12 60 0 40 12 60 0 40-12 60 0 40 12 60 0 40-12 56 0" />
        <path d="M56 286c20-12 40-12 60 0s40 12 60 0 40-12 60 0 40 12 60 0 40-12 60 0 40 12 68 0" />
        <path d="M100 308c20-12 40-12 60 0s40 12 60 0 40-12 60 0 40 12 60 0 40-12 40 0" />
      </g>
    </svg>
  );
}
