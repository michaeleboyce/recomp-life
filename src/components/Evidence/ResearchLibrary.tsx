"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChipGroup } from "@/components/ui/chip-group";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  REGISTRY_REVIEWED_ON,
  STRENGTH_LABELS,
  STRENGTH_ORDER,
  formatRegistryDate,
  getAllRules,
  getRulesByArea,
  type RuleId,
  type RuleWithId,
} from "@/lib/evidence";
import { getModel, isModelId } from "@/lib/glass/modelMap";
import type { EvidenceStrength } from "@/types";
import { HowToRead } from "./HowToRead";
import { RuleCard } from "./RuleCard";
import { RulePage } from "./RulePage";
import { SourceList } from "./SourceList";
import { UpdateList } from "./UpdateList";
import { useLinkedRuleId } from "./useLinkedRule";

type TabId = "rules" | "sources" | "updates";
type StrengthFilter = EvidenceStrength | "all";

/**
 * The research library. `?rule=<id>` (or `#<id>`) opens one rule on its own page;
 * `?model=<id>` lists only the rules behind one model of "How the app decides".
 * Needs a Suspense boundary above it (it reads the query).
 */
export function ResearchLibrary() {
  const linked = useLinkedRuleId();
  const params = useSearchParams();
  const modelParam = params.get("model");
  const model = isModelId(modelParam) ? getModel(modelParam) : undefined;
  const [tab, setTab] = useState<TabId>("rules");
  const [filter, setFilter] = useState<StrengthFilter>("all");
  // Rules the user has opened or closed by hand in the list.
  const [toggled, setToggled] = useState<Partial<Record<RuleId, boolean>>>({});

  if (linked) {
    return (
      <PageShell className="flex flex-col gap-4">
        <RulePage ruleId={linked} backHref={model ? `/research?model=${model.id}` : "/research"} />
      </PageShell>
    );
  }

  const inModel = (rule: RuleWithId) => !model || model.ruleIds.includes(rule.id);
  const matches = (rule: RuleWithId) =>
    inModel(rule) && (filter === "all" || rule.strength === filter);

  const activeGroups = getRulesByArea("active")
    .map((group) => ({ ...group, rules: group.rules.filter(matches) }))
    .filter((group) => group.rules.length > 0);
  const plannedRules = getAllRules().filter((rule) => rule.status === "planned" && matches(rule));

  const strengthsInUse = STRENGTH_ORDER.filter((strength) =>
    getAllRules().some((rule) => rule.strength === strength && inModel(rule))
  );

  const toggle = (id: RuleId) => setToggled((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <PageShell className="flex flex-col gap-4">
      <PageHeader title="How the app coaches" backHref="/more" />
      <p className="text-sm text-muted-foreground">
        Every coaching rule in the app, what it does, why, and the research behind it. Rules
        without research are labelled as such.
      </p>
      <p className="text-xs text-muted-foreground">
        Last reviewed against the research: {formatRegistryDate(REGISTRY_REVIEWED_ON)}
      </p>

      <HowToRead />

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)}>
        <TabsList className="w-full">
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="updates">Updates</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-5 pt-2">
          {model && (
            <p className="flex flex-wrap items-center gap-x-3 rounded-xl bg-card px-3 py-2 text-sm text-foreground">
              <span className="min-w-0 flex-1">
                Showing the rules behind <strong>{model.label}</strong>.
              </span>
              <Link
                href="/research"
                className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
              >
                Show all rules
              </Link>
            </p>
          )}

          <ChipGroup
            ariaLabel="Filter by evidence strength"
            size="sm"
            value={filter}
            onChange={(value) => setFilter(value as StrengthFilter)}
            options={[
              { value: "all", label: "All" },
              ...strengthsInUse.map((s) => ({ value: s, label: STRENGTH_LABELS[s] })),
            ]}
          />

          {activeGroups.map((group) => (
            <section key={group.area} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </h2>
              {group.rules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  open={!!toggled[rule.id]}
                  highlighted={false}
                  onToggle={() => toggle(rule.id)}
                />
              ))}
            </section>
          ))}

          {plannedRules.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Not active yet
              </h2>
              <p className="text-xs text-muted-foreground">
                These rules exist in the code but are not connected to any screen, so they do not
                affect your training.
              </p>
              {plannedRules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  open={!!toggled[rule.id]}
                  highlighted={false}
                  onToggle={() => toggle(rule.id)}
                />
              ))}
            </section>
          )}

          {activeGroups.length === 0 && plannedRules.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No rules with this evidence grade.
            </p>
          )}
        </TabsContent>

        <TabsContent value="sources">
          <SourceList />
        </TabsContent>
        <TabsContent value="updates">
          <UpdateList />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
