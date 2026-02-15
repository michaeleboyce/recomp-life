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
  ReferenceArea,
} from "recharts";

interface RPETrendChartProps {
  exerciseId: string;
  exerciseName: string;
}

interface RPEDataPoint {
  date: string;
  avgRPE: number;
}

export default function RPETrendChart({ exerciseId, exerciseName }: RPETrendChartProps) {
  const chartData = useLiveQuery(async () => {
    // Get all sets for this exercise with RPE logged
    const sets = await db.sets
      .where("exerciseId")
      .equals(exerciseId)
      .toArray();

    const setsWithRPE = sets.filter(
      (s) => s.rpe !== undefined && s.tier !== "warmup"
    );

    if (setsWithRPE.length === 0) return null;

    // Group by workout session date (truncated to day)
    const sessionMap = new Map<string, number[]>();

    for (const set of setsWithRPE) {
      const dateKey = new Date(set.completedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      if (!sessionMap.has(dateKey)) {
        sessionMap.set(dateKey, []);
      }
      sessionMap.get(dateKey)!.push(set.rpe!);
    }

    // Convert to chart data, sorted by date
    const data: RPEDataPoint[] = Array.from(sessionMap.entries())
      .map(([dateKey, rpeValues]) => {
        const avg =
          rpeValues.reduce((sum, r) => sum + r, 0) / rpeValues.length;
        return {
          sortDate: new Date(dateKey).getTime(),
          date: new Date(dateKey).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          avgRPE: Math.round(avg * 10) / 10,
        };
      })
      .sort((a, b) => a.sortDate - b.sortDate)
      .slice(-20)
      .map(({ date, avgRPE }) => ({ date, avgRPE }));

    return data;
  }, [exerciseId]);

  if (!chartData || chartData.length < 2) {
    return (
      <div className="h-40 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">
          Log RPE values to see trends.
        </p>
      </div>
    );
  }

  const latestRPE = chartData[chartData.length - 1].avgRPE;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          RPE Trend
        </h4>
        <span className="text-sm font-bold text-foreground font-mono">
          {latestRPE.toFixed(1)}
        </span>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            {/* Color zones as reference areas */}
            <ReferenceArea
              y1={6}
              y2={8}
              fill="#22c55e"
              fillOpacity={0.08}
            />
            <ReferenceArea
              y1={8}
              y2={9}
              fill="#eab308"
              fillOpacity={0.08}
            />
            <ReferenceArea
              y1={9}
              y2={10}
              fill="#ef4444"
              fillOpacity={0.08}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "oklch(0.6 0 0)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[6, 10]}
              ticks={[6, 7, 8, 9, 10]}
              tick={{ fontSize: 10, fill: "oklch(0.6 0 0)" }}
              tickLine={false}
              axisLine={false}
              width={25}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "oklch(0.15 0 0)",
                border: "1px solid oklch(0.3 0 0)",
                borderRadius: "6px",
                fontSize: "12px",
              }}
              formatter={(value) => [Number(value).toFixed(1), "Avg RPE"]}
            />
            <Line
              type="monotone"
              dataKey="avgRPE"
              stroke="#a78bfa"
              strokeWidth={2}
              dot={{ r: 3, fill: "#a78bfa", stroke: "#a78bfa" }}
              name="Avg RPE"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
