"use client";

import { Clock } from "lucide-react";

interface TimeEstimateProps {
  accessoryCount: number;
}

const BASE_TIME_MINUTES = 40;
const MINUTES_PER_ACCESSORY = 6;

export function TimeEstimate({ accessoryCount }: TimeEstimateProps) {
  const accessoryTime = accessoryCount * MINUTES_PER_ACCESSORY;
  const total = BASE_TIME_MINUTES + accessoryTime;

  return (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Clock className="size-4" aria-hidden="true" />
      <span>
        Est. time: ~{total} min
        {accessoryCount > 0 && (
          <span>
            {" "}
            ({BASE_TIME_MINUTES} base + {accessoryTime} accessories)
          </span>
        )}
      </span>
    </p>
  );
}
