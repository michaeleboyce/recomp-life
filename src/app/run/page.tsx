"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import RunLogger from "@/components/RunLogger";

export default function RunPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-5 pt-5 pb-28 space-y-4">
        {/* Header */}
        <header className="flex items-center gap-3">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold text-foreground">Log Run</h1>
        </header>

        {/* Run Logger Form */}
        <RunLogger />
      </div>
    </div>
  );
}
