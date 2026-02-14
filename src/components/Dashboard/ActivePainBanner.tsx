"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { db } from "@/db/local";
import { Button } from "@/components/ui/button";
import type { PainSorenessEntry, BodyRegion } from "@/types";

const REGION_LABELS: Record<BodyRegion, string> = {
  lower_back: "Lower Back",
  upper_back: "Upper Back",
  left_shoulder: "Left Shoulder",
  right_shoulder: "Right Shoulder",
  left_knee: "Left Knee",
  right_knee: "Right Knee",
  left_hip: "Left Hip",
  right_hip: "Right Hip",
  left_elbow: "Left Elbow",
  right_elbow: "Right Elbow",
  left_wrist: "Left Wrist",
  right_wrist: "Right Wrist",
  neck: "Neck",
  left_quad: "Left Quad",
  right_quad: "Right Quad",
  left_hamstring: "Left Hamstring",
  right_hamstring: "Right Hamstring",
  chest: "Chest",
  core: "Core",
};

function daysAgo(date: Date): string {
  const now = new Date();
  const diff = Math.floor(
    (now.getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diff === 0) return "today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
}

export default function ActivePainBanner() {
  const activePainEntries = useLiveQuery(async () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const entries = await db.painEntries
      .where("date")
      .aboveOrEqual(sevenDaysAgo)
      .toArray();
    return entries.filter(
      (e: PainSorenessEntry) => e.sensation === "pain"
    );
  });

  if (!activePainEntries || activePainEntries.length === 0) return null;

  const handleResolved = async (entry: PainSorenessEntry) => {
    await db.painEntries.delete(entry.id);
  };

  return (
    <div className="space-y-2">
      {activePainEntries.map((entry) => (
        <div
          key={entry.id}
          className={`rounded-lg px-4 py-3 ${
            entry.severity >= 4
              ? "bg-red-500/20 border border-red-500/30"
              : "bg-yellow-500/20 border border-yellow-500/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p
                className={`text-sm font-medium ${
                  entry.severity >= 4 ? "text-red-300" : "text-yellow-300"
                }`}
              >
                {"\u26A0\uFE0F"} {REGION_LABELS[entry.region]} &mdash; Pain{" "}
                {entry.severity}/5{" "}
                <span className="text-xs opacity-75">
                  (logged {daysAgo(entry.date)})
                </span>
              </p>
            </div>
            <div className="flex gap-2 ml-2">
              <Link href="/body-check">
                <Button variant="outline" size="xs">
                  Update
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleResolved(entry)}
                className="text-green-400 hover:text-green-300"
              >
                Resolved!
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
