// @vitest-environment node
/**
 * Verifies the research links. Needs the network, so it only runs when asked:
 * `npm run check:links`. Run it whenever a source is added or changed.
 *
 * Two checks:
 *
 * 1. Identity. Each source's DOI is looked up in Crossref and its PubMed id in
 *    PubMed. The title those registries hold must match the title in
 *    sources.ts, and the year must be within one (online-first vs print).
 *    This is what proves a link points at the cited paper: publisher pages
 *    answer automated requests with bot-challenge pages, so fetching the page
 *    itself proves nothing.
 *
 * 2. Reachability. Every `url` and `fullTextUrl` must not be missing (404/410)
 *    or unreachable. Publishers that refuse automated requests (401/403/429)
 *    are reported as "blocked", which is not a failure.
 */
import { it, expect } from "vitest";
import { getAllSources } from "./index";

const enabled = process.env.CHECK_LINKS === "1";
const BLOCKED = new Set([401, 403, 429]);
const HEADERS = { "user-agent": "evidence-link-check", accept: "application/json,text/html,*/*" };

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** True when the registry title and the looked-up title start with the same words. */
function sameTitle(expected: string, actual: string): boolean {
  const head = normalise(expected).split(" ").slice(0, 8).join(" ");
  return normalise(actual).startsWith(head);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** GET JSON, waiting and retrying when the registry rate-limits us (429). */
async function getJson(url: string, attempts = 4): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt >= attempts) {
      throw new Error(`${response.status} from ${url}`);
    }
    await sleep(attempt * 5_000);
  }
}

async function crossrefRecord(doi: string): Promise<{ title: string; year: number | null }> {
  const data = (await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`)) as {
    message: { title?: string[]; issued?: { "date-parts"?: number[][] } };
  };
  return {
    title: data.message.title?.[0] ?? "",
    year: data.message.issued?.["date-parts"]?.[0]?.[0] ?? null,
  };
}

async function pubmedRecords(pmids: string[]): Promise<Map<string, { title: string; year: number | null }>> {
  const records = new Map<string, { title: string; year: number | null }>();
  if (pmids.length === 0) return records;
  const data = (await getJson(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${pmids.join(",")}`
  )) as { result: Record<string, { title?: string; pubdate?: string }> };
  for (const pmid of pmids) {
    const entry = data.result[pmid];
    if (!entry) continue;
    const year = Number((entry.pubdate ?? "").slice(0, 4));
    records.set(pmid, { title: entry.title ?? "", year: Number.isFinite(year) && year > 0 ? year : null });
  }
  return records;
}

async function reach(url: string): Promise<{ status: number | string; ok: boolean; blocked: boolean }> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; evidence-link-check)", accept: "text/html,*/*" },
      signal: AbortSignal.timeout(30_000),
    });
    const blocked = BLOCKED.has(response.status);
    return { status: response.status, ok: response.ok || blocked, blocked };
  } catch (error) {
    return { status: error instanceof Error ? error.message : "error", ok: false, blocked: false };
  }
}

it.runIf(enabled)(
  "every source's DOI and PubMed id identify the cited paper, and every link is reachable",
  async () => {
    const sources = getAllSources();
    const problems: string[] = [];

    // 1. Identity, via registries built for automated lookups
    const pubmed = await pubmedRecords(sources.flatMap((s) => (s.pmid ? [s.pmid] : [])));

    for (const source of sources) {
      const checks: Array<{ via: string; title: string; year: number | null }> = [];
      if (source.doi) {
        try {
          await sleep(1_000); // stay well inside Crossref's anonymous rate limit
          checks.push({ via: `doi ${source.doi}`, ...(await crossrefRecord(source.doi)) });
        } catch (error) {
          problems.push(`${source.id}: Crossref lookup failed for ${source.doi} (${String(error)})`);
        }
      }
      if (source.pmid) {
        const record = pubmed.get(source.pmid);
        if (record) checks.push({ via: `pmid ${source.pmid}`, ...record });
        else problems.push(`${source.id}: PubMed has no record for ${source.pmid}`);
      }
      if (!source.doi && !source.pmid) {
        problems.push(`${source.id}: has neither a DOI nor a PubMed id, so it cannot be verified`);
      }

      for (const check of checks) {
        const titleOk = sameTitle(source.title, check.title);
        const yearOk = check.year === null || Math.abs(check.year - source.year) <= 1;
        console.log(
          `${titleOk && yearOk ? "verified" : "MISMATCH"}  ${source.id.padEnd(18)} ${check.via} (${check.year ?? "?"})`
        );
        if (!titleOk) {
          problems.push(`${source.id}: ${check.via} is "${check.title}", not "${source.title}"`);
        }
        if (!yearOk) {
          problems.push(`${source.id}: ${check.via} is dated ${check.year}, registry says ${source.year}`);
        }
      }
    }

    // 2. Reachability of the links people will actually tap
    for (const source of sources) {
      for (const url of [source.url, source.fullTextUrl]) {
        if (!url) continue;
        const result = await reach(url);
        const label = !result.ok ? "FAILED  " : result.blocked ? "blocked " : "reachable";
        console.log(`${label.padEnd(9)} ${String(result.status).padEnd(4)} ${source.id.padEnd(18)} ${url}`);
        if (!result.ok) problems.push(`${source.id}: ${url} is not reachable (${result.status})`);
      }
    }

    expect(problems).toEqual([]);
  },
  15 * 60_000
);
