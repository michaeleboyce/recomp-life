"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ExternalLink } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  DESIGN_LABELS,
  REGISTRY_REVIEWED_ON,
  STRENGTH_DESCRIPTIONS,
  STRENGTH_LABELS,
  STRENGTH_ORDER,
  formatRegistryDate,
  getAllRules,
  getAllSources,
  getChangelog,
  getRule,
  getRulesByArea,
  getRulesForSource,
  getSource,
  isRuleId,
  type RuleId,
  type RuleWithId,
} from "@/lib/evidence";
import { RuleDetail } from "@/components/Evidence/RuleDetail";
import { StrengthBadge } from "@/components/Evidence/StrengthBadge";
import type { EvidenceStrength } from "@/types";

type TabId = "rules" | "sources" | "updates";
type StrengthFilter = EvidenceStrength | "all";

// ─── URL hash as an external store ───────────────────────────────────────────
// A link such as /research#rest-heavy opens straight to that rule.

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function useHashRuleId(): RuleId | null {
  const hash = useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash,
    () => ""
  );
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  return isRuleId(id) ? id : null;
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-9 rounded-full border px-3 text-xs font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function RuleCard({
  rule,
  open,
  highlighted,
  onToggle,
}: {
  rule: RuleWithId;
  open: boolean;
  highlighted: boolean;
  onToggle: () => void;
}) {
  return (
    <article
      id={rule.id}
      className={cn(
        "scroll-mt-4 rounded-xl border bg-card transition-shadow",
        highlighted ? "border-foreground/60 ring-2 ring-ring/40" : "border-border"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${rule.id}-detail`}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span className="min-w-0 flex-1 space-y-1.5">
          <span className="block text-sm font-semibold text-foreground">
            {rule.title}
          </span>
          <span className="block text-xs text-muted-foreground">
            {rule.summary}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <StrengthBadge strength={rule.strength} />
            {rule.status === "planned" && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Not active yet
              </span>
            )}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={`${rule.id}-detail`} className="border-t border-border p-4">
          <RuleDetail ruleId={rule.id} />
        </div>
      )}
    </article>
  );
}

function HowToRead() {
  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between px-4 text-sm font-medium text-foreground">
        How to read this
        <ChevronDown
          className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="space-y-4 border-t border-border p-4">
        <ul className="space-y-3">
          {STRENGTH_ORDER.map((strength) => (
            <li key={strength} className="space-y-0.5">
              <StrengthBadge strength={strength} />
              <p className="text-xs text-muted-foreground">
                {STRENGTH_DESCRIPTIONS[strength]}
              </p>
            </li>
          ))}
        </ul>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            Most training studies last 8 to 12 weeks and many use people new to
            lifting, so even well-supported rules are averages. Every suggestion
            in the app can be overridden.
          </p>
          <p>
            This is training guidance, not medical advice. For pain or injury,
            see a clinician.
          </p>
        </div>
      </div>
    </details>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ResearchPage() {
  const hashRuleId = useHashRuleId();

  const [tab, setTab] = useState<TabId>("rules");
  const [filter, setFilter] = useState<StrengthFilter>("all");
  // Rules the user has opened or closed by hand; the linked rule opens by default.
  const [toggled, setToggled] = useState<Partial<Record<RuleId, boolean>>>({});

  const isOpen = (id: RuleId) => toggled[id] ?? id === hashRuleId;

  const toggleRule = (id: RuleId) =>
    setToggled((prev) => ({ ...prev, [id]: !(prev[id] ?? id === hashRuleId) }));

  /** Jump to a rule from the Sources or Updates tab. */
  const goToRule = (id: RuleId) => {
    setTab("rules");
    setFilter("all");
    setToggled((prev) => ({ ...prev, [id]: true }));
    if (window.location.hash === `#${id}`) {
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    } else {
      // Updates the hash (and fires hashchange) so the rule is linkable
      window.location.assign(`#${id}`);
    }
  };

  // Bring the linked rule into view once it is on screen.
  useEffect(() => {
    if (!hashRuleId || tab !== "rules") return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(hashRuleId)?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [hashRuleId, tab]);

  const matchesFilter = (rule: RuleWithId) =>
    filter === "all" || rule.strength === filter || rule.id === hashRuleId;

  const activeGroups = getRulesByArea("active")
    .map((group) => ({ ...group, rules: group.rules.filter(matchesFilter) }))
    .filter((group) => group.rules.length > 0);

  const plannedRules = getAllRules().filter(
    (rule) => rule.status === "planned" && matchesFilter(rule)
  );

  const strengthsInUse = STRENGTH_ORDER.filter((strength) =>
    getAllRules().some((rule) => rule.strength === strength)
  );

  const sources = getAllSources().sort((a, b) =>
    a.short.localeCompare(b.short)
  );
  const changelog = getChangelog();

  return (
    <div className="mx-auto max-w-lg px-5 pt-5 pb-28">
      <header className="mb-4 flex items-center gap-3">
        <Link
          href="/more"
          aria-label="Back to Tools"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">How the app coaches</h1>
      </header>

      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Every coaching rule in the app, what it does, why, and the research
          behind it. Rules without research are labelled as such.
        </p>
        <p className="text-xs text-muted-foreground">
          Last reviewed against the research:{" "}
          {formatRegistryDate(REGISTRY_REVIEWED_ON)}
        </p>

        <HowToRead />

        <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)}>
          <TabsList className="w-full">
            <TabsTrigger value="rules">Rules</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="updates">Updates</TabsTrigger>
          </TabsList>

          {/* ── Rules ─────────────────────────────────────────────────── */}
          <TabsContent value="rules" className="space-y-5 pt-2">
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Filter by evidence strength"
            >
              <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
                All
              </FilterChip>
              {strengthsInUse.map((strength) => (
                <FilterChip
                  key={strength}
                  active={filter === strength}
                  onClick={() => setFilter(strength)}
                >
                  {STRENGTH_LABELS[strength]}
                </FilterChip>
              ))}
            </div>

            {activeGroups.map((group) => (
              <section key={group.area} className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </h2>
                {group.rules.map((rule) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    open={isOpen(rule.id)}
                    highlighted={rule.id === hashRuleId}
                    onToggle={() => toggleRule(rule.id)}
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
                  These rules exist in the code but are not connected to any
                  screen, so they do not affect your training.
                </p>
                {plannedRules.map((rule) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    open={isOpen(rule.id)}
                    highlighted={rule.id === hashRuleId}
                    onToggle={() => toggleRule(rule.id)}
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

          {/* ── Sources ───────────────────────────────────────────────── */}
          <TabsContent value="sources" className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              {sources.length} papers. Each title links to the paper.
            </p>
            {sources.map((source) => (
              <article
                key={source.id}
                id={`source-${source.id}`}
                className="space-y-2 rounded-xl border border-border bg-card p-4"
              >
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-start gap-1.5 text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  <span>{source.title}</span>
                  <ExternalLink
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                <p className="text-xs text-muted-foreground">
                  {source.authors} ({source.year}).{" "}
                  <span className="italic">{source.journal}</span>
                  {" · "}
                  {DESIGN_LABELS[source.design]}
                  {" · "}
                  {source.population}
                </p>
                <p className="text-sm text-foreground">{source.finding}</p>
                {source.fullTextUrl && (
                  <a
                    href={source.fullTextUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Free full text
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Used for:</span>
                  {getRulesForSource(source.id).map((rule) => (
                    <button
                      key={rule.id}
                      type="button"
                      onClick={() => goToRule(rule.id)}
                      className="min-h-9 rounded-full border border-border px-2.5 text-xs text-foreground hover:bg-accent/50"
                    >
                      {rule.title}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </TabsContent>

          {/* ── Updates ───────────────────────────────────────────────── */}
          <TabsContent value="updates" className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Changes made to the app because of research, newest first.
            </p>
            {changelog.map((entry, index) => (
              <article
                key={`${entry.date}-${entry.ruleId}-${index}`}
                className="space-y-2 rounded-xl border border-border bg-card p-4"
              >
                <p className="text-xs text-muted-foreground">
                  {formatRegistryDate(entry.date)}
                </p>
                <p className="text-sm text-foreground">{entry.change}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.sources.map((id) => getSource(id).short).join(", ")}
                </p>
                <button
                  type="button"
                  onClick={() => goToRule(entry.ruleId)}
                  className="min-h-9 rounded-full border border-border px-2.5 text-xs text-foreground hover:bg-accent/50"
                >
                  {getRule(entry.ruleId).title}
                </button>
              </article>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
