"use client";

import { ArrowLeft } from "lucide-react";
import { BackButton } from "@/components/nav/BackButton";
import { MusclesTab } from "@/components/Progress/MusclesTab";

export default function MusclesPage() {
  return (
    <div className="mx-auto max-w-lg px-5 pt-5 pb-28">
      <header className="flex items-center gap-3 mb-5">
        <BackButton fallback="/progress?tab=muscles">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </BackButton>
        <h1 className="text-lg font-bold text-foreground">Muscles</h1>
      </header>
      <MusclesTab />
    </div>
  );
}
