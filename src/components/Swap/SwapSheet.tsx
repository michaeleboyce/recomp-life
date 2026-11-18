"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, Info, ListChecks } from "lucide-react";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { errorText } from "@/components/LogEdit/format";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { setExercisePreference } from "@/lib/data/records";
import { getExercise } from "@/lib/exercises";
import {
  recommendSwapSets,
  recommendSwaps,
  swapProgressionEffect,
  type SwapCandidate,
  type SwapContext,
} from "@/lib/swap";
import { cn } from "@/lib/utils";
import type { Tier } from "@/types";
import {
  confirmLabel,
  everyTimeOption,
  historyText,
  pairView,
  partsTotal,
  picked,
  pointsText,
  prescriptionText,
  swapSections,
  toggleSelection,
} from "./swapSheetModel";

const SECTION = "text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase";
const FOCUS = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export interface SwapPanelProps {
  /** The entry being replaced, as the plan names it (the program lift for a home substitute). */
  exerciseId: string;
  /** The exercise shown for the entry (a home substitute's own), for the title. */
  shownId?: string;
  tier: Tier;
  /** What the candidates are ranked from (`useSwapContext`); undefined while loading. */
  context: SwapContext | undefined;
  /** During a workout: evidence without the library link, and the sets already logged. */
  inWorkout?: boolean;
  /** Sets of the entry already logged (during a workout), for what is kept. */
  setsLogged?: number;
  /**
   * Applies the swap to this workout. The first pick takes the entry's place, the rest
   * are added. Throw an Error to show its message and keep the sheet open.
   */
  onConfirm: (picks: SwapCandidate[]) => void | Promise<void>;
  /** Shown as Back (inside another sheet); left out in its own sheet. */
  onBack?: () => void;
  /** Called once the swap is applied (and any "Every time" saved). */
  onDone?: () => void;
  /** Inside its own sheet: the title is the sheet's. */
  asSheet?: boolean;
}

/**
 * Swapping one exercise for one or more others (W9 to W12), before or during a workout:
 * the recommended candidates with what each would be done at, its reason, history and
 * score parts; pairs that cover it together; every other valid candidate; what the swap
 * does to the program; and "Every time" (off each time the sheet opens). Picking and
 * confirming applies it to this workout only.
 */
