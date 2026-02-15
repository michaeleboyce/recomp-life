"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  ReferenceDot,
} from "recharts";

interface E1RMChartProps {
  exerciseId: string;
  exerciseName: string;
}

interface ChartDataPoint {
  date: string;
  estimated1RM: number;
  isPR: boolean;
}

export default function E1RMChart({ exerciseId, exerciseName }: E1RMChartProps) {
  const chartData = useLiveQuery(async () => {
    const entries = await db.estimated1RMs
      .where("exerciseId")
      .equals(exerciseId)
      .sortBy("date");

    if (entries.length === 0) return null;

    // Take last 30 data points
    const recent = entries.slice(-30);

    // Track all-time max to detect PRs across the full history
    let allTimeMax = 0;
    const prSet = new Set<number>();

    for (let i = 0; i < entries.length; i++) {
      if (entries[i].estimated1RM > allTimeMax) {
        allTimeMax = entries[i].estimated1RM;
        // Only mark PRs that are within our recent window
        const recentIndex = i - (entries.length - recent.length);
        if (recentIndex >= 0) {
          prSet.add(recentIndex);
        }
      }
    }

    const data: ChartDataPoint[] = recent.map((entry, index) => ({
      date: new Date(entry.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      estimated1RM: Math.round(entry.estimated1RM),
      isPR: prSet.has(index),
    }));

    return data;
  }, [exerciseId]);

  if (!chartData || chartData.length < 2) {
    return (
      <div className="h-40 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">
          Complete AMRAP sets to see e1RM trends.
        </p>
      </div>
    );
  }

  const latestValue = chartData[chartData.length - 1].estimated1RM;
  const values = chartData.map((d) => d.estimated1RM);
  const minVal = Math.floor(Math.min(...values) * 0.95);
  const maxVal = Math.ceil(Math.max(...values) * 1.05);

  // Find PR points for ReferenceDots
  const prPoints = chartData.filter((d) => d.isPR);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          e1RM Trend
        </h4>
        <span className="text-sm font-bold text-foreground font-mono">
          {latestValue} lbs
        </span>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "oklch(0.6 0 0)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[minVal, maxVal]}
              tick={{ fontSize: 10, fill: "oklch(0.6 0 0)" }}
              tickLine={false}
              axisLine={false}
              width={35}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "oklch(0.15 0 0)",
                border: "1px solid oklch(0.3 0 0)",
                borderRadius: "6px",
                fontSize: "12px",
              }}
              formatter={(value) => [`${value} lbs`, "e1RM"]}
            />
            <Line
              type="monotone"
              dataKey="estimated1RM"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3, fill: "#3b82f6", stroke: "#3b82f6" }}
              name="e1RM"
            />
            {prPoints.map((pr) => (
              <ReferenceDot
                key={pr.date}
                x={pr.date}
                y={pr.estimated1RM}
                r={6}
                fill="#22c55e"
                stroke="#22c55e"
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
