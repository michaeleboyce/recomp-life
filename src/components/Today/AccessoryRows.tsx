"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { WhyButton } from "@/components/Why";
import {
  accessoryScheme,
  accessoryWeightParts,
  accessoryWeightText,
  type AccessoryRowView,
} from "./accessoryRowModel";
import { nameInSentence } from "./todayModel";
import { plural } from "@/lib/text";
import { exercisePageHref } from "./todayModel";

/** Where Today's "Change" goes: the Ready screen, with the accessory sheet open. */
export const CHANGE_ACCESSORIES_HREF = "/workout/configure?accessories=open";

const CHANGE =
  "relative z-10 inline-flex h-11 shrink-0 items-center px-1 text-[13px] font-semibold text-primary underline decoration-dotted underline-offset-4 outline-none focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** The "Change" control: a link (Today) or a button (Ready, where the sheet is). */
function ChangeControl({ href, onChange }: { href?: string; onChange?: () => void }) {
  if (onChange) {
    return (
      <button type="button" onClick={onChange} className={CHANGE} aria-label="Change accessories">
        Change
      </button>
    );
  }
  if (!href) return null;
  return (
    <Link href={href} className={CHANGE} aria-label="Change accessories">
      Change
    </Link>
  );
}

/** One accessory: name, the reason it was picked and its why, weight and sets × reps. */
function AccessoryRowItem({ view, why }: { view: AccessoryRowView; why: boolean }) {
  const weight = accessoryWeightParts(view);
  return (
    <li
      data-testid="accessory-row"
      className="relative grid min-h-[52px] grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-border"
    >
      <span aria-hidden="true" className="font-mono text-[12px] font-medium text-tier-accessory">
        +
      </span>
      <span className="min-w-0 py-1.5">
        <Link
          href={exercisePageHref(view.exerciseId, { from: "today" })}
          className="block truncate text-[15px] font-semibold text-foreground outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
        >
          {view.name}
        </Link>
        {(view.reason || (why && view.explained)) && (
          <span className="flex min-w-0 items-baseline gap-1 text-xs text-muted-foreground">
            {view.reason && (
              <span data-testid="accessory-reason" className="min-w-0 truncate">
                {view.reason}
              </span>
            )}
            {why && view.explained && (
              <>
                {view.reason && <span aria-hidden="true">·</span>}
                <WhyButton exerciseId={view.exerciseId} tier="accessory" liftName={view.name} />
              </>
            )}
          </span>
        )}
      </span>
      <span className="text-right">
        <span className="flex items-baseline justify-end gap-0.5" aria-label={accessoryWeightText(view)}>
          <b
            aria-hidden="true"
            className={cn(
              "font-display text-[22px] leading-none font-extrabold tabular-nums",
              view.weight == null ? "text-muted-foreground" : "text-foreground"
            )}
          >
            {weight.value}
          </b>
          {weight.unit && (
            <span aria-hidden="true" className="text-[12px] text-muted-foreground">
              {weight.unit}
            </span>
          )}
        </span>
        <span data-testid="accessory-scheme" className="block font-mono text-[12px] font-medium text-muted-foreground">
          {accessoryScheme(view.sets, view.reps)}
        </span>
      </span>
    </li>
  );
}

/**
 * The day's accessories under the program's lifts. With `collapsible`, more than
 * `openUpTo` of them fold into one summary row ("+ 3 accessories · curls, ...") that
 * expands, so START stays in the first screen. "Change" opens the accessory sheet
 * (`onChange`) or goes where it is (`changeHref`). None planned: one row to add them.
 */
export function AccessoryRows({
  views,
  collapsible = false,
  openUpTo = 1,
  why = false,
  changeHref,
  onChange,
  className,
}: {
  views: AccessoryRowView[];
  collapsible?: boolean;
  /** With `collapsible`: this many or fewer are shown as rows straight away. */
  openUpTo?: number;
  /** Show the why link on rows the why sheet can explain (the page hosts the sheet). */
  why?: boolean;
  changeHref?: string;
  onChange?: () => void;
  className?: string;
}) {
  const folds = collapsible && views.length > openUpTo;
  const [open, setOpen] = useState(false);
  const expanded = !folds || open;

  if (views.length === 0) {
    return (
      <div className={cn("flex min-h-11 items-center justify-between gap-2 border-t border-border", className)}>
        <span className="text-[13px] text-muted-foreground">No accessories today</span>
        <ChangeControl href={changeHref} onChange={onChange} />
      </div>
    );
  }

  return (
    <div className={className} data-testid="accessories">
      {folds ? (
        <div className="grid min-h-[48px] grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-border">
          <span aria-hidden="true" className="font-mono text-[12px] font-medium text-tier-accessory">
            +
          </span>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
            className="flex min-h-[52px] min-w-0 items-center gap-1.5 py-1.5 text-left outline-none focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span data-testid="accessory-summary" className="min-w-0">
              <span className="block text-[15px] font-semibold text-foreground">
                {plural(views.length, "accessory", "accessories")}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {views.map((v) => nameInSentence(v.exerciseId)).join(", ")}
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
            />
          </button>
          <ChangeControl href={changeHref} onChange={onChange} />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 border-t border-border">
          <span className="text-xs font-semibold tracking-[0.14em] text-tier-accessory uppercase">
            {views.length === 1 ? "Accessory" : "Accessories"}
          </span>
          <ChangeControl href={changeHref} onChange={onChange} />
        </div>
      )}
      {expanded && (
        <ul aria-label="Accessories" className="flex flex-col">
          {views.map((view) => (
            <AccessoryRowItem key={view.exerciseId} view={view} why={why} />
          ))}
        </ul>
      )}
    </div>
  );
}
