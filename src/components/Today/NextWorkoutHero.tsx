"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  useCompletedWorkouts,
  useLiftStates,
  useOpenWorkoutForecast,
  usePainEntries,
  useSettings,
  useTodayWorkout,
  useTrainingLocation,
  useUnfinishedWorkout,
} from "@/hooks";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { EXERCISES } from "@/lib/exercises";
import { leftOutNote } from "@/lib/accessories/sessionBudget";
import { getExpiredPainEntries } from "@/lib/painAutoClear";
import { formatRegion } from "@/lib/painModifications";
import { planForSession } from "@/lib/workout/planForSession";
import type { WorkoutExerciseState, WorkoutPlan } from "@/lib/workout/types";
import { workoutDisplayName } from "@/lib/workoutNames";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { PainSorenessEntry, WorkoutLocation, WorkoutSession } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { AccessoryRows, CHANGE_ACCESSORIES_HREF } from "./AccessoryRows";
import { accessoryRowViews } from "./accessoryRowModel";
import { ComingUpLine } from "./ComingUpLine";
import { ForecastTiles } from "./ForecastTiles";
import { LiftRows, buildLiftRows } from "./LiftRows";
import { TodayHero } from "./TodayHero";
import { dayName } from "./todayModel";

/**
 * The top of Today, everything above the fold: the photo hero with the gym/home
 * switch, the forecast tiles, one row per lift and START, then any pain warning and
 * the coming-up line. The location is the saved default (`useTrainingLocation`):
 * changing it here changes it for Configure and everywhere else too.
 */
export function NextWorkoutHero() {
  const { location, setLocation } = useTrainingLocation();
  // The next workout resolved once: the lift rows, the forecast tiles and readiness all
  // read this one plan.
  const today = useTodayWorkout(location);
  const next = today?.next;
  const nextForecast = today?.forecast;
  const finished = useCompletedWorkouts();
  const open = useUnfinishedWorkout();
  const openPlan = useOpenPlan(open);
  const openForecast = useOpenWorkoutForecast(open, openPlan);
  const changeLocation = (value: WorkoutLocation) => {
    setLocation(value).catch((err) => console.error("Failed to save training location:", err));
  };

  // While a workout is open, Today shows that workout as the workout screen runs it
  // (its stored plan and forecasts), not the next one worked out again.
  const openTemplate = open ? WORKOUT_TEMPLATES[open.templateId] : undefined;
  const showOpen = Boolean(open && openTemplate && openPlan);
  const plan = showOpen ? openPlan : next?.plan;
  const working = useMemo(() => plan?.filter((entry) => !entry.isWarmUp) ?? [], [plan]);
  // The program's lifts get the lift rows; the accessories their own, under T3 (A7).
  const program = useMemo(() => working.filter((entry) => entry.tier !== "accessory"), [working]);
  const rows = useMemo(() => buildLiftRows(program, finished ?? []), [program, finished]);
  const accessories = useMemo(
    () => (plan ? accessoryRowViews(plan, showOpen ? null : next?.accessories) : []),
    [plan, showOpen, next]
  );

  // Until it is known whether a workout is open, neither Start nor Resume is shown.
  if (!next || open === undefined || (open && openTemplate && !openPlan)) {
    return <NextWorkoutHeroSkeleton />;
  }

  // The session length the next workout's accessories were kept to (not an open one's).
  const budget = showOpen ? null : (next.accessories?.budget ?? null);
  const template = showOpen ? openTemplate! : next.template;
  const templateId = showOpen ? open!.templateId : next.templateId;
  const t1 = working.find((entry) => entry.tier === "T1");
  const title = dayName(template.exercises.find((e) => e.tier === "T1")?.exerciseId, template.name);

  return (
    <div className="flex flex-col">
      <TodayHero
        templateId={templateId}
        title={title}
        working={working}
        location={showOpen ? open!.location : location}
        onLocationChange={showOpen ? undefined : changeLocation}
        eyebrow={showOpen ? "In progress" : "Next up"}
      />
      <ForecastTiles
        forecast={showOpen ? openForecast : nextForecast}
        newBestHref={t1 && !t1.substituteExerciseId ? `/progress/lift/${t1.exerciseId}` : undefined}
        sessionTarget={budget?.minutes}
      />
      <LiftRows rows={rows} />
      {(accessories.length > 0 || !showOpen) && (
        <AccessoryRows
          views={accessories}
          collapsible
          why={!showOpen}
          changeHref={showOpen ? undefined : CHANGE_ACCESSORIES_HREF}
          timeNote={leftOutNote(budget)}
          className="px-5"
        />
      )}
      <div className="flex flex-col gap-1 px-5 pt-2">
        {open ? (
          <ResumeOpen session={open} />
        ) : (
          <Link href="/workout/configure" className={MAIN_BUTTON}>
            Start workout
          </Link>
        )}
        {/* Below START on purpose: neither can push the button out of view. */}
        <PainNote plan={working} />
        <ComingUpLine location={location} />
      </div>
    </div>
  );
}

