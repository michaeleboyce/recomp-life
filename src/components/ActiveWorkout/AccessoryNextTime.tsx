"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * After an accessory's last set: what double progression does with it next time, and
 * why ("All sets at 15: up to 30 next time").
 */
export function AccessoryNextTime({ name, text, className }: { name: string; text: string; className?: string }) {
  return (
    <div
      data-testid="accessory-next-time"
      className={cn("flex flex-col gap-0.5 rounded-xl bg-tier-accessory-soft px-3.5 py-2.5", className)}
    >
      <p className="text-xs font-semibold tracking-[0.14em] text-tier-accessory uppercase">{name} · next time</p>
      <p className="text-[14px] leading-snug font-semibold text-foreground">{text}</p>
    </div>
  );
}

/** "Add accessory": opens the accessory sheet's Add list; the new one goes at the end. */
export function AddAccessoryButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 self-center rounded-full px-4 text-[14px] font-semibold text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className
      )}
    >
      <Plus className="size-4" aria-hidden="true" />
      Add accessory
    </button>
  );
}
