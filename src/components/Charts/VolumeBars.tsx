"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { calculateGroupVolume } from "@/lib/volumeTracking";
import { MUSCLE_GROUP_ORDER } from "@/lib/muscles";
import { getMonday } from "@/lib/dates";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";

interface VolumeBarsProps {
  weekStartDate?: Date;
}

function getBarColor(sets: number): string {
  if (sets >= 10) return "#22c55e"; // green
  if (sets >= 5) return "#eab308"; // yellow
  return "#ef4444"; // red
}

export default function VolumeBars({ weekStartDate }: VolumeBarsProps) {
  const monday = weekStartDate ?? getMonday(new Date());

  const chartData = useLiveQuery(async () => {
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 7);

    // Get all workouts for the week
    const workouts = await db.workouts
      .where("startedAt")
      .between(monday, sunday)
      .toArray();

    const completedWorkouts = workouts.filter((w) => w.completedAt !== null);

    // Collect all sets
    const allSets = completedWorkouts.flatMap((w) => w.sets);

    if (allSets.length === 0) return null;

    // Direct sets per display group. A set credits a group at most once.
    const groupVolume = calculateGroupVolume(allSets);

    return MUSCLE_GROUP_ORDER.map((name) => ({
      name,
      sets: groupVolume[name]?.directSets ?? 0,
    }));
  }, [monday.getTime()]);

  if (!chartData) {
    return (
      <div className="h-48 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">
          Complete workouts this week to see volume.
        </p>
      </div>
    );
  }

  const maxSets = Math.max(...chartData.map((d) => d.sets), 12);

  return (
    <div>
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Weekly Volume (Sets per Muscle Group)
        <EvidenceLine ruleId="weekly-volume" variant="icon" />
      </h4>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 0, right: 10, top: 5, bottom: 5 }}
          >
            <XAxis
              type="number"
              domain={[0, maxSets]}
              tick={{ fontSize: 10, fill: "oklch(0.6 0 0)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: "oklch(0.7 0 0)" }}
              tickLine={false}
              axisLine={false}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "oklch(0.15 0 0)",
                border: "1px solid oklch(0.3 0 0)",
                borderRadius: "6px",
                fontSize: "12px",
              }}
              formatter={(value) => [`${value} sets`, "Direct Sets"]}
            />
            <ReferenceLine
              x={10}
              stroke="oklch(0.5 0 0)"
              strokeDasharray="3 3"
              label={{
                value: "Target",
                position: "top",
                fontSize: 10,
                fill: "oklch(0.5 0 0)",
              }}
            />
            <Bar dataKey="sets" radius={[0, 4, 4, 0]} barSize={16}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.sets)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
