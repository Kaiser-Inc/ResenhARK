"use client";

import { cn } from "@/lib/utils";
import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";

function Separator({ className, orientation = "horizontal", ...props }: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 border-border",
        orientation === "horizontal" ? "w-full border-t" : "self-stretch border-l",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
