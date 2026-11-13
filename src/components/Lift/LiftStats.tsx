import Link from "next/link";
import { ChevronRight, TrendingUp } from "lucide-react";
import { Delta } from "@/components/ui/delta";
import { Term } from "@/components/ui/term";
import { formatCompact, TEASER_WEEKS, type LiftStats as Stats } from "./liftSeries";

function Stat({ label, value, sub }: { label: React.ReactNode; value: string; sub: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="font-mono text-[17px] font-bold tabular-nums text-foreground">{value}</span>
      <span className="font-mono text-[11px] text-muted-foreground">{sub}</span>
    </div>
  );
}

const fmt1 = (v: number | null) => (v === null ? "–" : String(Number(v.toFixed(1))));

/** Working weight, last-set reps, effort and weekly volume over the range. */
export function LiftStats({ stats }: { stats: Stats }) {
  const { working } = stats;
  return (
    <section aria-label="Lift stats" className="grid grid-cols-4 gap-2">
      <Stat
        label="Working"
        value={working.value === null ? "–" : String(working.value)}
        sub={working.change !== null ? <Delta value={working.change} better="up" className="text-[11px]" /> : "lbs"}
      />
      <Stat
        label={<Term id="amrap" label="Last set">Last set</Term>}
        value={fmt1(stats.lastSetReps)}
        sub="avg reps"
      />
      <Stat
        label={<Term id="rpe" label="Effort">Effort</Term>}
        value={fmt1(stats.effort)}
        sub="avg RPE"
      />
      <Stat
        label="Volume"
        value={stats.weeklyVolume === null ? "–" : formatCompact(stats.weeklyVolume)}
        sub="lbs / wk"
      />
    </section>
  );
}

/** Link to the projection screen, with "On this trend: about 249 in 8 weeks" when it can be fitted. */
export function ProjectionLink({ exerciseId, teaser }: { exerciseId: string; teaser: number | null }) {
  return (
    <Link
      href={`/progress/lift/${exerciseId}/projection`}
      className="flex min-h-11 items-center gap-3 rounded-[14px] bg-card px-3.5 py-3 text-foreground outline-none transition-colors hover:bg-card-raised focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <TrendingUp className="size-5 shrink-0 text-accent-primary" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-bold">Projection</span>
        {teaser !== null && (
          <span className="text-xs text-muted-foreground">
            On this trend: about {teaser} in {TEASER_WEEKS} weeks
          </span>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
