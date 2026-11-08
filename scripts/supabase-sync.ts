// Copies site records from the running API into Supabase, then checks each site's latest version reads back exactly.
// Safe to run again: it adds only versions and observations the cloud doesn't hold.
//
// Usage (from the checkout whose .env holds SUPABASE_URL and SUPABASE_SECRET_KEY):
//   node --env-file=.env scripts/supabase-sync.ts [--latest-only] [site-id ...]
// With no site ids, it copies the example sites. --latest-only copies each site's latest version and its full
// observation log, without the earlier versions. SOURCE_API sets the API to read from (default http://127.0.0.1:8787).
import type { RecordVersion } from "@eqore/contract";
import { canonicalJson, newObservations, splitRecord, type ObservationRow } from "../apps/api/src/cloud-record.ts";

const EXAMPLE_SITES = [
  "79-lowland-st-holliston-ma",
  "71-mckeon-rd-worcester-ma",
  "26-albany-st-worcester-ma",
  "76-east-worcester-st-worcester-ma",
  "100-research-dr-worcester-ma",
];
const OBSERVATIONS_PER_REQUEST = 300;
const ROWS_PER_PAGE = 1000;

const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env (Supabase dashboard: Project Settings, API Keys).");
  process.exit(1);
}
const sourceApi = (process.env.SOURCE_API ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
const args = process.argv.slice(2);
const latestOnly = args.includes("--latest-only");
const named = args.filter((arg) => !arg.startsWith("--"));
const sites = named.length ? named : EXAMPLE_SITES;

// New secret keys (sb_secret_...) go in the apikey header only; a legacy service_role JWT also goes in Authorization.
const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json", ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) };

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
  if (!response.ok) throw new Error(`Supabase ${init.method ?? "GET"} ${path.split("?")[0]}: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
  return response;
}
const insert = (table: string, rows: unknown[], prefer = "return=minimal") => rest(table, { method: "POST", body: JSON.stringify(rows), headers: { Prefer: prefer } });

// Every row of a filtered select, a page at a time (the API returns at most 1000 rows per request).
async function selectAll<T>(table: string, query: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += ROWS_PER_PAGE) {
    const page = (await (await rest(`${table}?${query}&limit=${ROWS_PER_PAGE}&offset=${offset}`)).json()) as T[];
    rows.push(...page);
    if (page.length < ROWS_PER_PAGE) return rows;
  }
}

async function readVersion(siteId: string, version: number | "latest"): Promise<RecordVersion> {
  const response = await fetch(`${sourceApi}/api/sites/${encodeURIComponent(siteId)}/versions/${version}`);
  if (!response.ok) throw new Error(`The API has no version ${version} of ${siteId} (HTTP ${response.status}).`);
  const body = (await response.json()) as RecordVersion | { record: RecordVersion };
  return "record" in body ? body.record : body;
}

let failed = false;
for (const siteId of sites) {
  try {
    const latest = await readVersion(siteId, "latest");
    const storedObservations = await selectAll<Pick<ObservationRow, "seq" | "id">>("observations", `site_id=eq.${encodeURIComponent(siteId)}&select=seq,id`);
    const storedVersions = new Set((await selectAll<{ version: number }>("site_versions", `site_id=eq.${encodeURIComponent(siteId)}&select=version`)).map((row) => row.version));

    await insert("sites?on_conflict=id", [{ id: siteId, address: latest.site.address, latest_version: latest.version, synthetic: latest.synthetic, updated_at: new Date().toISOString(), site: latest.site }], "resolution=merge-duplicates,return=minimal");

    // The latest version's log holds every observation; each earlier version's log must be its start.
    const log = splitRecord(latest).observations;
    const adding = newObservations(storedObservations, log);
    for (let i = 0; i < adding.length; i += OBSERVATIONS_PER_REQUEST) await insert("observations", adding.slice(i, i + OBSERVATIONS_PER_REQUEST));

    let added = 0;
    for (let version = latestOnly ? latest.version : 1; version <= latest.version; version++) {
      if (storedVersions.has(version)) continue;
      const record = version === latest.version ? latest : await readVersion(siteId, version);
      const split = splitRecord(record);
      newObservations(log, split.observations); // throws if this version's log isn't the start of the latest's
      await insert("site_versions", [split.version]);
      added++;
    }

    const readBack = (await (await rest("rpc/site_record", { method: "POST", body: JSON.stringify({ p_site_id: siteId }) })).json()) as RecordVersion;
    const same = canonicalJson(readBack) === canonicalJson(latest);
    if (!same) failed = true;
    console.log(`${siteId}: ${added} version${added === 1 ? "" : "s"} and ${adding.length} observation${adding.length === 1 ? "" : "s"} added; latest is v${latest.version}; read back ${same ? "matches" : "DOES NOT MATCH"} the API.`);
  } catch (error) {
    failed = true;
    console.error(`${siteId}: ${(error as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);
