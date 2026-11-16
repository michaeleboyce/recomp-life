"use client";

import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { ListRow } from "@/components/ui/list-row";
import { SectionHeader } from "@/components/ui/section-header";
import { cn } from "@/lib/utils";
import type { RecoveryStatus } from "@/types";
import type { GymDebtItem, RecoveryRow } from "./sections";

const STATUS_TONE: Record<RecoveryStatus, string> = {
  recovering: "text-warning",
  ready: "text-foreground",
  primed: "text-success",
  detraining: "text-muted-foreground",
};

/**
 * One line per main lift with its recovery status, home sessions counted as training;
 * hidden when no lift has been trained.
 */
export function RecoverySection({ rows }: { rows: RecoveryRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-label="Recovery">
      <SectionHeader
        title="Recovery"
        action={<EvidenceLine ruleId="recovery-windows" variant="icon" />}
        className="mb-0.5"
      />
      {rows.map((row) => (
        <ListRow
          key={row.exerciseId}
          title={row.label}
          trailing={
            <span
              className={cn(
                "font-mono text-xs tabular-nums",
                row.trained ? STATUS_TONE[row.status] : "text-muted-foreground"
              )}
            >
              {row.detail}
            </span>
          }
        />
      ))}
    </section>
  );
}

/**
 * Barbell lifts whose home exercise is at the heaviest dumbbell (or that have none):
 * what each is trained as at home, and the barbell weight it starts at back at the
 * gym. Hidden when there are none.
 */
export function GymDebtSection({
  items,
  maxDumbbellWeight,
}: {
  items: GymDebtItem[];
  maxDumbbellWeight: number;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Waiting for gym">
      <SectionHeader
        title="Waiting for gym"
        action={<EvidenceLine ruleId="strength-pooling" variant="icon" />}
        className="mb-0.5"
      />
      <p className="text-xs text-muted-foreground">
        At home these lifts are at your heaviest dumbbell ({maxDumbbellWeight} lbs). Home sessions keep
        them going; the barbell weight waits for your next gym session.
      </p>
      {items.map((item) => (
        <ListRow
          key={item.exerciseId}
          title={item.name}
          subtitle={<span className="text-xs">{item.homeLabel}</span>}
          value={<span className="font-mono text-sm tabular-nums">{item.gymLabel}</span>}
          valueSub={<span className="text-muted-foreground">back at the gym</span>}
        />
      ))}
    </section>
  );
}
