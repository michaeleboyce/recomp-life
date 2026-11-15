import { ChevronDown } from "lucide-react";
import { STRENGTH_DESCRIPTIONS, STRENGTH_ORDER } from "@/lib/evidence";
import { StrengthBadge } from "./StrengthBadge";

/** The "How to read this" fold-out: what each grade means and what the grades cannot say. */
export function HowToRead() {
  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 text-sm font-medium text-foreground">
        How to read this
        <ChevronDown
          className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="space-y-4 border-t border-border p-4">
        <ul className="space-y-3">
          {STRENGTH_ORDER.map((strength) => (
            <li key={strength} className="space-y-0.5">
              <StrengthBadge strength={strength} />
              <p className="text-xs text-muted-foreground">
                {STRENGTH_DESCRIPTIONS[strength]}
              </p>
            </li>
          ))}
        </ul>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            Most training studies last 8 to 12 weeks and many use people new to
            lifting, so even well-supported rules are averages. Every suggestion
            in the app can be overridden.
          </p>
          <p>
            This is training guidance, not medical advice. For pain or injury,
            see a clinician.
          </p>
        </div>
      </div>
    </details>
  );
}
