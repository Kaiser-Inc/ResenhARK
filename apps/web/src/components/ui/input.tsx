import { cn } from "@/lib/utils";
import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-control w-full min-w-0 rounded-md border border-transparent bg-input/50 px-3 py-1 text-base transition-colors duration-[120ms] ease-out outline-hidden file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:bg-input/80 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-subtle-foreground aria-invalid:border-destructive md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
