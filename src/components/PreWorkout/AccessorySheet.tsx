"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Minus, Pin, Plus, Repeat2, Search, X } from "lucide-react";
import { accessoryLoadStep, type AccessoryCandidate } from "@/lib/accessories/index";
import { getPhaseAccessoryCap } from "@/lib/accessories";
import { EXERCISES } from "@/lib/exercises";
import { cn } from "@/lib/utils";
import {
  accessoryMinutes,
  prescribeAccessory,
  type AccessoryRow,
  type AccessorySource,
} from "@/lib/workout/accessoryPlan";
import type { ChooseAccessoriesResult } from "@/lib/accessories/index";
import type { AccessoryMode, TrainingPhase } from "@/types";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PlanYou } from "@/components/SetPlan/PlanYou";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { accessoryScheme, accessoryWeightParts, accessoryWeightText, viewsOfRows } from "@/components/Today/accessoryRowModel";
import { displayLiftName } from "@/components/Today/todayModel";
import {
  addLists,
  mainMuscleOf,
  muscleChip,
  rankedCandidates,
  searchCandidates,
  swapAlternatives,
} from "./accessorySheetModel";

export type AccessorySheetView = "picks" | "add";

const MODES: { value: AccessoryMode; label: string }[] = [
  { value: "auto", label: "Chosen for me" },
  { value: "ask", label: "Ask me" },
  { value: "none", label: "None" },
];

function modeLine(mode: AccessoryMode, cap: number): string {
  switch (mode) {
    case "auto":
      return `Every workout comes with up to ${cap} chosen for you, with the reasons. Change any of them here.`;
    case "ask":
      return "Nothing is planned: add the ones you want here before each workout.";
    case "none":
      return "No accessories are planned. You can still add one here.";
  }
}

const SECTION = "text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase";
const ICON_BUTTON =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export interface AccessorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which part opens first: today's picks, or the Add list (mid-workout). */
  initialView?: AccessorySheetView;
  /** The day's name, for the title ("Squat day"). */
  dayLabel: string;
  /** The accessories in the workout now, each with its prescription and reasons. */
  rows: readonly AccessoryRow[];
  /** Today's scored list (for swap and Add). */
  choice: ChooseAccessoriesResult | null;
  /** What an accessory not in the workout is prescribed from. */
  source: AccessorySource;
  /** Every exercise in the workout (lifts included): never offered again. */
  inPlan: readonly string[];
  phase: TrainingPhase;
  mode?: AccessoryMode;
  /** The exercises pinned to this day. */
  pins?: readonly string[];
  onAdd: (exerciseId: string) => void | Promise<void>;
  onRemove?: (exerciseId: string) => void;
  onSwap?: (exerciseId: string, replacementId: string) => void;
  onClear?: () => void;
  onWeight?: (exerciseId: string, weight: number | null) => void | Promise<void>;
  onMode?: (mode: AccessoryMode) => void | Promise<void>;
  onPin?: (exerciseId: string, pinned: boolean) => void | Promise<void>;
  /** Only the Add list (mid-workout): no picks, mode or pins. */
  addOnly?: boolean;
  /** During a workout: evidence lines without the link to the library. */
  inWorkout?: boolean;
}

/**
 * The one sheet for a workout's accessories (A8), from the Ready screen (and Today's
 * "Change") or mid-workout: today's picks as cards (weight in place with the plan's
 * beside one set by hand, sets × reps, the reason, the minutes it adds, remove, swap
 * for the same muscle, "always on this day"), Add with search and three lists, the
 * mode, and "No accessories today" in one tap.
 */