export function SwapPanel({
  exerciseId,
  shownId,
  tier,
  context,
  inWorkout = false,
  setsLogged,
  onConfirm,
  onBack,
  onDone,
  asSheet = false,
}: SwapPanelProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [multi, setMulti] = useState(false);
  // Never remembered: the sheet starts with it off every time.
  const [everyTime, setEveryTime] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => (context ? recommendSwaps(exerciseId, context) : []), [exerciseId, context]);
  const sets = useMemo(
    () => (context ? recommendSwapSets(exerciseId, context, { force: multi, candidates }) : []),
    [exerciseId, context, multi, candidates]
  );
  const { recommended, rest } = swapSections(candidates);
  const picks = picked(selected, candidates);
  const name = getExercise(shownId || exerciseId).name;
  const effectFor = picks[0]?.exerciseId ?? candidates[0]?.exerciseId;
  const effect = effectFor
    ? swapProgressionEffect(tier, exerciseId, effectFor, setsLogged ? { setsLogged } : {})
    : null;
  const location = context?.location ?? "gym";
  const standing = everyTimeOption(
    tier,
    shownId || exerciseId,
    picks.map((c) => c.exerciseId),
    location
  );

  const tap = (id: string) => {
    setError(null);
    setSelected((was) => toggleSelection(was, id, multi));
  };
  const pickPair = (ids: readonly string[]) => {
    setError(null);
    setMulti(true);
    setSelected([...ids]);
  };
  const toggleMulti = () => {
    // Back to one at a time: keep the first pick only.
    if (multi) setSelected((s) => s.slice(0, 1));
    setMulti(!multi);
  };

  const confirm = async () => {
    if (busy || picks.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(picks);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
      return;
    }
    if (everyTime) {
      try {
        for (const write of standing.writes) {
          await setExercisePreference(write.scope, write.exerciseId, write.preference);
        }
      } catch (err) {
        console.error("Failed to save the standing swap:", err);
        setError("Swapped for today, but Every time could not be saved. Try it in Exercises.");
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    onDone?.();
  };

  const Title = asSheet ? SheetTitle : "p";
  const Description = asSheet ? SheetDescription : "p";
  const description =
    setsLogged && setsLogged > 0
      ? `${setsLogged === 1 ? "1 set is" : `${setsLogged} sets are`} done. For this workout only.`
      : "For this workout only.";

  return (
    <div className="flex flex-col gap-4" data-testid="swap-panel">
      <div className="flex flex-col gap-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className={cn("-ml-1 flex min-h-11 items-center gap-1 self-start rounded-lg pr-3 text-sm font-medium text-muted-foreground", FOCUS)}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Back
          </button>
        )}
        <Title className="pr-10 text-lg font-semibold">Swap {name}</Title>
        <Description className="text-sm text-muted-foreground">{description}</Description>
      </div>

      {!context ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing else fits here.</p>
      ) : (
        <>
          <section aria-label="Recommended" className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className={SECTION}>Recommended</h3>
              <button
                type="button"
                aria-pressed={multi}
                onClick={toggleMulti}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold",
                  FOCUS,
                  multi ? "bg-accent-primary-soft text-foreground" : "text-primary"
                )}
              >
                <ListChecks className="size-4" aria-hidden="true" />
                Pick more than one
              </button>
            </div>
            <ul className="flex flex-col gap-1.5">
              {recommended.map((c) => (
                <CandidateRow
                  key={c.exerciseId}
                  candidate={c}
                  tier={tier}
                  now={context.now}
                  selected={selected.includes(c.exerciseId)}
                  order={multi && selected.length > 1 ? selected.indexOf(c.exerciseId) : -1}
                  onTap={() => tap(c.exerciseId)}
                />
              ))}
            </ul>
          </section>

          {sets.length > 0 && (
            <section aria-label="Covers it together" className="flex flex-col gap-1.5">
              <h3 className={SECTION}>Covers it together</h3>
              <ul className="flex flex-col gap-1.5">
                {sets.map((set) => {
                  const view = pairView(set);
                  const on = view.ids.every((id) => selected.includes(id)) && selected.length === 2;
                  return (
                    <li key={view.ids.join("+")}>
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`Pick ${view.members.map((m) => m.name).join(" and ")}`}
                        onClick={() => pickPair(view.ids)}
                        className={cn(
                          "flex min-h-11 w-full flex-col gap-1 rounded-xl border px-3 py-2 text-left",
                          FOCUS,
                          on ? "border-accent-primary bg-accent-primary-soft" : "border-transparent bg-secondary"
                        )}
                      >
                        {view.members.map((m) => (
                          <span key={m.exerciseId} className="flex min-w-0 flex-col">
                            <span className="truncate text-[14px] font-semibold">{m.name}</span>
                            <span className="text-xs text-muted-foreground">{m.covers}</span>
                          </span>
                        ))}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {rest.length > 0 && (
            <section aria-label="All exercises" className="flex flex-col gap-1.5">
              <button
                type="button"
                aria-expanded={showAll}
                onClick={() => setShowAll((was) => !was)}
                className={cn("flex min-h-11 items-center justify-between gap-2 rounded-lg", FOCUS)}
              >
                <span className={SECTION}>All exercises ({rest.length})</span>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", showAll && "rotate-180")} aria-hidden="true" />
              </button>
              {showAll && (
                <ul className="flex flex-col gap-1">
                  {rest.map((c) => (
                    <CandidateRow
                      key={c.exerciseId}
                      candidate={c}
                      tier={tier}
                      now={context.now}
                      compact
                      selected={selected.includes(c.exerciseId)}
                      order={multi && selected.length > 1 ? selected.indexOf(c.exerciseId) : -1}
                      onTap={() => tap(c.exerciseId)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}

          <div className="flex flex-col gap-3 border-t border-border pt-3">
            {effect && (
              <p data-testid="swap-effect" className="text-[13px] leading-snug">
                {effect.text}
              </p>
            )}
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold">{standing.label}</span>
                {everyTime && (
                  <span data-testid="every-time-detail" className="text-xs leading-snug text-muted-foreground">
                    {standing.detail}
                  </span>
                )}
              </span>
              <Switch checked={everyTime} onCheckedChange={setEveryTime} aria-label={standing.label} />
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button className="min-h-11" disabled={picks.length === 0 || busy} onClick={() => void confirm()}>
              {confirmLabel(picks)}
            </Button>
            <EvidenceLine ruleId="swap-recommendation" hideLibraryLink={inWorkout} />
          </div>
        </>
      )}
    </div>
  );
}

/** One candidate: name, what it would be done at, its reason and history; the info control opens its score parts. */
function CandidateRow({
  candidate,
  tier,
  now,
  selected,
  order,
  compact = false,
  onTap,
}: {
  candidate: SwapCandidate;
  tier: Tier;
  now: Date;
  selected: boolean;
  /** Its place among several picks (0 takes the entry's place); -1 when not shown. */
  order: number;
  compact?: boolean;
  onTap: () => void;
}) {
  const [open, setOpen] = useState(false);
  const name = getExercise(candidate.exerciseId).name;
  const total = partsTotal(candidate);
  return (
    <li
      data-testid="swap-candidate"
      className={cn(
        "flex flex-col rounded-xl border",
        selected ? "border-accent-primary bg-accent-primary-soft" : "border-transparent bg-secondary"
      )}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          aria-pressed={selected}
          aria-label={`Pick ${name}`}
          onClick={onTap}
          className={cn("flex min-h-11 min-w-0 flex-1 flex-col gap-0.5 rounded-xl px-3 text-left", compact ? "py-1.5" : "py-2", FOCUS)}
        >
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate font-semibold", compact ? "text-[13px]" : "text-[15px]")}>
              {order >= 0 && <span className="mr-1 font-mono text-xs text-muted-foreground">{order + 1}.</span>}
              {name}
            </span>
            <span data-testid="swap-prescription" className="shrink-0 font-mono text-xs font-semibold tabular-nums">
              {prescriptionText(candidate.exerciseId, candidate.prescription, tier)}
            </span>
          </span>
          {candidate.reason && (
            <span className={cn("text-xs leading-snug text-muted-foreground", compact && "truncate")}>{candidate.reason}</span>
          )}
          {!compact && (
            <span data-testid="swap-history" className="text-xs text-muted-foreground">
              {historyText(candidate.history, now)}
            </span>
          )}
        </button>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`Why ${name}: score ${total}`}
          onClick={() => setOpen((was) => !was)}
          className={cn("inline-flex size-11 shrink-0 items-center justify-center self-center rounded-full text-muted-foreground hover:text-foreground", FOCUS)}
        >
          <Info className="size-4" aria-hidden="true" />
        </button>
      </div>
      {open && (
        <ul aria-label={`${name} score`} className="flex flex-col gap-1 border-t border-border px-3 py-2">
          {candidate.parts.map((part) => (
            <li key={part.id} data-testid="swap-part" className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-xs">
              <span className="font-semibold">{part.label}</span>
              <span className="text-right font-mono tabular-nums">{pointsText(part.points)}</span>
              <span className="col-span-2 leading-snug text-muted-foreground">{part.detail}</span>
            </li>
          ))}
          <li data-testid="swap-total" className="flex justify-between border-t border-border pt-1 text-xs font-semibold">
            <span>Score</span>
            <span className="font-mono tabular-nums">{total}</span>
          </li>
        </ul>
      )}
    </li>
  );
}

/** The swap sheet on its own (during a workout): the panel in a bottom sheet. */
export function SwapSheet({
  open,
  onOpenChange,
  ...panel
}: Omit<SwapPanelProps, "asSheet" | "onBack" | "onDone"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "mx-auto flex max-h-[90dvh] max-w-lg flex-col gap-0 overflow-y-auto rounded-t-3xl border-border bg-card px-5 pt-5",
          "pb-[calc(env(safe-area-inset-bottom)+20px)]"
        )}
      >
        {/* Mounted per opening, so every choice (Every time included) starts fresh. */}
        <SwapPanel {...panel} asSheet onDone={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
