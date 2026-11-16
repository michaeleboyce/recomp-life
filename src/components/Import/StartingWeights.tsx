"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { LocationChip } from "@/components/ui/location-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { TierBadge } from "@/components/ui/tier-badge";
import { useStartingWeights } from "@/hooks/useStartingWeights";
import { recordAdjustment } from "@/lib/data/adjustments";
import { formatLb } from "@/lib/import/preview";
import { adjustmentFor, type StartingWeightSuggestion } from "@/lib/import/startingWeights";

function SuggestionRow({ suggestion }: { suggestion: StartingWeightSuggestion }) {
  const [draft, setDraft] = useState(String(suggestion.suggested));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const hand = suggestion.perHand ? " a hand" : "";
  const value = Number(draft);
  const valid = Number.isFinite(value) && value > 0 && value <= 1000;
  const same = suggestion.current === suggestion.suggested;
  const inputId = `start-${suggestion.id.replace(/\|/g, "-")}`;

  const confirm = async () => {
    if (!valid) return;
    setState("saving");
    try {
      await recordAdjustment(adjustmentFor(suggestion, value));
      setState("saved");
    } catch (error) {
      console.error("Saving a starting weight failed:", error);
      setState("failed");
    }
  };

  return (
    <li className="border-b border-border py-3 last:border-b-0" data-testid="starting-weight">
      <div className="flex items-center gap-2">
        <TierBadge tier={suggestion.tier} variant="soft" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{suggestion.exerciseName}</p>
        <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
          {formatLb(suggestion.current)} → <span className="font-semibold text-foreground">{formatLb(suggestion.suggested)}</span> lb{hand}
        </span>
      </div>
      <details className="mt-1">
        <summary className="flex min-h-11 cursor-pointer items-center text-xs text-primary">How this was worked out</summary>
        <ol className="list-decimal space-y-1 pb-2 pl-5 text-xs text-muted-foreground">
          {suggestion.working.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      </details>
      {state === "saved" ? (
        <p role="status" className="text-sm text-success">
          Saved: {formatLb(value)} lb{hand} from your next {suggestion.location === "home" ? "home " : ""}session.
        </p>
      ) : same ? (
        <p className="text-xs text-muted-foreground">Already planned at this weight.</p>
      ) : (
        <div className="flex items-end gap-2">
          <label htmlFor={inputId} className="flex flex-col gap-1 text-xs text-muted-foreground">
            Weight{hand ? " per hand" : ""} (lb)
            <input
              id={inputId}
              type="number"
              inputMode="decimal"
              min={0}
              step={suggestion.location === "home" || suggestion.perHand ? 5 : 2.5}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-11 w-24 rounded-md border border-input bg-background px-2 text-right font-mono text-sm tabular-nums text-foreground"
            />
          </label>
          <Button className="min-h-11 flex-1" onClick={confirm} disabled={!valid || state === "saving"}>
            {state === "saving" ? "Saving…" : `Use ${valid ? formatLb(value) : "–"} lb${hand}`}
          </Button>
        </div>
      )}
      {state === "failed" && (
        <p role="alert" className="text-xs text-destructive">
          Not saved; nothing was changed. Try again.
        </p>
      )}
    </li>
  );
}

/**
 * Starting weights from the history, each with its working. Nothing changes until one
 * is confirmed: confirming records a starting-weight adjustment for that lift (or its
 * home exercise), which shows in the adjustment log and can be changed like any other.
 */
export function StartingWeights() {
  const suggestions = useStartingWeights();
  if (suggestions === undefined) return <Skeleton className="h-40 w-full" />;
  if (suggestions.length === 0) {
    return (
      <Callout variant="info" title="No starting weights yet">
        None of the imported exercises is a program lift or one of its home exercises, so there is nothing to suggest.
      </Callout>
    );
  }
  const gym = suggestions.filter((s) => s.location === "gym");
  const home = suggestions.filter((s) => s.location === "home");
  return (
    <section aria-label="Starting weights" className="flex flex-col gap-3" data-testid="starting-weights">
      <div>
        <h2 className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Starting weights from your history
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Worked out from your recent sessions of each lift, older ones counting less. Nothing changes until you choose
          a weight; you can edit it first.
        </p>
      </div>
      {gym.length > 0 && (
        <div className="rounded-xl bg-card px-4 pt-3">
          <LocationChip location="gym" />
          <ul>
            {gym.map((s) => (
              <SuggestionRow key={s.id} suggestion={s} />
            ))}
          </ul>
        </div>
      )}
      {home.length > 0 && (
        <div className="rounded-xl bg-card px-4 pt-3">
          <LocationChip location="home" />
          <ul>
            {home.map((s) => (
              <SuggestionRow key={s.id} suggestion={s} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
