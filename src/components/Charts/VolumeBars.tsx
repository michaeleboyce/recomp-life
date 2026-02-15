"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { calculateMuscleGroupVolume } from "@/lib/volumeTracking";
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

/**
 * Get the Monday of the current week.
 */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Mapping from BodyRegion identifiers to user-friendly muscle group names.
 * We collapse left/right variants into a single group.
 */
const MUSCLE_GROUP_LABELS: Record<string, string> = {
  chest: "Chest",
  upper_back: "Back",
  left_quad: "Quads",
  right_quad: "Quads",
  left_hamstring: "Hamstrings",
  right_hamstring: "Hamstrings",
  left_shoulder: "Shoulders",
  right_shoulder: "Shoulders",
  left_elbow: "Arms",
  right_elbow: "Arms",
  core: "Core",
  lower_back: "Lower Back",
  left_hip: "Glutes",
  right_hip: "Glutes",
  left_knee: "Calves",
  right_knee: "Calves",
  left_wrist: "Forearms",
  right_wrist: "Forearms",
  neck: "Neck",
};

/**
 * Display order for muscle groups.
 */
const DISPLAY_ORDER = [
  "Chest",
  "Back",
  "Shoulders",
  "Quads",
  "Hamstrings",
  "Arms",
  "Core",
  "Glutes",
];

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

    // Calculate volume per BodyRegion
    const rawVolume = calculateMuscleGroupVolume(allSets);

    // Aggregate into display muscle groups
    const groupedVolume: Record<string, number> = {};

    for (const [region, vol] of Object.entries(rawVolume)) {
      const label = MUSCLE_GROUP_LABELS[region];
      if (!label) continue;
      if (!groupedVolume[label]) {
        groupedVolume[label] = 0;
      }
      groupedVolume[label] += vol.directSets;
    }

    // Build chart data in display order
    return DISPLAY_ORDER.map((name) => ({
      name,
      sets: groupedVolume[name] ?? 0,
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
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Weekly Volume (Sets per Muscle Group)
      </h4>
      <div className="h-56">
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
