"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getRule, type RuleId } from "@/lib/evidence";
import { RuleDetail } from "./RuleDetail";

interface EvidenceSheetProps {
  ruleId: RuleId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Hide the link to the research page. Used during an active workout, where
   * leaving the screen would interrupt the session.
   */
  hideLibraryLink?: boolean;
}

/** Bottom sheet explaining one coaching rule and linking to its sources. */
export function EvidenceSheet({
  ruleId,
  open,
  onOpenChange,
  hideLibraryLink = false,
}: EvidenceSheetProps) {
  const rule = getRule(ruleId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85vh] w-full max-w-lg gap-0 overflow-y-auto rounded-t-2xl"
        // The sheet is portalled, but React events still bubble to whatever
        // wraps the trigger (a card, a label). Keep taps inside the sheet.
        onClick={(event) => event.stopPropagation()}
      >
        <SheetHeader className="pr-12">
          <SheetTitle>{rule.title}</SheetTitle>
          <SheetDescription>{rule.summary}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-8">
          <RuleDetail ruleId={ruleId} />

          {!hideLibraryLink && (
            <Link
              href={`/research#${ruleId}`}
              onClick={() => onOpenChange(false)}
              className="flex min-h-11 items-center justify-between rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-accent/50"
            >
              See all research
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
