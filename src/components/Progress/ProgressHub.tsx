"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Activity } from "lucide-react";
import { useCompletedWorkouts, usePainEntries } from "@/hooks";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { BodyTab } from "./BodyTab";
import { MusclesTab } from "./MusclesTab";
import { RunsTab } from "./RunsTab";
import { StrengthTab } from "./StrengthTab";

export type ProgressTab = "strength" | "body" | "muscles" | "runs";

const TABS: { value: ProgressTab; label: string }[] = [
  { value: "strength", label: "Strength" },
  { value: "body", label: "Body" },
  { value: "muscles", label: "Muscles" },
  // Runs plus sleep and energy; the key stays "runs" so ?tab=runs links keep working.
  { value: "runs", label: "Cardio" },
];

export function parseTab(value: string | null): ProgressTab {
  return TABS.some((t) => t.value === value) ? (value as ProgressTab) : "strength";
}

/** The anatomy view, or a friendly note while there is nothing to draw on it. */
function MusclesPanel() {
  const workouts = useCompletedWorkouts();
  const pain = usePainEntries();
  if (workouts !== undefined && pain !== undefined && workouts.length === 0 && pain.length === 0) {
    return (
      <EmptyState
        icon={<Activity />}
        title="No muscle data yet"
        body="Log a workout and each muscle's weekly sets and recovery show up here."
      />
    );
  }
  return <MusclesTab />;
}

/** Progress tabs, selected by the `?tab=` query parameter (Strength by default). */
export function ProgressHub() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  function select(next: ProgressTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "strength") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl value={tab} onChange={select} options={TABS} />
      <div role="tabpanel" aria-label={TABS.find((t) => t.value === tab)!.label}>
        {tab === "strength" && <StrengthTab />}
        {tab === "body" && <BodyTab />}
        {tab === "muscles" && <MusclesPanel />}
        {tab === "runs" && <RunsTab />}
      </div>
    </div>
  );
}
