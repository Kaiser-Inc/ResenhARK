import { cn } from "@/lib/utils";
import { Loader2Icon } from "lucide-react";

function Spinner({
  className,
  label = "Carregando",
  ...props
}: React.ComponentProps<"svg"> & { label?: string }) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label={label}
      strokeWidth={1.75}
      className={cn("size-4 animate-spin motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Spinner };
