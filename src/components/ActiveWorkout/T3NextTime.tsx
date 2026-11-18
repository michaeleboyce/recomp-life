"use client";

import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { cn } from "@/lib/utils";

/**
 * After a T3's last set: what its weight does next time, against the reps this weight
 * needed ("20 of 20 on the last set: 55 lbs next time"; `t3NextTimeAfterSet`).
 */
export function T3NextTime({ name, text, className }: { name: string; text: string; className?: string }) {
  return (
    <div
      data-testid="t3-next-time"
      className={cn("flex flex-col gap-0.5 rounded-xl bg-tier-t3-soft px-3.5 py-2.5", className)}
    >
      <p className="text-xs font-semibold tracking-[0.14em] text-tier-t3 uppercase">{name} · next time</p>
      <p className="flex items-center gap-1.5 text-[14px] leading-snug font-semibold text-foreground">
        <span>{text}</span>
        <EvidenceLine ruleId="t3-progression" variant="icon" hideLibraryLink />
      </p>
    </div>
  );
}
