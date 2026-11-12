"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { FlaskConical, Search } from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  GLOSSARY,
  GLOSSARY_THEMES,
  isTermId,
  searchGlossary,
  type GlossaryTheme,
  type TermId,
} from "@/lib/glossary";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** The term named by the URL hash (`/more/glossary#amrap`), if any. */
function useHashTerm(): TermId | null {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => ""
  );
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  return isTermId(id) ? id : null;
}

function Entry({ id, highlighted }: { id: TermId; highlighted: boolean }) {
  const entry = GLOSSARY[id];
  return (
    <li
      id={id}
      data-highlighted={highlighted || undefined}
      className={cn(
        "scroll-mt-6 border-b border-border px-4 py-3.5 last:border-b-0",
        highlighted && "bg-accent-primary-soft"
      )}
    >
      <h3 className="text-[15px] font-semibold text-foreground">
        {entry.term}
        {entry.aka && entry.aka.length > 0 && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {entry.aka.slice(0, 3).join(", ")}
          </span>
        )}
      </h3>
      <p className="mt-1 text-sm text-foreground">{entry.short}</p>
      <p className="mt-1.5 text-sm text-muted-foreground">{entry.long}</p>
      {entry.ruleId && (
        <Link
          href={`/research#${entry.ruleId}`}
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-accent-primary"
        >
          <FlaskConical className="size-3.5" aria-hidden="true" />
          The research
        </Link>
      )}
    </li>
  );
}

/** Every glossary term, searchable, grouped by theme; the hash term is highlighted. */
export function GlossaryList() {
  const [query, setQuery] = useState("");
  const hashTerm = useHashTerm();
  const matches = useMemo(() => new Set(searchGlossary(query)), [query]);

  useEffect(() => {
    if (!hashTerm) return;
    const el = document.getElementById(hashTerm);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "center" });
    }
  }, [hashTerm]);

  const groups = (Object.keys(GLOSSARY_THEMES) as GlossaryTheme[])
    .map((theme) => ({ theme, ids: GLOSSARY_THEMES[theme].filter((id) => matches.has(id)) }))
    .filter((group) => group.ids.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <label className="flex h-11 items-center gap-2 rounded-xl bg-card px-3 focus-within:ring-[3px] focus-within:ring-ring/50">
        <Search className="size-4 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search terms"
          aria-label="Search terms"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>

      {groups.length === 0 && (
        <EmptyState
          icon={<Search />}
          title="No matching terms"
          body="Try a shorter word, such as RPE or rest."
        />
      )}

      {groups.map(({ theme, ids }) => (
        <section key={theme} className="flex flex-col gap-2" aria-label={theme}>
          <SectionHeader title={theme} className="px-1" />
          <ul className="overflow-hidden rounded-2xl bg-card">
            {ids.map((id) => (
              <Entry key={id} id={id} highlighted={id === hashTerm} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
