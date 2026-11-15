"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuleWithId } from "@/lib/evidence";
import { RuleDetail } from "./RuleDetail";
import { StrengthBadge } from "./StrengthBadge";

/** One rule in the library list: its question, one line, and its grade; opens the detail. */
export function RuleCard({
  rule,
  open,
  highlighted,
  onToggle,
}: {
  rule: RuleWithId;
  open: boolean;
  highlighted: boolean;
  onToggle: () => void;
}) {
  return (
    <article
      id={rule.id}
      className={cn(
        "scroll-mt-4 rounded-xl border bg-card transition-shadow",
        highlighted ? "border-foreground/60 ring-2 ring-ring/40" : "border-border"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${rule.id}-detail`}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span className="min-w-0 flex-1 space-y-1.5">
          <span className="block text-sm font-semibold text-foreground">
            {rule.title}
          </span>
          <span className="block text-xs text-muted-foreground">
            {rule.summary}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <StrengthBadge strength={rule.strength} />
            {rule.status === "planned" && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Not active yet
              </span>
            )}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={`${rule.id}-detail`} className="border-t border-border p-4">
          <RuleDetail ruleId={rule.id} />
          <Link
            href={`/research?rule=${rule.id}`}
            className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Open this rule on its own page
          </Link>
        </div>
      )}
    </article>
  );
}
