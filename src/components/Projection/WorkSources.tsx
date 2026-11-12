import { SectionHeader } from "@/components/ui/section-header";
import { isMuscleId, formatMuscle } from "@/lib/muscles";
import {
  describeRelatedTrend,
  formatAmount,
  type ProjectionBaseline,
  type RelatedTrend,
} from "@/lib/projection";

interface WorkSourcesProps {
  baseline: ProjectionBaseline;
  relatedTrend?: RelatedTrend[];
}

const muscleName = (id: string) => (isMuscleId(id) ? formatMuscle(id) : id);

/** Weekly sets per muscle, and how other lifts for the same muscles are trending. */
export function WorkSources({ baseline, relatedTrend = [] }: WorkSourcesProps) {
  return (
    <section aria-labelledby="work-sources" className="flex flex-col gap-3">
      <SectionHeader title={<span id="work-sources">Where your work comes from</span>} />
      {baseline.byMuscle.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border">
          {baseline.byMuscle.map(({ muscle, weeklySets }) => (
            <li key={muscle} className="flex min-h-9 items-center justify-between text-sm">
              <span className="text-foreground">{muscleName(muscle)}</span>
              <span className="font-mono text-foreground">
                {formatAmount(weeklySets)}{" "}
                <span className="font-sans text-xs text-muted-foreground">sets a week</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No recent sets recorded for these muscles.</p>
      )}

      <h3 className="pt-2 text-sm font-semibold text-foreground">Related lifts</h3>
      {relatedTrend.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm text-foreground">
          {relatedTrend.map((trend) => (
            <li key={trend.exerciseId}>{describeRelatedTrend(trend)}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No other lift for these muscles has enough sessions to show a trend yet.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Shown for context. Their trends are not added to the projection; their sets
        count through &quot;other work for the same muscles&quot;.
      </p>
    </section>
  );
}
