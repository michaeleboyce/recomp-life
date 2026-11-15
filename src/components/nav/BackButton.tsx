"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { canGoBackInApp } from "./navHistory";
import { usePreviousScreen } from "./useNavHistory";

// Both looks are 44px tall at least: the icon's padding grows the tap area and the
// negative margin cancels the growth, so the layout does not move.
const ICON_CLASS = "-m-3 p-3 text-muted-foreground transition-colors hover:text-foreground";
const LABEL_CLASS =
  "-ml-1 flex h-11 w-fit min-w-11 items-center gap-0.5 rounded-lg pr-2 text-sm font-semibold text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export interface BackButtonProps {
  /** Where back goes when there is no in-app previous screen (opened from a link, a reload, first screen). */
  fallback: string;
  /** The fallback screen's name, e.g. "Today". */
  label?: string;
  /** "icon" shows only the arrow; "label" shows "‹ name". */
  variant?: "icon" | "label";
  className?: string;
  /** The icon, for pages that draw their own arrow. */
  children?: ReactNode;
}

/**
 * The back arrow: returns to the previous screen when the user got here inside the
 * app (the router's back, so the history stays as the browser has it), otherwise
 * opens `fallback`. Where history is used, the label names the previous screen.
 */
export function BackButton({ fallback, label, variant = "icon", className, children }: BackButtonProps) {
  const previous = usePreviousScreen();
  const name = previous ? (previous.name ?? "Back") : (label ?? "Back");
  const accessibleName = name === "Back" ? "Back" : `Back to ${name}`;

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Read at click time: the list may have moved since the last render.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (!canGoBackInApp()) return;
    event.preventDefault();
    // What the App Router's `router.back()` does; called directly so the arrow
    // also renders where no router is mounted.
    window.history.back();
  };

  if (variant === "label") {
    return (
      <Link
        href={fallback}
        onClick={onClick}
        aria-label={accessibleName}
        data-slot="back-button"
        className={cn(LABEL_CLASS, className)}
      >
        <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{name}</span>
      </Link>
    );
  }

  return (
    <Link
      href={fallback}
      onClick={onClick}
      aria-label={previous ? accessibleName : label ? `Back to ${label}` : "Back"}
      data-slot="back-button"
      className={cn(ICON_CLASS, className)}
    >
      {children ?? <ChevronLeft className="size-5" aria-hidden="true" />}
    </Link>
  );
}
