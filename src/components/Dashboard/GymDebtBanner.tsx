"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { EXERCISES } from "@/lib/exercises";
import { barbellToDumbbell } from "@/lib/dbConversion";
import { Card, CardContent } from "@/components/ui/card";

interface GymDebtItem {
  exerciseName: string;
  tier: string;
  barbellWeight: number;
  dumbbellWeight: number;
}

export default function GymDebtBanner() {
  const userProfile = useLiveQuery(() =>
    db.userProfile.toCollection().first()
  );
  const liftStates = useLiveQuery(() => db.liftStates.toArray());

  if (!userProfile || !liftStates) return null;

  const equipment = userProfile.settings?.equipment;
  if (!equipment) return null;

  const maxDB = equipment.maxDumbbellWeight;
  const debtItems: GymDebtItem[] = [];

  for (const ls of liftStates) {
    const exercise = EXERCISES[ls.exerciseId];
    if (!exercise) continue;

    // Only check exercises that require gym (barbell lifts)
    if (!exercise.requiresGym) continue;

    // Check T1 weight
    if (ls.t1Weight > 0) {
      const dbWeight = barbellToDumbbell(ls.t1Weight);
      if (dbWeight > maxDB) {
        debtItems.push({
          exerciseName: exercise.name,
          tier: "T1",
          barbellWeight: ls.t1Weight,
          dumbbellWeight: dbWeight,
        });
      }
    }

    // Check T2 weight
    if (ls.t2Weight > 0) {
      const dbWeight = barbellToDumbbell(ls.t2Weight);
      if (dbWeight > maxDB) {
        debtItems.push({
          exerciseName: exercise.name,
          tier: "T2",
          barbellWeight: ls.t2Weight,
          dumbbellWeight: dbWeight,
        });
      }
    }
  }

  if (debtItems.length === 0) return null;

  const debtLabel = debtItems
    .map((item) => `${item.exerciseName} ${item.tier} (${item.barbellWeight} lbs)`)
    .join(", ");

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start gap-2">
          <span className="text-sm shrink-0">{"🏋️"}</span>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {debtItems.length} exercise{debtItems.length !== 1 ? "s" : ""} waiting for gym
            </p>
            <p className="text-xs text-muted-foreground">
              {debtLabel}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
