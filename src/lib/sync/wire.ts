// Wire format of the sync API, shared by the routes and the client. Types only.

/** A row as it travels: client field names, dates as ISO strings, stamps as numbers. */
export type WireRow = Record<string, unknown>;

/** POST /api/sync/push */
export interface PushRequest {
  /** A `name` from SYNC_REGISTRY. */
  table: string;
  /**
   * Full rows. A cleared optional field is sent as `null`, never omitted, so the
   * server clears it too.
   */
  rows: WireRow[];
}

export interface PushResponse {
  success: true;
  /** Rows written (inserted, or updated because their `updatedAt` was newer or equal). */
  applied: number;
  /** Rows ignored because the server already holds a newer `updatedAt`. */
  skipped: number;
}

/**
 * GET /api/sync/pull?table=<name>[&since=<ms>][&cursor=<cursor>]: one page of one
 * registry table.
 *
 * Rows come in the order the server last wrote them (its own write stamp, then
 * clientId), soft-deleted rows included. `since` keeps only rows the server wrote at
 * or after that stamp; `cursor` (a page's `nextCursor`) continues after the last row
 * of the previous page. The write stamp is the server's, set on every write it
 * applies, never the device's `updatedAt`: an edit made offline and pushed later
 * still lands after every device's `since`. A table that cannot be read answers 500
 * with a generic reason.
 */
export interface PullPageResponse {
  table: string;
  /** At most PULL_PAGE_ROWS rows and about PULL_PAGE_BYTES of JSON (always at least one row when any is left). */
  rows: WireRow[];
  /** Pass back as `cursor` for the next page; null when this page was the last. */
  nextCursor: string | null;
  /** Server clock, epoch milliseconds. */
  serverTime: number;
}

/** The most rows one pull page carries. */
export const PULL_PAGE_ROWS = 500;

/**
 * About the most JSON one pull page carries, in bytes: well under the 4.5 MB a
 * serverless function may return. A page stops at whichever of this and
 * PULL_PAGE_ROWS comes first.
 */
export const PULL_PAGE_BYTES = 1_000_000;

/**
 * How far before a pull's start the next pull's `since` reaches back. A push stamps
 * its whole batch when it starts and may take up to the push route's maxDuration (60
 * seconds) to write it, and two server instances' clocks can differ slightly, so a
 * row can land with a stamp a little earlier than a pull that missed it. Reading
 * these rows twice costs nothing: the merge keeps an equal copy.
 */
export const PULL_SINCE_OVERLAP_MS = 2 * 60 * 1000;

/** A pull cursor: the server write stamp and clientId of the last row of a page. */
export interface PullCursor {
  stamp: number;
  clientId: string;
}

export function encodePullCursor(cursor: PullCursor): string {
  return `${cursor.stamp}:${cursor.clientId}`;
}

/** The cursor a `nextCursor` string names, or null when it is not one. */
export function decodePullCursor(text: string | null | undefined): PullCursor | null {
  if (typeof text !== "string") return null;
  const colon = text.indexOf(":");
  if (colon <= 0) return null;
  const stampText = text.slice(0, colon);
  const clientId = text.slice(colon + 1);
  if (!/^\d{1,16}$/.test(stampText) || clientId.length === 0 || clientId.length > 200) return null;
  return { stamp: Number(stampText), clientId };
}

/**
 * The most rows one push may carry. The server refuses a larger batch (413); the
 * client sends a table's dirty rows in batches of at most this many.
 */
export const MAX_PUSH_ROWS = 500;

/** A client stamp further ahead of the server clock than this is clamped to it. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
