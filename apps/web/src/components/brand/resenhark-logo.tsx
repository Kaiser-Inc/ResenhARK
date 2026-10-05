type ResenharkLogoProps = {
  className?: string;
  title?: string;
};

// "Arca de conversa": a speech bubble above a hull split in two halves.
// The tail of the bubble points into the split; the right half is the accent.
export function ResenharkLogo({ className, title }: ResenharkLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 60"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <g data-logo-piece="bubble" fill="currentColor">
        <path d="M16 2h32a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H38l-6 8-6-8H16a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6Z" />
      </g>
      <g data-logo-piece="hull-left" fill="currentColor">
        <path d="M3 44h27v16H14Z" />
      </g>
      <g data-logo-piece="hull-right" className="text-primary-text" fill="currentColor">
        <path d="M34 44h27L50 60H34Z" />
      </g>
    </svg>
  );
}
