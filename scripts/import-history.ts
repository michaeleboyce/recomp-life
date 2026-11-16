/**
 * Preloads training history from Fitbod or Gravl exports into the live database.
 *
 * Runs the import screen's parsers, exercise mapping (the built-in table only: no
 * remembered choices, no prompts) and record building on this Mac, then either prints
 * totals (the default, `--dry-run`) or, with `--write`, inserts the rows into the
 * database named by DATABASE_URL in the sync format (the columns and stamps the sync
 * registry expects), so every device pulls them on its next sync. Writes go in batches,
 * one transaction per batch, and skip any row whose id is stored already: running it
 * twice adds nothing, and a row a device has since changed or deleted is left alone.
 * Cardio that overlaps a run or activity already in the database is left out.
 *
 * It prints counts only: never a row, a name, a date or a weight. The export files are
 * read from the paths given and never copied anywhere.
 *
 *   node scripts/import-history.ts [--dry-run] <export.csv> [more.csv ...]
 *   DATABASE_URL=... node scripts/import-history.ts --write <export.csv> [more.csv ...]
 *
 * (Node 22.18 or later runs the TypeScript directly; `npx jiti scripts/import-history.ts`
 * works too.)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

type PreloadModule = typeof import("../src/lib/import/preload");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = [
  "Usage:",
  "  node scripts/import-history.ts [--dry-run] <export.csv> [more.csv ...]",
  "  DATABASE_URL=... node scripts/import-history.ts --write <export.csv> [more.csv ...]",
].join("\n");

function parseArgs(argv: string[]): { write: boolean; files: string[] } | null {
  let write = false;
  const files: string[] = [];
  for (const arg of argv) {
    if (arg === "--write") write = true;
    else if (arg === "--dry-run") write = false;
    else if (arg === "--help" || arg === "-h") return null;
    else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    else files.push(arg);
  }
  return files.length > 0 ? { write, files } : null;
}

/** A database error's code only: its message can quote row values. */
function describeError(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" ? `database error ${code}` : "an error (details withheld: they can include row contents)";
}

async function main(): Promise<number> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    console.error(USAGE);
    return 1;
  }
  if (!args) {
    console.log(USAGE);
    return 1;
  }

  const jiti = createJiti(import.meta.url, { alias: { "@/": `${path.join(ROOT, "src")}/` } });
  const preload = await jiti.import<PreloadModule>(path.join(ROOT, "src/lib/import/preload.ts"));

  const files = args.files.map((file) => ({ text: readFileSync(path.resolve(file), "utf8") }));
  const batchId = `preload-${new Date().toISOString().slice(0, 10)}`;
  const plan = preload.planPreload(files, batchId);
  for (const line of preload.formatTotals(plan.totals)) console.log(line);

  if (plan.totals.files.some((f) => f.error)) {
    console.error("A file was not an export this script can read; nothing was written.");
    return 1;
  }
  if (!args.write) {
    console.log("Dry run: nothing was written. Cardio is checked for overlaps with the database only with --write.");
    return 0;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("--write needs DATABASE_URL in the environment.");
    return 1;
  }
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  const db: import("../src/lib/import/preload").PreloadDatabase = {
    async transaction(statements) {
      const results = await sql.transaction(statements.map((s) => sql.query(s.text, s.values)));
      return results as unknown[][];
    },
    async loggedCardio() {
      const rows = (await sql.query(
        'SELECT "id", "date", "duration_minutes", "deleted_at" FROM "runs" UNION ALL SELECT "id", "date", "duration_minutes", "deleted_at" FROM "activities"'
      )) as Array<{ id: string; date: string | Date; duration_minutes: number; deleted_at: string | number | null }>;
      return rows.map((r) => ({
        id: r.id,
        date: r.date,
        durationMinutes: Number(r.duration_minutes),
        deletedAt: r.deleted_at == null ? null : Number(r.deleted_at),
      }));
    },
  };

  try {
    const result = await preload.writePreload(plan, db, Date.now(), (table, done, total) => {
      console.log(`  ${table}: ${done} of ${total}`);
    });
    console.log(
      `Written in ${result.batches} batches: ${result.sessionsInserted} sessions (${result.sessionsSkipped} already stored), ` +
        `${result.runsInserted} runs and ${result.activitiesInserted} activities ` +
        `(${result.cardioOverlappingLogged} cardio entries overlapped one already logged, ${result.cardioAlreadyStored} were stored already).`
    );
    return 0;
  } catch (error) {
    console.error(`The write stopped with ${describeError(error)}. Batches written before it stay; running again adds only the rest.`);
    return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`Stopped with ${describeError(error)}.`);
    process.exit(1);
  }
);
