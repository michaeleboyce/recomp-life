"use client";

import { cn } from "@/lib/utils";
import type { PrChance } from "@/lib/projection";
import type { TodayForecast } from "@/hooks";
import { StatTile } from "@/components/ui/stat-tile";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import type { RuleId } from "@/lib/evidence";
import { EYEBROW, settleProps, useSettleOnce } from "./TodayHero";

/** The tiles settle in after the hero's two parts. */
const FIRST_TILE_STEP = 2;

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
  /** The coaching rule behind the figure. */
  ruleId: RuleId;
}

/** `href` with `from=today` added, so the page it opens can come back to Today. */
function fromToday(href: string): string {
  if (/[?&]from=/.test(href)) return href;
  return `${href}${href.includes("?") ? "&" : "?"}from=today`;
}

/** The tiles that have something to say; a part with no value gives no tile. */
export function forecastTiles(forecast: TodayForecast, newBestHref?: string): Tile[] {
  const tiles: Tile[] = [];
  const { session, newBest, readiness } = forecast;
  if (session) {
    tiles.push({
      key: "session",
      ruleId: "forecast-session-length",
      href: "/progress/forecasts",
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
      ruleId: "forecast-reps",
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
      href: newBestHref ? fromToday(newBestHref) : undefined,
    });
  }
  if (readiness) {
    tiles.push({
      key: "readiness",
      ruleId: "readiness-score",
      href: "/readiness?from=today",
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
  // Called before the early returns: the tiles settle in when they first appear, even
  // if the forecast arrives after the screen.
  const settle = useSettleOnce("today-forecast-tiles");
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
        {tiles.map((tile, i) => {
          const motion = settleProps(settle, FIRST_TILE_STEP + i);
          // The icon sits beside the link, not inside it: no button inside an anchor.
          return (
            <div
              key={tile.key}
              data-settle={settle || undefined}
              className={cn("relative flex min-w-0 flex-col", motion.className)}
              style={motion.style}
            >
              <StatTile
                href={tile.href}
                className={cn(
                  "min-w-0 flex-1 gap-px rounded-2xl px-[11px] py-[9px]",
                  // One tile: label and note on the left, the value large on the right.
                  single &&
                    "grid grid-cols-[1fr_auto] items-center gap-x-3 pr-8 [&>*:nth-child(2)]:col-start-2 [&>*:nth-child(2)]:row-span-2 [&>*:nth-child(2)]:row-start-1"
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
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {tile.sub}
                  </span>
                }
              />
              <EvidenceLine
                ruleId={tile.ruleId}
                variant="icon"
                className="absolute top-1 right-1"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
