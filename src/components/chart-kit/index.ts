// Chart kit public surface. TrendChart itself is not re-exported as a value so
// that importing this barrel never pulls Recharts into a bundle: use
// LazyTrendChart, or import "@/components/chart-kit/TrendChart" deliberately.
export { BarSeries, type BarDatum, type BarSeriesProps, type BarTone } from "./BarSeries";
export { ChartEmpty, DEFAULT_EMPTY_MESSAGE } from "./ChartEmpty";
export { ChartFrame, type ChartFrameProps } from "./ChartFrame";
export { LazyTrendChart, TrendChartSkeleton } from "./LazyTrendChart";
export { RangeTabs, RANGE_KEYS, RANGE_LABELS, type RangeTabsProps } from "./RangeTabs";
export { Sparkline, type SparklineProps, type SparklineTone } from "./Sparkline";
export type { OverlayStyle, TrendChartProps, TrendOverlay, TrendTarget } from "./TrendChart";
export { formatNumber, formatShortDate } from "./scale";
