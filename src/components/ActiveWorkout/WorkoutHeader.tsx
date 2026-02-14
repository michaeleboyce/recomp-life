"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

interface WorkoutHeaderProps {
  templateName: string;
  workoutStartTime: Date | null;
}

function formatElapsedTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function WorkoutHeader({
  templateName,
  workoutStartTime,
}: WorkoutHeaderProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!workoutStartTime) return;

    const interval = setInterval(() => {
      const now = new Date();
      const diffSeconds = Math.floor(
        (now.getTime() - workoutStartTime.getTime()) / 1000
      );
      setElapsed(diffSeconds);
    }, 1000);

    return () => clearInterval(interval);
  }, [workoutStartTime]);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-sm font-semibold">
          {templateName}
        </Badge>
      </div>
      <div className="text-lg font-mono text-muted-foreground">
        {formatElapsedTime(elapsed)}
      </div>
    </div>
  );
}
