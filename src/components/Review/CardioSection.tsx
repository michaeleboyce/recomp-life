"use client";

import { ListRow } from "@/components/ui/list-row";
import { SectionHeader } from "@/components/ui/section-header";
import type { CardioReview, ReadinessReview } from "@/lib/review";
import { cardioLine, plural } from "./format";

/** Runs, other activities and readiness check-ins; nothing when there are none. */
export function CardioSection({
  cardio,
  readiness,
}: {
  cardio: CardioReview | null;
  readiness: ReadinessReview | null;
}) {
  const checkIns = readiness && readiness.checkIns > 0 ? readiness : null;
  if (!cardio && !checkIns) return null;
  return (
    <section aria-labelledby="cardio-title" className="flex flex-col gap-1">
      <SectionHeader title={<span id="cardio-title">Cardio and recovery</span>} />
      {cardio && (
        <>
          <ListRow
            href="/progress?tab=runs"
            title="Runs"
            subtitle={cardioLine(cardio.runs.miles, cardio.runs.minutes)}
            value={cardio.runs.count}
            valueSub={<span className="text-muted-foreground">{cardio.previousRuns.count} last week</span>}
          />
          <ListRow
            href="/progress?tab=runs"
            title="Other activities"
            subtitle={cardioLine(cardio.activities.miles, cardio.activities.minutes)}
            value={cardio.activities.count}
            valueSub={
              <span className="text-muted-foreground">{cardio.previousActivities.count} last week</span>
            }
          />
        </>
      )}
      {checkIns && (
        <ListRow
          href="/progress?tab=runs"
          title="Readiness check-ins"
          subtitle={`${plural(checkIns.lowSleep, "low-sleep night")} · ${plural(checkIns.lowEnergy, "low-energy day")}`}
          value={checkIns.checkIns}
        />
      )}
    </section>
  );
}
