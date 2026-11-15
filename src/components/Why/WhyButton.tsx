"use client";

import { cn } from "@/lib/utils";
import { setWhyInUrl, type WhyTarget } from "./whyParam";

export interface WhyButtonProps extends WhyTarget {
  /** The lift's name, for the button's spoken label. */
  liftName: string;
  className?: string;
}

/**
 * The small "why" control on a lift row. It sets `?why=<exerciseId>:<tier>`, which the
 * page's `LiftWhySheet` reads. It is a button, so it must sit beside the row's link,
 * never inside it. The visible word is small; the tap area is 44 px tall.
 */
export function WhyButton({ exerciseId, tier, liftName, className }: WhyButtonProps) {
  return (
    <button
      type="button"
      data-slot="why-button"
      aria-label={`Why this weight for ${liftName}`}
      onClick={(event) => {
        event.stopPropagation();
        setWhyInUrl({ exerciseId, tier });
      }}
      className={cn(
        "relative z-10 shrink-0 font-semibold text-primary underline decoration-dotted underline-offset-2 outline-none",
        "after:absolute after:-inset-x-2 after:-inset-y-3.5 after:content-['']",
        "focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className
      )}
    >
      why
    </button>
  );
}
