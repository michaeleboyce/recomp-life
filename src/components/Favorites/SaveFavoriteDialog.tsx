"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cleanFavoriteName } from "@/lib/favorites";
import { FavoriteNameField } from "./FavoriteNameField";

/** The form lives inside the dialog content, so it starts from `defaultName` every time it opens. */
function SaveForm({
  defaultName,
  onSave,
  onCancel,
}: {
  defaultName: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const cleaned = cleanFavoriteName(name, "");

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (cleaned) onSave(cleaned);
      }}
    >
      <FavoriteNameField value={name} onChange={setName} autoFocus />
      <DialogFooter className="gap-2">
        <Button type="button" variant="secondary" className="min-h-11" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="min-h-11" disabled={!cleaned}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Name a workout and save it as a favourite. */
export function SaveFavoriteDialog({
  open,
  onOpenChange,
  defaultName,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  onSave: (name: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as favourite</DialogTitle>
          <DialogDescription>Give this workout a name so you can start it again later.</DialogDescription>
        </DialogHeader>
        <SaveForm defaultName={defaultName} onSave={onSave} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
