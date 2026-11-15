"use client";

import { cn } from "@/lib/utils";
import type { PrChance } from "@/lib/projection";
import type { TodayForecast } from "@/hooks";
import { StatTile } from "@/components/ui/stat-tile";
import { EYEBROW } from "./TodayHero";

const CHANCE_WORD: Record<Exclude<PrChance, "unknown">, string> = {
  likely: "Likely",
  stretch: "Stretch",
  unlikely: "Unlikely",
};

interface Tile {
  key: string;
  label: string;
  value: string;
  /** Words rather than a number: drawn a little smaller to fit a third of the row. */
  wordy?: boolean;
  accent?: boolean;
  sub: string;
  href?: string;
}

/** The tiles that have something to say; a part with no value gives no tile. */
export function forecastTiles(forecast: TodayForecast, newBestHref?: string): Tile[] {
  const tiles: Tile[] = [];
  const { session, newBest, readiness } = forecast;
  if (session) {
    tiles.push({
      key: "session",
      label: "Session",
      value: `${session.minutes} min`,
      sub:
        session.low !== undefined && session.high !== undefined
          ? `${session.low} to ${session.high}`
          : "rough estimate",
    });
  }
  if (newBest) {
    const known = newBest.probability !== null || newBest.chance !== "unknown";
    tiles.push({
      key: "new-best",
      label: "New best",
      value:
        newBest.probability !== null
          ? `${Math.round(newBest.probability * 100)}%`
          : newBest.chance === "unknown"
            ? `${newBest.repsNeeded}+ reps`
            : CHANCE_WORD[newBest.chance],
      wordy: newBest.probability === null,
      accent: true,
      sub: !known
        ? `beats ${Math.round(newBest.best)}`
        : newBest.approximate
          ? // The count assumes the usual logged effort, which the estimate credits.
            `needs about ${newBest.repsNeeded} reps`
          : `needs ${newBest.repsNeeded}+ reps`,
      href: newBestHref,
    });
  }
  if (readiness) {
    tiles.push({
      key: "readiness",
      label: "Readiness",
      value: String(Math.round(readiness.score)),
      sub: readiness.suggestSkippingAccessories ? "go lighter on extras" : "train as planned",
    });
  }
  return tiles;
}

const COLUMNS = ["", "grid-cols-1", "grid-cols-2", "grid-cols-3"];

/**
 * "The app's forecast for today": up to three tiles. Missing ones are left out and
 * the rest share the row; a single tile lies flat, value on the right.
 */
export function ForecastTiles({
  forecast,
  newBestHref,
}: {
  forecast: TodayForecast | undefined;
  newBestHref?: string;
}) {
  if (!forecast) return null;
  const tiles = forecastTiles(forecast, newBestHref);
  if (tiles.length === 0) return null;
  const single = tiles.length === 1;

  return (
    <section aria-labelledby="today-forecast" className="flex flex-col gap-1.5 px-5 pt-2.5">
      <h3 id="today-forecast" className={cn(EYEBROW, "text-muted-foreground")}>
        The app&apos;s forecast for today
      </h3>
      <div data-testid="forecast-tiles" className={cn("grid gap-2", COLUMNS[tiles.length])}>
        {tiles.map((tile) => (
          <StatTile
            key={tile.key}
            href={tile.href}
            className={cn(
              "min-w-0 gap-px rounded-2xl px-[11px] py-[9px]",
              // One tile: label and note on the left, the value large on the right.
              single &&
                "grid grid-cols-[1fr_auto] items-center gap-x-3 [&>*:nth-child(2)]:col-start-2 [&>*:nth-child(2)]:row-span-2 [&>*:nth-child(2)]:row-start-1"
            )}
            label={<span className="text-[11px] whitespace-nowrap">{tile.label}</span>}
            value={
              <span
                data-testid={`forecast-${tile.key}`}
                className={cn(
                  "font-display leading-[1.05] font-extrabold whitespace-nowrap",
                  tile.wordy ? "text-xl" : "text-2xl",
                  tile.accent && "text-accent-primary"
                )}
              >
                {tile.value}
              </span>
            }
            delta={
              <span className="block truncate text-[11px] text-muted-foreground">{tile.sub}</span>
            }
          />
        ))}
      </div>
    </section>
  );
}
