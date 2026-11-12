"use client";

import { useMemo } from "react";
import { useBodyweightLog } from "@/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function WeighInPrompt() {
  const log = useBodyweightLog();

  const latestWeight = log && log.length > 0 ? log[log.length - 1] : null;

  const loggedToday = useMemo(() => {
    const todayStart = startOfDay(new Date());
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    return (log ?? []).some((e) => {
      const t = new Date(e.date).getTime();
      return t >= todayStart.getTime() && t < tomorrowStart.getTime();
    });
  }, [log]);

  // Don't render if already logged today
  if (loggedToday) return null;

  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {latestWeight
                ? `Last: ${latestWeight.weight} lbs`
                : "No weight logged yet"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Log today&apos;s weight
            </p>
          </div>
          <Link href="/weigh-in">
            <Button variant="outline" size="sm">
              Log Weight
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