/**
 * The plan of the open workout as the workout screen rebuilds it (`planForSession`),
 * `undefined` while loading or when no workout is open.
 */
function useOpenPlan(open: WorkoutSession | null | undefined): WorkoutPlan | undefined {
  const liftStates = useLiftStates();
  const settings = useSettings();
  return useMemo(() => {
    const template = open ? WORKOUT_TEMPLATES[open.templateId] : undefined;
    if (!open || !template || !liftStates || settings === undefined) return undefined;
    const equipment = (settings ?? DEFAULT_USER_PROFILE.settings).equipment;
    return planForSession({ session: open, template, liftStates, equipment });
  }, [open, liftStates, settings]);
}

const MAIN_BUTTON =
  "flex h-[58px] shrink-0 items-center justify-center rounded-full bg-primary font-display text-[19px] leading-none font-extrabold tracking-[0.14em] text-primary-foreground uppercase outline-none transition-transform focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.99]";

/**
 * A workout is already open: the main button resumes it, so START cannot leave a
 * second one behind. Starting a fresh one stays possible, and says what happens to
 * the open one (it is discarded once the new one actually starts).
 */
function ResumeOpen({ session }: { session: WorkoutSession }) {
  const logged = session.sets.filter((set) => set.tier !== "warmup").length;
  const what = `${workoutDisplayName(session.templateId)}${
    logged > 0 ? ` (${logged} ${logged === 1 ? "set" : "sets"} logged)` : ""
  }`;
  return (
    <>
      <Link href={`/workout/active?sessionId=${session.id}`} className={MAIN_BUTTON}>
        Resume workout
      </Link>
      <p className="pt-1 text-center text-[13px] text-muted-foreground">
        <Link
          href="/workout/configure"
          className="font-semibold text-accent-primary underline decoration-dotted underline-offset-4"
        >
          Start a new one
        </Link>{" "}
        <span data-testid="replaces-note">
          instead: the open {what} is discarded when the new one starts.
        </span>
      </p>
    </>
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
      href="/body-check?from=today"
      className="mt-2 flex items-start gap-2 rounded-[10px] bg-warning-soft px-3 py-2.5 text-[13px] text-foreground"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <span>
        May be affected by pain you logged: {warnings.join("; ")}. Review in body check.
      </span>
    </Link>
  );
}

/** Holds the hero's place while the plan loads, so nothing jumps when it arrives. */
export function NextWorkoutHeroSkeleton() {
  return (
    <div data-testid="next-workout-skeleton" aria-busy="true" className="flex flex-col">
      <Skeleton className="h-[calc(322px+env(safe-area-inset-top))] w-full rounded-none" />
      <div className="flex flex-col gap-2 px-5 pt-2.5">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-16 w-full rounded-2xl" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
        <Skeleton className="h-[58px] w-full rounded-full" />
      </div>
    </div>
  );
}
