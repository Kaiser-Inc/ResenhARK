import Link from "next/link";

import { ResenharkLogo } from "@/components/brand/resenhark-logo";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteBar() {
  return (
    <header className="mx-auto flex w-full max-w-page items-center justify-between px-4 py-4 sm:px-6">
      <Link
        href="/"
        aria-label="ResenhARK, início"
        className="inline-flex h-control items-center rounded-md outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ResenharkLogo className="h-7 w-auto" />
      </Link>
      <ThemeToggle />
    </header>
  );
}
