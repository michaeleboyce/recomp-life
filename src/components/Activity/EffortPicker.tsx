"use client";

export type Effort = 1 | 2 | 3 | 4 | 5;

const EFFORT_LABELS: Record<Effort, string> = {
  1: "Easy",
  2: "Light",
  3: "Moderate",
  4: "Hard",
  5: "All-out",
};

const EFFORT_COLORS: Record<Effort, string> = {
  1: "border-tier-warmup bg-tier-warmup-soft text-tier-warmup",
  2: "border-info bg-info/10 text-info",
  3: "border-muted-foreground bg-muted-foreground/10 text-foreground",
  4: "border-warning bg-warning/10 text-warning",
  5: "border-destructive bg-destructive/10 text-destructive",
};

/** Five-step perceived effort selector shared by the run and activity loggers. */
export function EffortPicker({
  value,
  onChange,
}: {
  value: Effort;
  onChange: (effort: Effort) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">Perceived Effort</label>
      <div className="flex gap-2">
        {([1, 2, 3, 4, 5] as const).map((level) => (
          <button
            key={level}
            type="button"
            aria-pressed={value === level}
            onClick={() => onChange(level)}
            className={`flex-1 flex flex-col items-center gap-0.5 rounded-md border px-2 py-2 text-xs transition-all duration-150 ${
              value === level
                ? `${EFFORT_COLORS[level]} font-medium`
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            }`}
          >
            <span className="text-sm font-semibold">{level}</span>
            <span className="text-[10px] leading-tight">{EFFORT_LABELS[level]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
