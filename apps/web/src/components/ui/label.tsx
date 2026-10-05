"use client";

import { cn } from "@/lib/utils";
import type * as React from "react";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: This reusable label receives htmlFor or wraps a control at its call site.
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-subtle-foreground peer-disabled:cursor-not-allowed peer-disabled:text-subtle-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
