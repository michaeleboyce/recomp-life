import Link from "next/link";
import { formatRegistryDate, getChangelog, getRule, getSource } from "@/lib/evidence";

/** Changes made to the app because of research, newest first. */
export function UpdateList() {
  const changelog = getChangelog();
  return (
    <div className="space-y-3 pt-2">
      <p className="text-xs text-muted-foreground">
        Changes made to the app because of research, newest first.
      </p>
      {changelog.map((entry, index) => (
        <article
          key={`${entry.date}-${entry.ruleId}-${index}`}
          className="space-y-2 rounded-xl border border-border bg-card p-4"
        >
          <p className="text-xs text-muted-foreground">{formatRegistryDate(entry.date)}</p>
          <p className="text-sm text-foreground">{entry.change}</p>
          <p className="text-xs text-muted-foreground">
            {entry.sources.map((id) => getSource(id).short).join(", ")}
          </p>
          <Link
            href={`/research?rule=${entry.ruleId}`}
            className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-xs text-foreground hover:bg-accent/50"
          >
            {getRule(entry.ruleId).title}
          </Link>
        </article>
      ))}
    </div>
  );
}
