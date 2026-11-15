"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";

/**
 * Shown in place of a screen that threw while rendering, so one bug never leaves a
 * blank app. It reads no data and runs no model, so it cannot fail the way the screen
 * did. "Try again" renders the screen again; the link goes straight to starting a
 * workout, the one thing that must always be within reach.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("A screen failed to render", error);
  }, [error]);

  return (
    <PageShell className="flex min-h-[70vh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="font-display text-xl font-bold text-foreground">Something went wrong</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        This screen could not be shown. Your workouts are saved on this device.
      </p>
      <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
        <Button className="min-h-11" onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/workout/configure">Start a workout</Link>
        </Button>
      </div>
    </PageShell>
  );
}
