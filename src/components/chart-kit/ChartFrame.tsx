import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ChartFrameProps {
  /** Sentence-case name of what is plotted. */
  title: string;
  /** The headline number, e.g. "792". Rendered in large mono numerals. */
  value?: ReactNode;
  /** Unit or signed change beside the value, e.g. a Delta. */
  change?: ReactNode;
  /** Right-hand controls, usually RangeTabs. */
  actions?: ReactNode;
  footer?: ReactNode;
  /** Heading level of the title (default 3). */
  headingLevel?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}

/** Header (title, value, change, actions) + chart + optional footer, so screens compose alike. */
export function ChartFrame({
  title,
  value,
  change,
  actions,
  footer,
  headingLevel = 3,
  className,
  children,
}: ChartFrameProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <Heading className="text-xs font-normal text-muted-foreground">{title}</Heading>
          {(value !== undefined || change !== undefined) && (
            <div className="flex items-baseline gap-2">
              {value !== undefined && (
                <span className="font-mono text-[34px] leading-tight font-bold text-foreground">
                  {value}
                </span>
              )}
              {change !== undefined && <span className="font-mono text-sm">{change}</span>}
            </div>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
      {footer && <footer className="text-xs text-muted-foreground">{footer}</footer>}
    </section>
  );
}
