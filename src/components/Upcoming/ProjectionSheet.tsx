"use client";

import { useDecisionTrace } from "@/hooks";
import { tierStyle } from "@/lib/tierStyle";
import type { UpcomingLift } from "@/lib/workout/upcoming";
import type { DecisionTrace, WorkoutLocation } from "@/types";
import { WhySheet } from "@/components/ui/why-sheet";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import type { RuleId } from "@/lib/evidence";
import { formatSetsReps } from "@/components/Today/format";
import { displayLiftName } from "@/components/Today/todayModel";

const PROGRESSION_RULE: RuleId = "gzclp-progression";

/** The small "why" on a lift row of the full view; opens this page's own sheet. */
export function ProjectionWhyButton({ liftName, onOpen }: { liftName: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      data-slot="why-button"
      aria-label={`How the weight for ${liftName} was worked out`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      // The look of the why button on Today: small word, 44 px to tap.
      className="relative z-10 shrink-0 font-semibold text-primary underline decoration-dotted underline-offset-2 outline-none after:absolute after:-inset-x-2 after:-inset-y-3.5 after:content-[''] focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      why
    </button>
  );
}

function titleOf(lift: UpcomingLift, what: string): string {
  const { entry } = lift;
  return `${tierStyle(entry.tier).label} · ${displayLiftName(entry.substituteExerciseId ?? entry.exerciseId)} · ${what}`;
}

/**
 * "How this was projected": the steps that take a lift from where it stands now to its
 * weight on a later day, each earlier day assumed done at every target reps, with the
 * rule the progression code applied. Marked as a projection: no session exists yet.
 */
export function ProjectionSheet({
  lift,
  onClose,
}: {
  lift: UpcomingLift | null;
  onClose: () => void;
}) {
  if (!lift?.projection) return null;
  return (
    <WhySheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={titleOf(lift, "how this was projected")}
      trace={lift.projection}
      subtitle={formatSetsReps(lift.entry)}
    >
      <p data-testid="projection-note" className="rounded-xl bg-secondary px-3 py-2.5 text-[13px] leading-snug">
        <b>A projection.</b> It assumes you complete every set of each day before this one at its
        target reps. A missed set, a skipped day or a deload changes it.
      </p>
      <EvidenceLine ruleId={PROGRESSION_RULE} />
    </WhySheet>
  );
}

/**
 * The next workout at a location other than the saved one: the live decision trace for
 * that location (`useDecisionTrace`), as the why sheet shows it for the saved one.
 */
export function LiveWhySheet({
  lift,
  location,
  onClose,
}: {
  lift: UpcomingLift | null;
  location: WorkoutLocation;
  onClose: () => void;
}) {
  if (!lift) return null;
  return <LiveWhySheetFor key={`${lift.entry.exerciseId}:${lift.entry.tier}`} lift={lift} location={location} onClose={onClose} />;
}

function LiveWhySheetFor({
  lift,
  location,
  onClose,
}: {
  lift: UpcomingLift;
  location: WorkoutLocation;
  onClose: () => void;
}) {
  const trace: DecisionTrace | null | undefined = useDecisionTrace({
    exerciseId: lift.entry.exerciseId,
    tier: lift.entry.tier,
    location,
  });
  if (!trace) return null;
  return (
    <WhySheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={titleOf(lift, "why this weight")}
      trace={trace}
      subtitle={formatSetsReps(lift.entry)}
    />
  );
}
