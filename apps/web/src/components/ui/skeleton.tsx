import { cn } from "@/lib/utils";

// Decorative placeholder: the region that is loading carries aria-busy, not
// each block.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-accent motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Skeleton };
