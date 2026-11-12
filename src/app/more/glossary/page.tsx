"use client";

import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { GlossaryList } from "@/components/Glossary/GlossaryList";

export default function GlossaryPage() {
  return (
    <PageShell className="flex flex-col gap-4">
      <PageHeader title="Glossary" backHref="/more" />
      <p className="text-sm text-muted-foreground">
        What the abbreviations and training words in the app mean, and why it uses them.
      </p>
      <GlossaryList />
    </PageShell>
  );
}
