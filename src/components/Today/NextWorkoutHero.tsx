"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Dumbbell, Home, TrendingUp } from "lucide-react";
import {
  useE1RMs,
  useLiftStates,
  useNextWorkout,
  usePainEntries,
  useSettings,
  useTrainingLocation,
} from "@/hooks";
import { EXERCISES } from "@/lib/exercises";
import { combinedActivationHeat } from "@/lib/muscleLoad";
import { getExpiredPainEntries } from "@/lib/painAutoClear";
import { formatRegion } from "@/lib/painModifications";
import { describePrOpportunity } from "@/lib/projection";
import { tierStyle } from "@/lib/tierStyle";
import { cn } from "@/lib/utils";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import type { PainSorenessEntry, Tier, WorkoutLocation } from "@/types";
import type { TermId } from "@/lib/glossary";
import { Term } from "@/components/ui/term";
import { LocationChip } from "@/components/ui/location-chip";
import { MuscleMap } from "@/components/Anatomy/MuscleMap";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import {
  estimateWorkoutMinutes,
  formatLbs,
  formatPrChance,
  formatSetsReps,
  inSentence,
  shortLiftName,
} from "./format";
import { ComingUpLine } from "./ComingUpLine";

const LOCATION_OPTIONS = [
  { value: "gym" as const, label: "Gym", icon: <Dumbbell className="size-3.5" aria-hidden="true" /> },
  { value: "home" as const, label: "Home", icon: <Home className="size-3.5" aria-hidden="true" /> },
];

/**
 * The next workout in the rotation, its exercises at the training location and the
 * START button. The location is the saved default (`useTrainingLocation`): changing
 * it here changes it for Configure and everywhere else too.
 */
export function NextWorkoutHero() {
  const settings = useSettings();
  const { location, setLocation } = useTrainingLocation();
  const next = useNextWorkout(location);
  const changeLocation = (value: WorkoutLocation) => {
    setLocation(value).catch((err) => console.error("Failed to save training location:", err));
  };

  if (!next) return <NextWorkoutHeroSkeleton />;

  const working = next.plan.filter((entry) => !entry.isWarmUp);
  const t1 = working.find((entry) => entry.tier === "T1");
  const firstAMRAP = working.find((entry) => entry.isAMRAP);
  const minutes = estimateWorkoutMinutes(next.plan, settings?.trainingPhase);
  const dayName = t1 ? `${shortLiftName(t1.exerciseId)} day` : next.template.name;

  return (
    <section
      aria-labelledby="next-workout-title"
      className="flex flex-col gap-3.5 rounded-[18px] bg-card-raised p-[18px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">
            Next up · Workout {next.templateId} · about {minutes} min
          </span>
          <div className="flex min-w-0 items-center gap-2">
            <h2 id="next-workout-title" className="truncate text-xl font-bold text-foreground">
              {dayName}
            </h2>
            <LocationChip location={location} size="sm" />
          </div>
        </div>
        <MuscleMap
          heat={combinedActivationHeat(next.template.exercises.map((e) => e.exerciseId))}
          className="h-12 shrink-0"
          label={`Muscles ${next.template.name} targets`}
        />
      </div>

      <SegmentedControl value={location} onChange={changeLocation} options={LOCATION_OPTIONS} />

      <ul className="flex flex-col gap-2.5">
        {working.map((entry, index) => (
          <ExerciseLine
            key={`${entry.tier}-${entry.exerciseId}`}
            entry={entry}
            // Explain each kind of label once: the first tier, the first "+".
            explainTier={index === 0}
            explainScheme={entry === firstAMRAP}
          />
        ))}
      </ul>

      <PainNote plan={working} />
      {t1 && <PrChanceLine entry={t1} />}

      <Button
        asChild
        className="h-[54px] w-full rounded-[14px] text-base font-extrabold tracking-wide active:scale-[0.99]"
      >
        <Link href="/workout/configure">START WORKOUT</Link>
      </Button>

      {/* Below START on purpose: it can never push the button out of view. */}
      <ComingUpLine location={location} />
    </section>
  );
}

const TIER_TERM: Partial<Record<Tier, TermId>> = {
  T1: "t1",
  T2: "t2",
  T3: "t3",
  accessory: "accessory",
  warmup: "warm-up",
};

