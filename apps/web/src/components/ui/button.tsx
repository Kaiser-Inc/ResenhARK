import { cn } from "@/lib/utils";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { type VariantProps, cva } from "class-variance-authority";

import { Spinner } from "@/components/ui/spinner";

// KaiserInc Base: um tamanho de controle (32px, como no Rhea), 28px só dentro de tabela.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,outline-color,scale] duration-[160ms] ease-out outline-hidden select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:border-border disabled:bg-muted disabled:text-subtle-foreground aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:not-aria-disabled:scale-[0.97]",
        outline:
          "border-border-strong bg-transparent hover:bg-accent aria-expanded:bg-accent active:bg-border active:not-aria-disabled:scale-[0.97]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-border aria-expanded:bg-border active:not-aria-disabled:scale-[0.97]",
        ghost:
          "hover:bg-accent aria-expanded:bg-accent active:bg-border active:not-aria-disabled:scale-[0.97]",
        destructive:
          "border-border-strong bg-transparent text-destructive hover:bg-accent active:not-aria-disabled:scale-[0.97]",
        link: "text-primary-text underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-control gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        sm: "h-control-sm gap-1 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-control",
        "icon-sm": "size-control-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  children,
  onClick,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /** Shows a spinner and blocks interaction until the action settles. */
    loading?: boolean;
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-loading={loading || undefined}
      className={cn(
        buttonVariants({ variant, size, className }),
        loading && "relative cursor-progress",
      )}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={loading ? (event) => event.preventDefault() : onClick}
      {...props}
    >
      {/* While loading the label turns transparent instead of disappearing, so
          the button keeps its width and its accessible name. */}
      {loading && (
        <span
          data-slot="button-spinner"
          className="absolute inset-0 flex items-center justify-center animate-in fade-in-0 zoom-in-75 duration-150 ease-out"
        >
          <Spinner />
        </span>
      )}
      <span
        data-slot="button-label"
        className={cn("inline-flex items-center gap-[inherit]", loading && "text-transparent")}
      >
        {children}
      </span>
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
