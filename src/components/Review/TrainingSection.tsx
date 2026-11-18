"use client";

import { Award } from "lucide-react";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { E1RM_COMPARE_WEEKS, type WeeklyReview } from "@/lib/review";
import { Delta } from "@/components/ui/delta";
import { ExerciseImage } from "@/components/ui/exercise-image";
import { ListRow } from "@/components/ui/list-row";
import { SectionHeader } from "@/components/ui/section-header";
import { Term } from "@/components/ui/term";
import { plural } from "@/lib/text";
import { DASH, bestFromText, lbs, liftSessionsText } from "./format";

function BestChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[12px] font-semibold text-success">
      <Award className="size-3" aria-hidden="true" />
      best
    </span>
  );
}

/** The row's subtitle: working weight and sessions, and a second line when a home version gave the best. */
function liftSubtitle(lift: WeeklyReview["lifts"][number]) {
  const sessions = liftSessionsText(lift);
  const first =
    lift.workingWeight === null
      ? sessions
      : `${lbs(lift.workingWeight)} lbs working${
          lift.workingWeightChange ? ` (${lift.workingWeightChange > 0 ? "+" : "−"}${lbs(Math.abs(lift.workingWeightChange))})` : ""
        } · ${sessions}`;
  const from = bestFromText(lift);
  if (!from) return first;
  return (
    <>
      <span className="block truncate">{first}</span>
      <span className="block truncate" data-testid={`best-from-${lift.id}`}>
        {from}
      </span>
    </>
  );
}

/** Sessions against the target, effort, and one row per main lift. */
export function TrainingSection({ review }: { review: WeeklyReview }) {
  const { sessions, effort } = review;
  return (
    <section aria-labelledby="training-title" className="flex flex-col gap-1">
      <SectionHeader title={<span id="training-title">Training</span>} />
      <ListRow
        href="/log"
        title="Sessions"
        subtitle={`${sessions.imported > 0 ? `${sessions.imported} imported · ` : ""}${sessions.previous} the week before`}
        value={<span className="font-display text-2xl font-bold">{sessions.target === null ? sessions.count : `${sessions.count} of ${sessions.target}`}</span>}
        valueSub={<Delta value={sessions.count - sessions.previous} better="up" />}
      />
      {effort && (
        <ListRow
          title={
            <>
              T1 sets, average <Term id="rir">reps left</Term>
            </>
          }
          subtitle={
            effort.previous === null
              ? plural(effort.sets, "set")
              : `${plural(effort.sets, "set")} · ${effort.previous.toFixed(1)} the week before`
          }
          value={effort.meanRepsInReserve.toFixed(1)}
          valueSub={
            effort.previous === null ? undefined : (
              <Delta value={Number((effort.meanRepsInReserve - effort.previous).toFixed(1))} />
            )
          }
        />
      )}
      <p className="pt-3 text-xs text-muted-foreground">
        Best <Term id="e1rm">e1RM</Term> this week, against the best of the {E1RM_COMPARE_WEEKS} weeks
        before.
      </p>
      {review.lifts.map((lift) => (
        <ListRow
          key={lift.id}
          href={`/progress/lift/${lift.id}`}
          leading={<ExerciseImage exerciseId={lift.id} variant="thumb" className="size-10 rounded-full" />}
          title={lift.label}
          subtitle={liftSubtitle(lift)}
          value={lift.bestE1RM === null ? DASH : lbs(lift.bestE1RM)}
          valueSub={
            lift.e1rmChange === null ? (
              <span className="text-muted-foreground">{lift.bestE1RM === null ? "no estimate" : "nothing to compare"}</span>
            ) : (
              <Delta value={lift.e1rmChange} unit="lbs" better="up" />
            )
          }
          trailing={lift.isPR ? <BestChip /> : undefined}
        />
      ))}
      {/* Home versions counted: how their sessions convert into the lift's pounds. */}
      {review.lifts.some((l) => l.homeSessions > 0 || l.bestFrom) && (
        <EvidenceLine ruleId="strength-pooling" className="pt-2" />
      )}
    </section>
  );
}
