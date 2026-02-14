"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function WeighInPrompt() {
  const latestWeight = useLiveQuery(async () => {
    const all = await db.bodyweight.orderBy("date").reverse().limit(1).toArray();
    return all[0] ?? null;
  });

  const loggedToday = useLiveQuery(async () => {
    const todayStart = startOfDay(new Date());
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const count = await db.bodyweight
      .where("date")
      .between(todayStart, tomorrowStart)
      .count();

    return count > 0;
  });

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
