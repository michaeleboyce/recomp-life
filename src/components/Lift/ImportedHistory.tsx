"use client";

import { History } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { ImportedBest } from "@/lib/import/history";
import type { LiftImportedView } from "./useLiftView";

function dayText(t: number): string {
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * "Best before ReComp: 245 lbs, Mar 4, 2024 (205 × 6)", or "Best in imported history"
 * when imported sessions run past the app's first workout. History, never a new best.
 */
export function importedBestText(best: ImportedBest): string {
  const lead = best.beforeApp ? "Best before ReComp" : "Best in imported history";
  const weight = `${Number(best.set.weight.toFixed(1))}${best.set.perHand ? " each" : ""}`;
  return `${lead}: ${Math.round(best.value)} lbs est. 1RM, ${dayText(best.t)} (${weight} × ${best.set.reps})`;
}

/**
 * The lift page's control for history imported from other apps: a switch that shows or
 * hides the imported sessions in the charts and stats (on by default), and their best,
 * labelled as imported. Nothing when the lift has no imported sessions.
 */
export function ImportedHistoryControl({
  imported,
  shown,
  onShownChange,
}: {
  imported: LiftImportedView;
  shown: boolean;
  onShownChange: (shown: boolean) => void;
}) {
  if (imported.count === 0) return null;
  const { count, best } = imported;
  return (
    <section aria-label="Imported history" className="flex flex-col gap-1 rounded-xl bg-card px-3.5 py-1.5">
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
          <History className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Show imported history
          <span className="font-mono text-xs font-normal text-muted-foreground">
            {count} {count === 1 ? "session" : "sessions"}
          </span>
        </span>
        <Switch checked={shown} onCheckedChange={onShownChange} aria-label="Show imported history" />
      </label>
      {shown && best && (
        <p data-testid="imported-best" className="pb-1.5 text-xs text-muted-foreground">
          {importedBestText(best)}. Imported from another app: drawn hollow on the charts, and not a
          ReComp best.
        </p>
      )}
    </section>
  );
}
