import { HEAT_COLORS, RECOVERY_COLORS } from "@/lib/anatomy/palette";
import { cn } from "@/lib/utils";

type LegendVariant = "activation" | "weekly" | "session" | "recovery";

const ITEMS: Record<LegendVariant, { color: string; label: string }[]> = {
  activation: [
    { color: HEAT_COLORS[4], label: "Primary" },
    { color: HEAT_COLORS[2], label: "Secondary" },
    { color: HEAT_COLORS[1], label: "Stabiliser" },
  ],
  weekly: [
    { color: HEAT_COLORS[1], label: "<3" },
    { color: HEAT_COLORS[2], label: "3-5" },
    { color: HEAT_COLORS[3], label: "6-9" },
    { color: HEAT_COLORS[4], label: "10+ sets" },
  ],
  session: [
    { color: HEAT_COLORS[1], label: "Light" },
    { color: HEAT_COLORS[4], label: "Most worked" },
  ],
  recovery: [
    { color: RECOVERY_COLORS.recovering, label: "Recovering" },
    { color: RECOVERY_COLORS.ready, label: "Ready" },
    { color: RECOVERY_COLORS.primed, label: "Primed" },
    { color: RECOVERY_COLORS.detraining, label: "Long break" },
  ],
};

export function MuscleLegend({
  variant,
  className,
}: {
  variant: LegendVariant;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground",
        className
      )}
    >
      {ITEMS[variant].map(({ color, label }) => (
        <span key={label} className="flex items-center gap-1">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: color }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}
