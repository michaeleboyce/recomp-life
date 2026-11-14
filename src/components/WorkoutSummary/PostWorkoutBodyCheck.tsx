"use client";

import { useState } from "react";
import Link from "next/link";
import { HeartPulse, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** After a workout: "All good" dismisses the card; "Log an issue" opens the body check. */
export default function PostWorkoutBodyCheck({ onDismiss }: { onDismiss?: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">How do you feel?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Any new pain or soreness after this workout?</p>
        <div className="flex gap-2">
          <Button
            className="min-h-11 flex-1"
            onClick={() => {
              setDismissed(true);
              onDismiss?.();
            }}
          >
            <ThumbsUp className="size-4" aria-hidden="true" />
            All good
          </Button>
          <Button asChild variant="outline" className="min-h-11 flex-1">
            <Link href="/body-check">
              <HeartPulse className="size-4" aria-hidden="true" />
              Log an issue
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
