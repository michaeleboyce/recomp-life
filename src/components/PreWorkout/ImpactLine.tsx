"use client";

import { CircleCheck, CircleMinus, CirclePause } from "lucide-react";
import { Term } from "@/components/ui/term";
import { cn } from "@/lib/utils";
import type { ImpactStatus } from "./impact";

/** One line saying what an edited workout does to a program lift's progression. */
export function ImpactLine({ status, className }: { status: ImpactStatus; className?: string }) {
  const base = "flex items-center gap-1.5 text-xs";
  if (status === "program") {
    return (
      <p data-impact="program" className={cn(base, "text-success", className)}>
        <CircleCheck className="size-3.5 shrink-0" aria-hidden="true" />
        <Term id="counts-toward-progression">Counts toward progression</Term>
      </p>
    );
  }
  if (status === "logged-only") {
    return (
      <p data-impact="logged-only" className={cn(base, "text-warning", className)}>
        <CirclePause className="size-3.5 shrink-0" aria-hidden="true" />
        <span>Logged only, progression paused</span>
      </p>
    );
  }
  return (
    <p data-impact="not-done" className={cn(base, "text-muted-foreground", className)}>
      <CircleMinus className="size-3.5 shrink-0" aria-hidden="true" />
      <span>Not done today, weight unchanged</span>
    </p>
  );
}
