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

/** One line per main lift with its recovery status; hidden when no lift has been trained. */
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

/** Barbell lifts too heavy for the home dumbbells; hidden when there are none. */
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
      <SectionHeader title="Waiting for gym" className="mb-0.5" />
      <p className="text-xs text-muted-foreground">
        These lifts are beyond your home dumbbells ({maxDumbbellWeight} lbs). Train them at the
        gym to keep full weight.
      </p>
      {items.map((item) => (
        <ListRow
          key={item.exerciseId}
          title={item.name}
          subtitle={<span className="font-mono text-xs">T1 {item.t1Weight} lbs barbell</span>}
          value={<span className="text-sm text-warning">+{item.overage} lbs over</span>}
          valueSub={
            <span className="font-mono text-muted-foreground">
              DB equiv {item.dbLabel}
            </span>
          }
        />
      ))}
    </section>
  );
}