export function AccessorySheet(props: AccessorySheetProps) {
  const { open, onOpenChange, initialView = "picks", addOnly = false } = props;
  const [view, setView] = useState<AccessorySheetView>(addOnly ? "add" : initialView);
  const close = (next: boolean) => {
    if (!next) setView(addOnly ? "add" : initialView);
    onOpenChange(next);
  };
  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent
        side="bottom"
        className={cn(
          "mx-auto flex max-h-[90dvh] max-w-lg flex-col gap-0 overflow-y-auto rounded-t-3xl border-border bg-card px-5 pt-5",
          "pb-[calc(env(safe-area-inset-bottom)+20px)]"
        )}
      >
        {view === "add" ? (
          <AddView {...props} onBack={addOnly ? undefined : () => setView("picks")} onDone={() => close(false)} />
        ) : (
          <PicksView {...props} onAddView={() => setView("add")} onDone={() => close(false)} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function PicksView({
  dayLabel,
  rows,
  choice,
  inPlan,
  phase,
  mode = "auto",
  pins = [],
  source,
  onRemove,
  onSwap,
  onClear,
  onWeight,
  onMode,
  onPin,
  onAddView,
  onDone,
  inWorkout,
}: AccessorySheetProps & { onAddView: () => void; onDone: () => void }) {
  const ranked = useMemo(() => rankedCandidates(choice), [choice]);
  const views = useMemo(() => viewsOfRows(rows), [rows]);
  const minutes = rows.reduce((sum, row) => sum + accessoryMinutes(row.entry.targetSets, phase), 0);
  const cap = getPhaseAccessoryCap(phase);
  return (
    <>
      <SheetTitle className="pr-10 text-lg">Accessories · {dayLabel}</SheetTitle>
      <SheetDescription className="mb-3 text-sm text-muted-foreground">
        {rows.length === 0
          ? "None in this workout."
          : `${rows.length} in this workout, about ${minutes} min with their rests.`}
      </SheetDescription>

      <ul aria-label="Today's accessories" className="flex flex-col gap-2.5">
        {rows.map((row, i) => (
          <AccessoryCard
            key={row.exerciseId}
            row={row}
            view={views[i]}
            phase={phase}
            pinned={pins.includes(row.exerciseId)}
            alternatives={swapAlternatives(row.exerciseId, ranked, inPlan)}
            source={source}
            onRemove={onRemove}
            onSwap={onSwap}
            onWeight={onWeight}
            onPin={onPin}
          />
        ))}
      </ul>

      <div className="mt-3 flex gap-2">
        <Button variant="outline" className="min-h-11 flex-1" onClick={onAddView}>
          <Plus aria-hidden="true" />
          Add
        </Button>
        {onClear && (
          <Button variant="outline" className="min-h-11 flex-1" disabled={rows.length === 0} onClick={onClear}>
            <X aria-hidden="true" />
            No accessories today
          </Button>
        )}
      </div>

      {onMode && (
        <section aria-label="How accessories are chosen" className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
          <h3 className={SECTION}>Every workout</h3>
          <SegmentedControl value={mode} onChange={(next) => void onMode(next)} options={MODES} size="compact" />
          <p data-testid="accessory-mode-line" className="text-[13px] leading-snug text-muted-foreground">
            {modeLine(mode, cap)}
          </p>
          {phase.mode === "cutting" && <EvidenceLine ruleId="accessories-in-cut" variant="icon" />}
        </section>
      )}

      <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3">
        <EvidenceLine ruleId="accessory-selection" hideLibraryLink={inWorkout} />
        <EvidenceLine ruleId="accessory-progression" hideLibraryLink={inWorkout} />
      </div>

      <Button className="mt-3 min-h-11" onClick={onDone}>
        Done
      </Button>
    </>
  );
}

/** One of today's accessories, with everything that can be changed about it. */
function AccessoryCard({
  row,
  view,
  phase,
  pinned,
  alternatives,
  source,
  onRemove,
  onSwap,
  onWeight,
  onPin,
}: {
  row: AccessoryRow;
  view: ReturnType<typeof viewsOfRows>[number];
  phase: TrainingPhase;
  pinned: boolean;
  alternatives: AccessoryCandidate[];
  source: AccessorySource;
  onRemove?: (exerciseId: string) => void;
  onSwap?: (exerciseId: string, replacementId: string) => void;
  onWeight?: (exerciseId: string, weight: number | null) => void | Promise<void>;
  onPin?: (exerciseId: string, pinned: boolean) => void | Promise<void>;
}) {
  const [swapping, setSwapping] = useState(false);
  const { exerciseId, prescription } = row;
  const muscle = muscleChip(mainMuscleOf(exerciseId));
  const step = accessoryLoadStep(exerciseId, source.settings.equipment);
  const bodyweight = EXERCISES[exerciseId]?.type === "bodyweight";
  const weight = row.entry.weight;
  const planWeight = prescription.basis === "hand" ? prescription.planWeight : null;
  return (
    <li data-testid="accessory-card" className="flex flex-col gap-1.5 rounded-2xl bg-secondary px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[16px] leading-tight font-bold">{view.name}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {muscle && (
              <span className="rounded-full bg-tier-accessory-soft px-2 py-0.5 font-semibold text-tier-accessory">
                {muscle}
              </span>
            )}
            <span data-testid="accessory-minutes">+{accessoryMinutes(row.entry.targetSets, phase)} min</span>
          </p>
        </div>
        {onRemove && (
          <button
            type="button"
            aria-label={`Remove ${view.name}`}
            onClick={() => onRemove(exerciseId)}
            className="-mt-1 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        {onWeight && !bodyweight ? (
          <WeightStepper
            name={view.name}
            weight={weight}
            step={step}
            perHand={view.perHand}
            onChange={(next) => void onWeight(exerciseId, next)}
          />
        ) : (
          <b className="font-display text-[26px] leading-none font-extrabold tabular-nums">{accessoryWeightText(view)}</b>
        )}
        <span className="font-mono text-sm font-medium text-muted-foreground" data-testid="accessory-scheme">
          {accessoryScheme(view.sets, view.reps)}
        </span>
      </div>

      {planWeight != null && onWeight && (
        <div data-testid="plan-you" className="flex items-center gap-3 border-t border-border pt-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <PlanYou planWeight={planWeight} weight={weight} className="text-sm" />
            <p className="text-[13px] text-muted-foreground">Set by you, until you next log it.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-11 shrink-0"
            aria-label={`Use plan's weight, ${planWeight} lb`}
            onClick={() => void onWeight(exerciseId, null)}
          >
            Use {planWeight}
          </Button>
        </div>
      )}

      {/* The first reason that the pin button below does not already say. */}
      {(() => {
        const reasons = row.pick?.reasons.filter((r) => !(onPin && r === "Always on this day")) ?? [];
        const reason = reasons[0] ?? (row.pick ? null : view.reason);
        return (
          <p className="text-[13px] leading-snug">
            {reason && <span className="block">{reason}</span>}
            <span className="block text-muted-foreground">{prescription.note}</span>
          </p>
        );
      })()}

      <div className="-mx-1 -mb-1 flex flex-wrap gap-1">
        {onSwap && (
          <button
            type="button"
            aria-expanded={swapping}
            onClick={() => setSwapping((was) => !was)}
            className={cn(ICON_BUTTON, "text-primary")}
          >
            <Repeat2 className="size-4" aria-hidden="true" />
            Swap
          </button>
        )}
        {onPin && (
          <button
            type="button"
            aria-pressed={pinned}
            onClick={() => void onPin(exerciseId, !pinned)}
            className={cn(ICON_BUTTON, pinned ? "bg-tier-accessory-soft text-tier-accessory" : "text-primary")}
          >
            <Pin className="size-4" aria-hidden="true" />
            Always on this day
          </button>
        )}
      </div>

      {swapping && onSwap && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-2">
          <p className={SECTION}>Instead, for the {muscle?.toLowerCase() ?? "same muscle"}</p>
          {alternatives.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nothing else works this muscle today.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {alternatives.map((alt) => (
                <CandidateItem
                  key={alt.exerciseId}
                  candidate={alt}
                  source={source}
                  actionLabel="Swap"
                  onCard
                  onPick={() => {
                    onSwap(exerciseId, alt.exerciseId);
                    setSwapping(false);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/** The weight, set in place: − and + by the exercise's step, or typed. */
function WeightStepper({
  name,
  weight,
  step,
  perHand,
  onChange,
}: {
  name: string;
  weight: number;
  step: number;
  perHand: boolean;
  onChange: (weight: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (value: number) => {
    setDraft(null);
    if (Number.isFinite(value) && value >= 0 && value !== weight) onChange(Math.round(value * 100) / 100);
  };
  const stepButton =
    "inline-flex size-11 items-center justify-center rounded-full bg-card text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-40";
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`${name} ${step} lb lighter`}
        disabled={weight - step < 0}
        onClick={() => commit(weight - step)}
        className={stepButton}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <label className="flex items-baseline gap-1">
        <input
          aria-label={`${name} weight in pounds`}
          inputMode="decimal"
          value={draft ?? (weight > 0 ? String(weight) : "")}
          placeholder="—"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => draft !== null && commit(Number(draft))}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          }}
          className="w-[3.2ch] min-w-[2.5ch] bg-transparent text-center font-display text-[26px] leading-none font-extrabold tabular-nums outline-none focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50"
          style={{ width: `${Math.max(2.5, (draft ?? String(weight)).length + 0.6)}ch` }}
        />
        <span className="text-sm text-muted-foreground">{perHand ? "lb/hand" : "lb"}</span>
      </label>
      <button type="button" aria-label={`${name} ${step} lb heavier`} onClick={() => commit(weight + step)} className={stepButton}>
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** A choice in a list: name, muscle, its prescription and first reason, and the action. */
function CandidateItem({
  candidate,
  source,
  actionLabel,
  onPick,
  onCard = false,
}: {
  candidate: AccessoryCandidate;
  source: AccessorySource;
  actionLabel: string;
  onPick: () => void;
  /** Inside a card (the swap list): drawn on the card's colour's opposite. */
  onCard?: boolean;
}) {
  const p = useMemo(() => prescribeAccessory(candidate.exerciseId, source), [candidate.exerciseId, source]);
  const name = displayLiftName(candidate.exerciseId);
  const muscle = muscleChip(mainMuscleOf(candidate.exerciseId));
  const reason = candidate.reasons[0] ?? "";
  // The muscle, unless the reason already names it.
  const subtitle = muscle && !reason.startsWith(muscle) ? [muscle, reason].filter(Boolean).join(" · ") : reason;
  const weight = accessoryWeightParts({
    weight: p.weight && p.weight > 0 ? p.weight : null,
    perHand: EXERCISES[candidate.exerciseId]?.grip === "per_hand",
    bodyweight: EXERCISES[candidate.exerciseId]?.type === "bodyweight",
  });
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-label={`${actionLabel} ${name}`}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          onCard ? "bg-card" : "bg-secondary"
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
        <span className="shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
          <span className="block font-semibold text-foreground">
            {weight.value}
            {weight.unit}
          </span>
          {accessoryScheme(p.sets, p.reps)}
        </span>
        <span className="shrink-0 text-[13px] font-semibold text-primary">{actionLabel}</span>
      </button>
    </li>
  );
}

function AddView({
  choice,
  inPlan,
  source,
  onAdd,
  onBack,
  onDone,
  inWorkout,
}: AccessorySheetProps & { onBack?: () => void; onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const ranked = useMemo(() => rankedCandidates(choice), [choice]);
  const lists = useMemo(() => addLists(ranked, inPlan), [ranked, inPlan]);
  const found = useMemo(() => searchCandidates(ranked, inPlan, query), [ranked, inPlan, query]);
  const add = async (exerciseId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await onAdd(exerciseId);
      if (inWorkout) onDone();
      else onBack?.();
    } finally {
      setBusy(false);
    }
  };
  const list = (title: string, items: AccessoryCandidate[], empty?: string) => (
    <section aria-label={title} className="flex flex-col gap-1.5">
      <h3 className={SECTION}>{title}</h3>
      {items.length === 0 ? (
        empty && <p className="text-[13px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((c) => (
            <CandidateItem key={c.exerciseId} candidate={c} source={source} actionLabel="Add" onPick={() => void add(c.exerciseId)} />
          ))}
        </ul>
      )}
    </section>
  );
  return (
    <>
      <div className="flex items-center gap-1 pr-10">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to today's accessories"
            className="-ml-2 inline-flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
          </button>
        )}
        <SheetTitle className="text-lg">Add an accessory</SheetTitle>
      </div>
      <SheetDescription className="mb-3 text-sm text-muted-foreground">
        Each comes at the weight and sets the app gives it today.
      </SheetDescription>
      <label className="mb-4 flex min-h-11 items-center gap-2 rounded-xl bg-secondary px-3">
        <Search className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Search accessories</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or muscle"
          className="min-h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div className="flex flex-col gap-5">
        {query.trim() ? (
          list("Matches", found, "Nothing matches. Blocked exercises and today's lifts are left out.")
        ) : (
          <>
            {list("For today", lists.forToday, "Nothing else fits today.")}
            {list("Your usual", lists.usual, "None yet: the ones you do show here.")}
            <section aria-label="By muscle" className="flex flex-col gap-3">
              <h3 className={SECTION}>By muscle</h3>
              {lists.byMuscle.map((group) => (
                <div key={group.muscle} className="flex flex-col gap-1.5">
                  <p className="text-[13px] font-semibold">{group.label}</p>
                  <ul className="flex flex-col gap-1.5">
                    {group.items.map((c) => (
                      <CandidateItem key={c.exerciseId} candidate={c} source={source} actionLabel="Add" onPick={() => void add(c.exerciseId)} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
      <div className="mt-5 border-t border-border pt-3">
        <EvidenceLine ruleId="accessory-selection" hideLibraryLink={inWorkout} />
      </div>
      <Button variant="outline" className="mt-3 min-h-11" onClick={onDone}>
        Close
      </Button>
    </>
  );
}
