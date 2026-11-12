"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { TrendChartProps } from "./TrendChart";

/** Placeholder while Recharts loads; matches TrendChart's default height. */
export function TrendChartSkeleton({ height = 170 }: { height?: number }) {
  return <Skeleton className="w-full" style={{ height }} />;
}

/**
 * TrendChart loaded on the client only, so Recharts stays out of the initial
 * bundle. Prefer this over importing TrendChart directly from a page.
 */
export const LazyTrendChart = dynamic<TrendChartProps>(
  () => import("./TrendChart").then((m) => m.TrendChart),
  { ssr: false, loading: () => <TrendChartSkeleton /> }
);
