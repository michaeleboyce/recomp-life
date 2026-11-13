"use client";

import { Award } from "lucide-react";
import { E1RM_COMPARE_WEEKS, type WeeklyReview } from "@/lib/review";
import { Delta } from "@/components/ui/delta";
import { ListRow } from "@/components/ui/list-row";
import { SectionHeader } from "@/components/ui/section-header";
import { Term } from "@/components/ui/term";
import { DASH, lbs, plural } from "./format";

function BestChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
      <Award className="size-3" aria-hidden="true" />
      best
    </span>
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
        subtitle={`${sessions.previous} the week before`}
        value={sessions.target === null ? sessions.count : `${sessions.count} of ${sessions.target}`}
        valueSub={<Delta value={sessions.count - sessions.previous} better="up" />}
      />
      {effort && (
        <ListRow
          title={
            <>
              T1 effort, mean <Term id="rpe">RPE</Term>
            </>
          }
          subtitle={
            effort.previous === null
              ? plural(effort.sets, "set")
              : `${plural(effort.sets, "set")} · ${effort.previous.toFixed(1)} the week before`
          }
          value={effort.meanRpe.toFixed(1)}
          valueSub={
            effort.previous === null ? undefined : (
              <Delta value={Number((effort.meanRpe - effort.previous).toFixed(1))} />
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
          title={lift.label}
          subtitle={
            lift.workingWeight === null
              ? plural(lift.sessions, "session")
              : `${lbs(lift.workingWeight)} lbs working${
                  lift.workingWeightChange ? ` (${lift.workingWeightChange > 0 ? "+" : "−"}${lbs(Math.abs(lift.workingWeightChange))})` : ""
                } · ${plural(lift.sessions, "session")}`
          }
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
    </section>
  );
}
