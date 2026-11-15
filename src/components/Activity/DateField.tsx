"use client";

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-foreground/30";

/** "2026-11-14" in the device's time zone, the format a date input uses. */
export function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The moment to store for a date input value: right now when it is today, otherwise
 * midday on that day. An empty or future value gives `now`.
 */
export function dateFromInput(value: string, now: Date = new Date()): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || value >= toDateInputValue(now)) return now;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
}

/** An optional "Date" field that defaults to today and cannot be in the future. */
export function DateField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        Date
      </label>
      <input
        id={id}
        type="date"
        value={value}
        max={toDateInputValue(new Date())}
        onChange={(e) => onChange(e.target.value || toDateInputValue(new Date()))}
        className={INPUT_CLASS}
      />
    </div>
  );
}
