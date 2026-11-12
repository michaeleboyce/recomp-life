"use client";

import Link from "next/link";
import { Dumbbell, Calculator, ChevronRight, PersonStanding, FlaskConical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const TOOLS = [
  {
    href: "/exercises",
    label: "Exercise Browser",
    description: "Browse all exercises, muscles, equipment, and preferences",
    icon: Dumbbell,
  },
  {
    href: "/muscles",
    label: "Muscle Explorer",
    description: "See weekly volume, recovery, and pain on the body",
    icon: PersonStanding,
  },
  {
    href: "/1rm-calculator",
    label: "1RM Calculator",
    description: "Estimate your one-rep max from a recent working set",
    icon: Calculator,
  },
  {
    href: "/research",
    label: "How the App Coaches",
    description: "Every coaching rule, why it exists, and the research behind it",
    icon: FlaskConical,
  },
] as const;

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-lg px-5 pt-5 pb-28">
      <header className="mb-6">
        <h1 className="text-lg font-bold text-foreground">Tools</h1>
      </header>

      <div className="space-y-3">
        {TOOLS.map(({ href, label, description, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card className="transition-colors hover:bg-accent/50 active:scale-[0.98]">
              <CardContent className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {label}
                  </p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
