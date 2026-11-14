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

/** GET /api/sync/pull */
export interface PullResponse {
  /** Every row of every registry table, soft-deleted rows included, by table name. */
  rows: Record<string, WireRow[]>;
  /** Tables that could not be read (for example not created yet), with the reason. */
  errors: Record<string, string>;
  /** Server clock, epoch milliseconds. */
  serverTime: number;
}

/** A client stamp further ahead of the server clock than this is clamped to it. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
