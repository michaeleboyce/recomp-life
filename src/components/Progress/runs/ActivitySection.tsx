import { ListRow } from "@/components/ui/list-row";
import { SectionHeader } from "@/components/ui/section-header";
import { formatMinutes, type ActivityTotal } from "./runsMath";

/** Sessions and minutes per kind of non-running activity; nothing when there are none. */
export function ActivitySection({ totals }: { totals: ActivityTotal[] }) {
  if (totals.length === 0) return null;
  return (
    <section aria-label="Other activity">
      <SectionHeader title="Other activity" />
      {totals.map((t) => (
        <ListRow
          key={t.kind}
          title={t.label}
          subtitle={`${t.sessions} ${t.sessions === 1 ? "session" : "sessions"}`}
          value={formatMinutes(t.minutes)}
        />
      ))}
    </section>
  );
}
