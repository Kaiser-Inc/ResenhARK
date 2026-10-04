import { cn } from "@/lib/utils";
import type * as React from "react";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-[88px] w-full resize-none rounded-md border border-transparent bg-input/50 px-3 py-2 text-base transition-colors duration-[120ms] ease-out outline-hidden placeholder:text-muted-foreground hover:bg-input/80 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-subtle-foreground aria-invalid:border-destructive md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
