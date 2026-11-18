import { create } from "zustand";
import type { WindowSpan } from "@/lib/metrics/window";

/**
 * Transient UI state: the span a chart is zoomed to, by page key (for a lift,
 * `lift:<id>`). The lift page's chart writes it and the page's stats read it
 * (`useLiftView`), so both follow one window. Losing it only resets the zoom.
 */
interface ChartWindowStore {
  spans: Record<string, WindowSpan | undefined>;
  setSpan: (key: string, span: WindowSpan | null) => void;
}

export const useChartWindowStore = create<ChartWindowStore>((set) => ({
  spans: {},
  setSpan: (key, span) =>
    set((state) => ({ spans: { ...state.spans, [key]: span ?? undefined } })),
}));

/** The key a lift page's window is stored under. */
export const liftWindowKey = (exerciseId: string) => `lift:${exerciseId}`;

/** The zoomed span for `key`, or null. */
export function useChartSpan(key: string): WindowSpan | null {
  return useChartWindowStore((s) => s.spans[key] ?? null);
}
