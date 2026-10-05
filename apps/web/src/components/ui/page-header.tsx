import { cn } from "@/lib/utils";

// The page name is the largest text on screen, set directly on the page
// background with no card behind it.
function PageHeader({
  title,
  description,
  actions,
  headingLevel = 1,
  className,
  ...props
}: Omit<React.ComponentProps<"header">, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Use 2 when the header sits inside another page, so the page keeps one h1. */
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <header
      data-slot="page-header"
      className={cn("flex flex-wrap items-end justify-between gap-4", className)}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <Heading className="text-[28px] leading-8 font-semibold tracking-[-0.03em] text-balance sm:text-[40px] sm:leading-[44px]">
          {title}
        </Heading>
        {description && (
          <p
            data-slot="page-header-description"
            className="max-w-[60ch] text-sm text-muted-foreground"
          >
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div data-slot="page-header-actions" className="flex shrink-0 items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}

export { PageHeader };
