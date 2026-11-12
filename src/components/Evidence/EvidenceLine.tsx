"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatShortCitation, getRule, type RuleId } from "@/lib/evidence";
import { EvidenceSheet } from "./EvidenceSheet";

interface EvidenceLineProps {
  /** The coaching rule this element explains. */
  ruleId: RuleId;
  /**
   * "line": a one-line reason and short citation with an info icon, for use
   * under a suggestion. "icon": the info icon alone, for tight headers.
   */
  variant?: "line" | "icon";
  /** Hide the research-page link in the sheet (use during an active workout). */
  hideLibraryLink?: boolean;
  className?: string;
}

/**
 * Shows why the app is doing something and where that comes from.
 *
 * Tapping it opens a sheet with the full explanation, the strength of the
 * evidence and links to the papers. All content comes from the evidence
 * registry (src/lib/evidence), so this component never holds its own copy.
 */
export function EvidenceLine({
  ruleId,
  variant = "line",
  hideLibraryLink = false,
  className,
}: EvidenceLineProps) {
  const [open, setOpen] = useState(false);
  const rule = getRule(ruleId);

  const handleOpen = (event: React.MouseEvent) => {
    // The line is often placed inside a clickable card or label.
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={handleOpen}
          aria-label={`Why? ${rule.title}`}
          data-evidence={ruleId}
          className={cn(
            "relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            // Extends the tap target to 44px without changing the layout
            "after:absolute after:-inset-2.5 after:content-['']",
            className
          )}
        >
          <Info className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          aria-label={`Why? ${rule.summary}. Source: ${formatShortCitation(ruleId)}`}
          data-evidence={ruleId}
          className={cn(
            "flex min-h-11 w-full items-center gap-2 rounded-md text-left transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            className
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">
              {rule.summary}
            </span>
            <span className="block text-[11px] text-muted-foreground/70">
              {formatShortCitation(ruleId)}
            </span>
          </span>
          <Info
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </button>
      )}

      <EvidenceSheet
        ruleId={ruleId}
        open={open}
        onOpenChange={setOpen}
        hideLibraryLink={hideLibraryLink}
      />
    </>
  );
}
