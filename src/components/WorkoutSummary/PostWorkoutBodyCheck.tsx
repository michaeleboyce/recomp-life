"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PostWorkoutBodyCheckProps {
  onDismiss: () => void;
}

export default function PostWorkoutBodyCheck({
  onDismiss,
}: PostWorkoutBodyCheckProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">How do you feel?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Any new pain or issues after this workout?
        </p>
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={() => {
              setDismissed(true);
              onDismiss();
            }}
          >
            {"\u2705"} All good
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              // Placeholder until Phase 4 pain logging
              setDismissed(true);
              onDismiss();
            }}
          >
            {"\uD83E\uDE79"} Log issue
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Detailed pain logging coming in a future update.
        </p>
      </CardContent>
    </Card>
  );
}
