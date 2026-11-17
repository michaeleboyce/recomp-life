import { cn } from "@/lib/utils";

/**
 * "Plan 190 · You 185", or "Plan 190×3 · You 190×5" when the reps differ: the plan's
 * number beside the one set by you. One rendering for every place a weight set by hand
 * sits beside the plan's (the next-session card, the set plan editor, the set chips),
 * so they read the same. Reps are shown only when given and different.
 */
export function PlanYou({
  planWeight,
  weight,
  planReps,
  reps,
  className,
  "data-testid": testId,
}: {
  planWeight: number;
  weight: number;
  planReps?: number;
  reps?: number;
  className?: string;
  "data-testid"?: string;
}) {
  const showReps = planReps != null && reps != null && planReps !== reps;
  return (
    <span data-testid={testId} className={cn("font-mono tabular-nums", className)}>
      <span className="text-muted-foreground">Plan </span>
      <b data-testid="plan-weight" className="text-foreground">
        {planWeight}
        {showReps ? `×${planReps}` : ""}
      </b>
      <span className="text-muted-foreground"> · You </span>
      <b data-testid="your-weight" className="text-foreground">
        {weight}
        {showReps ? `×${reps}` : ""}
      </b>
    </span>
  );
}
