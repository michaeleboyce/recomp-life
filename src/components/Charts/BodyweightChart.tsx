"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { detectFatLossStall } from "@/lib/stallDetection";
import type { TrainingPhase } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface BodyweightChartProps {
  trainingPhase: TrainingPhase;
}

function calculate7DayAverage(data: { date: string; weight: number }[]): { date: string; weight: number; avg: number | null }[] {
  return data.map((entry, index) => {
    if (index < 6) return { ...entry, avg: null };
    const window = data.slice(index - 6, index + 1);
    const avg = window.reduce((sum, w) => sum + w.weight, 0) / window.length;
    return { ...entry, avg: Math.round(avg * 10) / 10 };
  });
}

export default function BodyweightChart({ trainingPhase }: BodyweightChartProps) {
  const weightData = useLiveQuery(async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const entries = await db.bodyweight
      .where("date")
      .aboveOrEqual(thirtyDaysAgo)
      .sortBy("date");

    return entries;
  });

  if (!weightData || weightData.length < 3) return null;

  // Only show during cutting phase
  if (trainingPhase.mode !== "cutting") return null;

  const chartData = calculate7DayAverage(
    weightData.map(w => ({
      date: new Date(w.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      weight: w.weight,
    }))
  );

  // Stall detection
  const stallAlert = detectFatLossStall(
    weightData.map(w => ({ date: new Date(w.date), weight: w.weight })),
    trainingPhase
  );

  const weights = weightData.map(w => w.weight);
  const minWeight = Math.floor(Math.min(...weights) - 1);
  const maxWeight = Math.ceil(Math.max(...weights) + 1);

  return (
    <Card>
      <CardContent className="pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Bodyweight Trend
        </h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "oklch(0.6 0 0)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[minWeight, maxWeight]}
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
              />
              <Line
                type="monotone"
                dataKey="weight"
                stroke="oklch(0.6 0 0)"
                strokeWidth={1}
                dot={{ r: 2, fill: "oklch(0.6 0 0)" }}
                name="Daily"
              />
              <Line
                type="monotone"
                dataKey="avg"
                stroke="oklch(0.85 0 0)"
                strokeWidth={2}
                dot={false}
                name="7-day avg"
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {stallAlert && (
          <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
            <p className="text-xs font-semibold text-amber-400 mb-1">Weight Loss Stall Detected</p>
            <p className="text-xs text-muted-foreground">{stallAlert.message}</p>
            <ul className="text-xs text-muted-foreground/70 mt-1 space-y-0.5">
              {stallAlert.suggestions.map((s, i) => (
                <li key={i}>{"\u2022"} {s}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
