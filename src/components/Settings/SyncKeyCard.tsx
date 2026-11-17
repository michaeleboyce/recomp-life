"use client";

// The sync passphrase card on the settings screen (linked from More as /settings#sync).
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSyncKey, setSyncKey, SYNC_KEY_CHANGED_EVENT } from "@/lib/syncKey";

export function SyncKeyCard() {
  const [draft, setDraft] = useState("");
  // Only rendered after the local database is ready (client-side), so reading
  // localStorage during the first render cannot cause a hydration mismatch.
  const [hasKey, setHasKey] = useState(() => getSyncKey() !== null);
  const [saved, setSaved] = useState(false);

  // The card mounts after the database is ready, too late for the browser's own
  // jump to #sync, so scroll to it here.
  useEffect(() => {
    if (window.location.hash === "#sync") {
      document.getElementById("sync")?.scrollIntoView?.({ block: "start" });
    }
  }, []);

  const save = (value: string) => {
    setSyncKey(value);
    setHasKey(getSyncKey() !== null);
    setDraft("");
    setSaved(true);
    window.dispatchEvent(new Event(SYNC_KEY_CHANGED_EVENT));
  };

  return (
    // Linked from More as /settings#sync.
    <Card id="sync" className="scroll-mt-4">
      <CardContent>
        <h2 className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
          Cloud Sync
        </h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <span className="text-sm font-medium">
              {hasKey ? "Passphrase saved" : "Off (local only)"}
            </span>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) save(draft);
            }}
          >
            <input
              type="password"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setSaved(false);
              }}
              placeholder={hasKey ? "Replace passphrase" : "Sync passphrase"}
              autoComplete="off"
              aria-label="Sync passphrase"
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
            <Button type="submit" variant="outline" disabled={!draft.trim()}>
              Save
            </Button>
          </form>
          {hasKey && (
            <Button variant="ghost" className="w-full" onClick={() => save("")}>
              Remove passphrase from this device
            </Button>
          )}
          <p className="text-xs text-muted-foreground pt-1">
            {saved && hasKey
              ? "Saved. Syncing now."
              : "Must match the SYNC_SECRET set on the server. Stored on this device only."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
