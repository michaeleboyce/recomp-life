"use client";

// The glass-box parts of the workout screens: what the stored forecast says under the
// rep buttons, how the last set compared with it on the rest screen, and the card for
// what comes next. Each reads stored rows only.
import Link from "next/link";
import { ExerciseMuscleThumb } from "@/components/Anatomy/ExerciseMuscleThumb";
import { Term } from "@/components/ui/term";
import { getExercise } from "@/lib/exercises";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import type { Forecast } from "@/types";
import type { ForecastNote, LastSetVerdict } from "./glassForecast";

/** Where the forecast track record lives. */
export const TRACK_RECORD_HREF = "/progress/forecasts/record";

/** One or two sentences under the rep forecast, and the link to its track record. */
export function ForecastNoteLine({ note }: { note: ForecastNote }) {
  return (
    <p data-testid="forecast-note" className="text-[13px] leading-snug">
      <b className="font-semibold text-accent-primary">{note.lead}</b>
      {note.chance} {note.selected && <>{note.selected} </>}
      <span className="text-muted-foreground">{note.basis}</span>{" "}
      <Link
        href={TRACK_RECORD_HREF}
        className="font-semibold text-accent-primary underline decoration-dotted underline-offset-4"
      >
        How right has this been?
      </Link>
    </p>
  );
}

/** Top of the rest screen after a T1 lift's last set: the set against its forecast. */
export function LastSetBanner({ verdict }: { verdict: LastSetVerdict }) {
  return (
    <div
      data-testid="last-set-banner"
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-[20px] bg-tier-t1-soft px-3.5 py-3"
    >
      <span className="min-w-0">
        <span className="block font-display text-[11px] font-semibold tracking-[0.16em] text-tier-t1 uppercase">
          {verdict.title}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug">{verdict.body}</span>
      </span>
      {verdict.newBest !== null && (
        <span className="flex flex-col items-end">
          <span className="font-display text-[40px] leading-none font-extrabold tabular-nums">
            {verdict.newBest}
          </span>
          <span className="text-[11px] text-muted-foreground">
            <Term id="e1rm" hideLinks>
              est. max
            </Term>
          </span>
        </span>
      )}
    </div>
  );
}

/** The rest screen's card for the set that comes next. */
export function UpNextCard({
  entry,
  label,
  passForecast,
}: {
  entry: WorkoutExerciseState;
  /** "Next: Barbell Bench Press, set 1 of 3 · 100 lbs". */
  label: string;
  /** The stored chance this lift passes, when there is one. */
  passForecast?: Forecast | null;
}) {
  const info = getExercise(entry.substituteExerciseId || entry.exerciseId);
  const set = Math.min(entry.completedSets + 1, entry.targetSets);
  const chance = passForecast?.prediction.probability;
  return (
    <div
      data-testid="up-next"
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] bg-card px-3.5 py-3"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-display text-[11px] font-semibold tracking-[0.16em] text-accent-primary uppercase">
          Up next · {entry.isWarmUp ? "warm-up" : `${entry.tier} · set ${set} of ${entry.targetSets}`}
        </span>
        <span className="line-clamp-2 font-display text-2xl leading-[0.95] font-extrabold break-words uppercase">
          {info.name}
        </span>
        <span className="flex items-baseline gap-2">
          <span className="font-display text-[40px] leading-none font-extrabold tabular-nums">{entry.weight}</span>
          <span className="font-display text-base font-extrabold text-muted-foreground uppercase">
            {info.grip === "per_hand" ? "lbs/hand" : "lbs"} × {entry.targetReps}
            {entry.isAMRAP && entry.completedSets + 1 === entry.targetSets ? "+" : ""}
          </span>
        </span>
        {typeof chance === "number" && (
          <span className="text-xs text-muted-foreground">
            Forecast: <b className="font-mono text-foreground">{Math.round(chance * 100)}%</b> to pass
          </span>
        )}
        <span className="sr-only">{label}</span>
      </div>
      <ExerciseMuscleThumb exerciseId={info.id} views="auto" className="h-24 shrink-0" />
    </div>
  );
}
