"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { SearchX } from "lucide-react";
import { ProjectionView } from "@/components/Projection/ProjectionView";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { EXERCISES } from "@/lib/exercises";

/** /progress/lift/[id]/projection: projected e1RM under alternatives (U18). */
export default function LiftProjectionPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params?.id ?? "");

  if (!EXERCISES[id]) {
    return (
      <PageShell>
        <PageHeader title="Projection" backHref="/progress" />
        <EmptyState
          icon={<SearchX />}
          title="Lift not found"
          body="There is no lift with this name to project."
          action={
            <Link
              href="/progress"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Back to Progress
            </Link>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <ProjectionView exerciseId={id} />
    </PageShell>
  );
}
