"use client";

import type { WarmUpSet as WarmUpSetType } from "@/types";

interface WarmUpSetProps {
  warmUpSet: WarmUpSetType;
  setNumber: number;
  totalSets: number;
  isCompleted: boolean;
}

export function WarmUpSet({
  warmUpSet,
  setNumber,
  totalSets,
  isCompleted,
}: WarmUpSetProps) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-2 text-sm ${
        isCompleted
          ? "opacity-50 line-through"
          : "text-muted-foreground"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground/60">
          Warm-up {setNumber}/{totalSets}
        </span>
        <span className="font-medium">{warmUpSet.label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span>{warmUpSet.weight} lbs</span>
        <span>x {warmUpSet.reps}</span>
      </div>
    </div>
  );
}
