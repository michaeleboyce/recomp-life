"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import { useDerivedCheck } from "@/hooks";

const rows = (n: number) => `${n} ${n === 1 ? "row" : "rows"}`;

/**
 * More > Data: checks that lift states and estimated 1RM history match what the log
 * produces, and rebuilds them from the log when they do not.
 */
export function DataIntegrityCard() {
  const check = useDerivedCheck();
  const working = check.status === "checking" || check.status === "rebuilding";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-foreground">Derived data</h3>
          <p className="text-sm text-muted-foreground">
            Weights, stages and estimated 1RM history are worked out from your log. Check
            that they still match it.
          </p>
        </div>

        <div aria-live="polite" className="flex flex-col gap-3">
          {working && (
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {check.status === "checking" ? "Checking..." : "Rebuilding from the log..."}
            </p>
          )}
          {check.status === "consistent" && (
            <Callout variant="success" title="Everything matches">
              Weights and history match the log.
            </Callout>
          )}
          {check.status === "inconsistent" && (
            <Callout variant="warning" title={`${rows(check.differences)} differ from the log`}>
              Rebuilding replaces them with what the log produces. The log itself is not changed.
            </Callout>
          )}
          {check.status === "rebuilt" && (
            <Callout variant="success" title="Rebuilt from the log">
              {check.differences === 0
                ? "Nothing needed to change."
                : `${rows(check.differences)} updated.`}
            </Callout>
          )}
          {check.status === "error" && (
            <Callout variant="danger" title="Something went wrong">
              {check.error}
            </Callout>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-11" disabled={working} onClick={() => void check.run()}>
            Check derived data
          </Button>
          {(check.status === "inconsistent" || check.status === "error") && (
            <Button className="h-11" disabled={working} onClick={() => void check.rebuild()}>
              Rebuild from log
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
