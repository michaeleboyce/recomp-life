"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { LiftDetail } from "@/components/Lift/LiftDetail";
import { isMainLift } from "@/components/Progress/lifts";

export default function LiftPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  return (
    <PageShell>
      {isMainLift(id) ? (
        <LiftDetail exerciseId={id} />
      ) : (
        <EmptyState
          icon={<SearchX />}
          title="No such lift"
          body="Lift pages cover squat, bench press, deadlift and overhead press."
          action={
            <Button asChild variant="outline">
              <Link href="/progress">Back to Progress</Link>
            </Button>
          }
        />
      )}
    </PageShell>
  );
}
