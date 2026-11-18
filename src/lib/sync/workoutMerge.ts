// A workout row merged between devices where its parts are independent. A row is
// last-write-wins as a whole, and watch data (heart rate, energy) is attached to a
// workout by whichever device reads Apple Health. Without this, a device attaching
// watch data to its older copy of a workout stamps the whole row as new and so
// overwrites a correction (a set's reps, say) made on another device meanwhile.
//
// The watch data therefore records its own stamps (`WorkoutHealth.stamp`): the row
// stamp the attach wrote and the stamp the rest of the row had before it. While the
// attach is the row's last write, the rest of the row is as old as the second one
// (`contentStampOf`), and a pull takes the log from the copy whose log is newer and
// the watch data from the copy that has it. Pure: no database.
import { stampOf } from "./revive";

type Row = Record<string, unknown>;

interface HealthStamp {
  /** The row's `updatedAt` as written by the write that attached (or carried) the watch data. */
  row: number;
  /** The row's `updatedAt` before that write: how new everything but the watch data is. */
  content: number;
}

const isRecord = (value: unknown): value is Row =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);

function healthOf(row: Row): Row | null {
  return isRecord(row.health) ? row.health : null;
}

function healthStampOf(row: Row): HealthStamp | null {
  const stamp = healthOf(row)?.stamp;
  if (!isRecord(stamp)) return null;
  const { row: rowStamp, content } = stamp;
  if (typeof rowStamp !== "number" || typeof content !== "number") return null;
  if (!Number.isFinite(rowStamp) || !Number.isFinite(content)) return null;
  return { row: rowStamp, content };
}

/**
 * How new everything in a workout row but its watch data is: the stamp from before the
 * watch data was attached while that attach is still the row's last write, otherwise
 * the row's own `updatedAt`.
 */
export function contentStampOf(session: object): number {
  const row = session as Row;
  const stamp = healthStampOf(row);
  return stamp && stamp.row === stampOf(row) ? Math.min(stamp.content, stamp.row) : stampOf(row);
}

/**
 * The fields to write when watch data is attached to a stored workout at `rowStamp`
 * (the new `updatedAt`): the watch data, recording that the rest of the row is no newer
 * than it was.
 */
export function watchDataFields<H extends object>(
  session: object,
  health: H,
  rowStamp: number
): { health: H & { stamp: HealthStamp }; updatedAt: number; synced: false } {
  return {
    health: { ...health, stamp: { row: rowStamp, content: contentStampOf(session) } },
    updatedAt: rowStamp,
    synced: false,
  };
}

export type WorkoutPull =
  | { decision: "keep" }
  | { decision: "overwrite" }
  /** Neither copy holds everything: store `row` and push it back. */
  | { decision: "merge"; row: Row };

/**
 * The pull rule for a workout both sides hold. The log (everything but the watch data)
 * comes from the copy whose log is newer (`contentStampOf`; a tie goes to the copy with
 * the newer `updatedAt`, and then to the local one), the watch data from that copy when
 * it has any, else from the other. When one copy supplies both, this is the ordinary
 * rule. Otherwise the merged row gets `newStamp` and stays unsynced, so the push that
 * follows the pull carries it to the server and from there to the other device.
 *
 * `local` and `incoming` are rows as stored locally (`toLocalRow` for the server's).
 */
export function mergeWorkoutPull(local: Row, incoming: Row, newStamp: number): WorkoutPull {
  const serverNewer = stampOf(incoming) > stampOf(local);
  const localContent = contentStampOf(local);
  const serverContent = contentStampOf(incoming);
  const logFromServer = serverContent > localContent || (serverContent === localContent && serverNewer);
  const log = logFromServer ? incoming : local;
  const other = logFromServer ? local : incoming;
  const healthFrom = healthOf(log) || !healthOf(other) ? log : other;

  if (healthFrom === log) {
    if (logFromServer) return serverNewer ? { decision: "overwrite" } : { decision: "keep" };
    if (!serverNewer) return { decision: "keep" };
    // The local copy holds everything, but the server's stamp is newer (it stamped an
    // older log with watch data): the local row has to go out again to replace it.
  }

  const health = healthOf(healthFrom);
  const row: Row = { ...log, id: local.id, updatedAt: newStamp, synced: false };
  if (health) row.health = { ...health, stamp: { row: newStamp, content: contentStampOf(log) } };
  return { decision: "merge", row };
}

/** A stable rendering of a row's synced content: key order, `id` and `synced` do not count. */
function contentKey(value: unknown): string {
  return JSON.stringify(value, (key, entry: unknown) => {
    if (!isRecord(entry)) return entry;
    const sorted: Row = {};
    for (const name of Object.keys(entry).sort()) {
      if (entry === value && (name === "id" || name === "synced")) continue;
      if (entry[name] !== undefined && entry[name] !== null) sorted[name] = entry[name];
    }
    return sorted;
  });
}

/** True when two rows as stored locally hold the same synced content. */
export function sameContent(a: Row, b: Row): boolean {
  return contentKey(a) === contentKey(b);
}