function ExerciseLine({
  entry,
  explainTier = false,
  explainScheme = false,
}: {
  entry: WorkoutExerciseState;
  explainTier?: boolean;
  explainScheme?: boolean;
}) {
  const shownId = entry.substituteExerciseId ?? entry.exerciseId;
  const exercise = EXERCISES[shownId];
  const perHand = entry.substituteExerciseId && exercise?.grip === "per_hand";
  const tierLabel = tierStyle(entry.tier).label;
  const tierTerm = explainTier ? TIER_TERM[entry.tier] : undefined;
  const scheme = formatSetsReps(entry);
  return (
    <li data-testid="hero-exercise" className="flex items-baseline gap-2.5">
      <span className={cn("w-[22px] font-mono text-[11px] font-bold", tierStyle(entry.tier).text)}>
        {tierTerm ? <Term id={tierTerm}>{tierLabel}</Term> : tierLabel}
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">
        {exercise?.name ?? shownId}
      </span>
      <span className="font-mono text-xl font-bold tabular-nums text-foreground">
        {formatLbs(entry.weight)}
      </span>
      {perHand && <span className="-ml-1.5 text-xs text-muted-foreground">/hand</span>}
      <span className="w-[46px] text-right font-mono text-xs text-muted-foreground">
        {explainScheme ? <Term id="amrap-plus">{scheme}</Term> : scheme}
      </span>
    </li>
  );
}

/** "PR chance on squat: 5+ reps on the last set beats 266. Likely." (U17) */
function PrChanceLine({ entry }: { entry: WorkoutExerciseState }) {
  const e1rms = useE1RMs(entry.exerciseId);
  const liftStates = useLiftStates();
  if (!e1rms || !liftStates || entry.substituteExerciseId) return null;

  const best = e1rms.reduce<number | null>(
    (max, row) => (Number.isFinite(row.estimated1RM) && (max === null || row.estimated1RM > max) ? row.estimated1RM : max),
    null
  );
  const state = liftStates.find((s) => s.exerciseId === entry.exerciseId);
  const opportunity = describePrOpportunity({
    tier: entry.tier,
    isAMRAP: entry.isAMRAP,
    weight: entry.weight,
    bestE1RM: best,
    recentAMRAPReps: state?.recentAMRAPReps ?? [],
  });
  if (!opportunity) return null;

  const chance = formatPrChance(opportunity.chance);
  // The whole box opens the lift (the link is stretched over it); "PR chance" sits
  // above the link and opens its glossary entry instead.
  return (
    <div className="relative flex items-center gap-2 rounded-[10px] bg-success-soft px-3 py-2.5 text-[13px] text-foreground transition-colors has-[a:hover]:bg-success-soft/80">
      <TrendingUp className="size-4 shrink-0 text-success" aria-hidden="true" />
      <span>
        <Term id="pr-chance" className="relative z-10">
          PR chance
        </Term>{" "}
        <Link
          href={`/progress/lift/${entry.exerciseId}`}
          className="outline-none after:absolute after:inset-0 after:rounded-[10px] after:content-[''] focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
        >
          on {inSentence(shortLiftName(entry.exerciseId))}:{" "}
          <b className="font-mono">{opportunity.repsNeeded}+</b> reps on the last set beats{" "}
          {Math.round(opportunity.bestE1RM)}.{chance && ` ${chance}`}
        </Link>
      </span>
    </div>
  );
}

/** Exercises in this workout that touch a region with pain logged in the last week. */
function PainNote({ plan }: { plan: WorkoutExerciseState[] }) {
  const entries = usePainEntries();
  const [now] = useState(() => new Date());
  if (!entries) return null;

  const expired = new Set(getExpiredPainEntries(entries, now).map((e) => e.id));
  const active = entries.filter((e: PainSorenessEntry) => e.sensation === "pain" && !expired.has(e.id));
  const warnings: string[] = [];
  for (const entry of plan) {
    const exercise = EXERCISES[entry.substituteExerciseId ?? entry.exerciseId];
    const hit = active.find((pain) => exercise?.painSensitiveRegions.includes(pain.region));
    if (exercise && hit) warnings.push(`${exercise.name}: ${formatRegion(hit.region).toLowerCase()} pain`);
  }
  if (warnings.length === 0) return null;

  return (
    <Link
      href="/body-check"
      className="flex items-start gap-2 rounded-[10px] bg-warning-soft px-3 py-2.5 text-[13px] text-foreground"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <span>
        May be affected by pain you logged: {warnings.join("; ")}. Review in body check.
      </span>
    </Link>
  );
}

export function NextWorkoutHeroSkeleton() {
  return (
    <div
      data-testid="next-workout-skeleton"
      aria-busy="true"
      className="flex flex-col gap-3.5 rounded-[18px] bg-card-raised p-[18px]"
    >
      <Skeleton className="h-3 w-48" />
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-9 w-full" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
      <Skeleton className="h-[54px] w-full rounded-[14px]" />
    </div>
  );
}
