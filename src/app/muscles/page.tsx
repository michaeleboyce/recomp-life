"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MusclesTab } from "@/components/Progress/MusclesTab";

export default function MusclesPage() {
  return (
    <div className="mx-auto max-w-lg px-5 pt-5 pb-28">
      <header className="flex items-center gap-3 mb-5">
        <Link
          href="/more"
          aria-label="Back to tools"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">Muscles</h1>
      </header>
      <MusclesTab />
    </div>
  );
}
