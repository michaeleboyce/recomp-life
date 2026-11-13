"use client";

import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * The bottom sheet every log edit uses: title, fields, a primary save button and an
 * optional delete, all in thumb reach. Radix returns focus to the trigger on close.
 */
export function EditSheetFrame({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSave,
  saveLabel = "Save change",
  onDelete,
  deleteLabel = "Delete",
  busy = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  onSave: () => void;
  saveLabel?: string;
  onDelete?: () => void;
  deleteLabel?: string;
  busy?: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className={description ? undefined : "sr-only"}>
            {description ?? title}
          </SheetDescription>
        </SheetHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <div className="flex flex-col gap-4 px-4">{children}</div>
          <SheetFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Button type="submit" className="h-12 text-base" disabled={busy}>
              {busy ? "Saving..." : saveLabel}
            </Button>
            {onDelete && (
              <Button
                type="button"
                variant="ghost"
                className="h-12 text-base text-destructive hover:text-destructive"
                onClick={onDelete}
                disabled={busy}
              >
                <Trash2 aria-hidden="true" />
                {deleteLabel}
              </Button>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
