"use client";

import { useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { BodyRegion, PainSorenessEntry } from "@/types";
import { shouldShowRedFlag, type RedFlagDismissal } from "@/lib/painModifications";
import { db } from "@/db/local";
import BodyMapSVG from "@/components/BodyMap/BodyMapSVG";
import RegionDetail from "@/components/BodyMap/RegionDetail";
import PainHistory from "@/components/BodyMap/PainHistory";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// Store red flag dismissals in memory (persisted per session).
// For production, these could be stored in localStorage or Dexie.
function useRedFlagDismissals() {
  const [dismissals, setDismissals] = useState<RedFlagDismissal[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("recomp-red-flag-dismissals");
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((d: { region: BodyRegion; dismissedAt: string }) => ({
          ...d,
          dismissedAt: new Date(d.dismissedAt),
        }));
      }
    } catch {
      // ignore parse errors
    }
    return [];
  });

  const addDismissal = useCallback(
    (region: BodyRegion) => {
      const newDismissal: RedFlagDismissal = {
        region,
        dismissedAt: new Date(),
      };
      const updated = [...dismissals, newDismissal];
      setDismissals(updated);
      try {
        localStorage.setItem(
          "recomp-red-flag-dismissals",
          JSON.stringify(updated)
        );
      } catch {
        // ignore storage errors
      }
    },
    [dismissals]
  );

  return { dismissals, addDismissal };
}

export default function BodyCheckPage() {
  const [selectedRegion, setSelectedRegion] = useState<BodyRegion | null>(null);
  const [showRedFlag, setShowRedFlag] = useState(false);
  const [redFlagRegion, setRedFlagRegion] = useState<BodyRegion | null>(null);
  const { dismissals, addDismissal } = useRedFlagDismissals();

  // Load all active pain entries from Dexie
  const activeEntries = useLiveQuery(
    async () => {
      // Get entries from the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const all = await db.painEntries.toArray();
      return all.filter((e) => new Date(e.date) >= thirtyDaysAgo);
    },
    [],
    []
  );

  const handleRegionTap = (region: BodyRegion) => {
    setSelectedRegion(region);
  };

  const handleCloseDetail = () => {
    setSelectedRegion(null);
  };

  const handleSave = () => {
    // Entry is already saved in RegionDetail. We keep the region selected
    // so the user can see the updated history.
  };

  const handleRedFlagTriggered = (severity: number, region: BodyRegion) => {
    if (shouldShowRedFlag(severity, region, dismissals)) {
      setRedFlagRegion(region);
      setShowRedFlag(true);
    }
  };

  const handleRedFlagDismiss = (dontShowAgain: boolean) => {
    if (dontShowAgain && redFlagRegion) {
      addDismissal(redFlagRegion);
    }
    setShowRedFlag(false);
    setRedFlagRegion(null);
  };

  // Determine which region to show history for (the most recently selected)
  const historyRegion = selectedRegion;

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      {/* Header */}
      <header className="flex items-center gap-3 mb-4">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Body Check</h1>
      </header>

      <p className="text-sm text-muted-foreground mb-4">
        Tap a body region to log pain or soreness. Pain entries will automatically
        generate workout modification suggestions.
      </p>

      {/* Body Map */}
      <BodyMapSVG
        activeEntries={activeEntries}
        onRegionTap={handleRegionTap}
        selectedRegion={selectedRegion}
      />

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-sm bg-[#374151] border border-[#4b5563]" />
          <span>No entry</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-sm bg-amber-500" />
          <span>Soreness</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-sm bg-red-500" />
          <span>Pain</span>
        </div>
      </div>

      {/* Pain History for selected region */}
      <PainHistory region={historyRegion} />

      {/* Region Detail Sheet */}
      <RegionDetail
        region={selectedRegion}
        onClose={handleCloseDetail}
        onSave={handleSave}
        onRedFlagTriggered={handleRedFlagTriggered}
      />

      {/* Red Flag Warning Dialog */}
      <Dialog open={showRedFlag} onOpenChange={(open) => !open && handleRedFlagDismiss(false)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <span className="text-xl" aria-hidden="true">&#9877;</span>
              Important Safety Check
            </DialogTitle>
            <DialogDescription>
              You logged significant pain. Seek medical evaluation if you have:
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2 text-sm text-foreground px-2">
            <li className="flex items-start gap-2">
              <span className="text-destructive mt-0.5">&#8226;</span>
              New numbness or weakness
            </li>
            <li className="flex items-start gap-2">
              <span className="text-destructive mt-0.5">&#8226;</span>
              Pain radiating down leg or arm
            </li>
            <li className="flex items-start gap-2">
              <span className="text-destructive mt-0.5">&#8226;</span>
              Loss of bowel/bladder control
            </li>
            <li className="flex items-start gap-2">
              <span className="text-destructive mt-0.5">&#8226;</span>
              Pain worsening despite rest
            </li>
          </ul>

          <DialogFooter className="flex-col sm:flex-col gap-2">
            <Button
              onClick={() => handleRedFlagDismiss(false)}
              className="w-full"
            >
              Got it &mdash; continue
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleRedFlagDismiss(true)}
              className="w-full text-muted-foreground"
            >
              Don&apos;t show this again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
