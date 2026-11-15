import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { DESIGN_LABELS, getAllSources, getRulesForSource } from "@/lib/evidence";

const PILL =
  "inline-flex min-h-11 items-center rounded-full border border-border px-3 text-xs text-foreground hover:bg-accent/50";

/** Every cited paper, A to Z, with the rules that rely on it. */
export function SourceList() {
  const sources = getAllSources().sort((a, b) => a.short.localeCompare(b.short));
  return (
    <div className="space-y-3 pt-2">
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
            {source.authors} ({source.year}). <span className="italic">{source.journal}</span>
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
              className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              Free full text
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Used for:</span>
            {getRulesForSource(source.id).map((rule) => (
              <Link key={rule.id} href={`/research?rule=${rule.id}`} className={PILL}>
                {rule.title}
              </Link>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
