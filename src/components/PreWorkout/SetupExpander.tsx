import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface SetupExpanderProps {
  title: string;
  /** A short note beside the title, e.g. a count. */
  badge?: ReactNode;
  children: ReactNode;
}

/** An optional part of the setup screen, closed until asked for. */
export function SetupExpander({ title, badge, children }: SetupExpanderProps) {
  return (
    <details className="group border-b border-border">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        <span className="flex-1">{title}</span>
        {badge}
        <ChevronDown
          className="size-4 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="pb-4 pt-1">{children}</div>
    </details>
  );
}
