// Supabase as the system of record, with the local SQLite store as the working copy.
//
// The API's handlers stay synchronous against SQLite. At startup the mirror reconciles every site both ways: a site
// the cloud holds more of is pulled into SQLite, and a site SQLite holds more of is pushed. After that, each version
// the API saves is pushed in the background. Observation logs and versions are append-only on both sides, so
// reconciling is adding what one side lacks; a log that differs from the other side's at the same place is reported
// and left alone, never overwritten.
import type { RecordVersion, Site } from "@eqore/contract";
import { joinRecord, splitRecord, type ObservationRow, type VersionRow } from "./cloud-record.ts";
import type { Store } from "./store.ts";

export type CloudConfig = { url: string; key: string; fetch?: typeof fetch; log?: (line: string) => void };

const OBSERVATIONS_PER_REQUEST = 300;
const ROWS_PER_PAGE = 1000;

// The settings from the environment, or null when the cloud isn't configured. A legacy service_role key is accepted
// under its own name.
export function cloudConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CloudConfig | null {
  const url = env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = (env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  return url && key ? { url, key } : null;
}

export class CloudClient {
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(config: CloudConfig) {
    this.url = config.url;
    this.fetchImpl = config.fetch ?? globalThis.fetch;
    // A new secret key (sb_secret_...) goes in the apikey header only; a legacy JWT also goes in Authorization.
    this.headers = { apikey: config.key, "Content-Type": "application/json", ...(config.key.startsWith("eyJ") ? { Authorization: `Bearer ${config.key}` } : {}) };
  }

  private async rest(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.fetchImpl(`${this.url}/rest/v1/${path}`, { ...init, headers: { ...this.headers, ...(init.headers as Record<string, string> | undefined) } });
    if (!response.ok) throw new Error(`Supabase ${init.method ?? "GET"} ${path.split("?")[0]}: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
    return response;
  }

  private async selectAll<T>(table: string, query: string): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += ROWS_PER_PAGE) {
      const page = (await (await this.rest(`${table}?${query}&limit=${ROWS_PER_PAGE}&offset=${offset}`)).json()) as T[];
      rows.push(...page);
      if (page.length < ROWS_PER_PAGE) return rows;
    }
  }

  private insert(table: string, rows: unknown[], prefer = "return=minimal") {
    return this.rest(table, { method: "POST", body: JSON.stringify(rows), headers: { Prefer: prefer } });
  }

  siteIds(): Promise<string[]> {
    return this.selectAll<{ id: string }>("sites", "select=id&order=id").then((rows) => rows.map((row) => row.id));
  }
  observationIds(siteId: string): Promise<Pick<ObservationRow, "seq" | "id">[]> {
    return this.selectAll("observations", `site_id=eq.${encodeURIComponent(siteId)}&select=seq,id&order=seq`);
  }
  observations(siteId: string, fromSeq: number): Promise<ObservationRow[]> {
    return this.selectAll("observations", `site_id=eq.${encodeURIComponent(siteId)}&seq=gte.${fromSeq}&order=seq`);
  }
  versionNumbers(siteId: string): Promise<number[]> {
    return this.selectAll<{ version: number }>("site_versions", `site_id=eq.${encodeURIComponent(siteId)}&select=version&order=version`).then((rows) => rows.map((row) => row.version));
  }
  versions(siteId: string, numbers: number[]): Promise<VersionRow[]> {
    return numbers.length ? this.selectAll("site_versions", `site_id=eq.${encodeURIComponent(siteId)}&version=in.(${numbers.join(",")})&order=version`) : Promise.resolve([]);
  }
  async record(siteId: string, version?: number): Promise<RecordVersion | null> {
    const body = await (await this.rest("rpc/site_record", { method: "POST", body: JSON.stringify({ p_site_id: siteId, ...(version ? { p_version: version } : {}) }) })).json();
    return (body as RecordVersion | null) ?? null;
  }
  saveSite(site: Site, latest: RecordVersion) {
    return this.insert("sites?on_conflict=id", [{ id: site.id, address: site.address, latest_version: latest.version, synthetic: latest.synthetic, updated_at: new Date().toISOString(), site }], "resolution=merge-duplicates,return=minimal");
  }
  async addObservations(rows: ObservationRow[]) {
    for (let i = 0; i < rows.length; i += OBSERVATIONS_PER_REQUEST) await this.insert("observations", rows.slice(i, i + OBSERVATIONS_PER_REQUEST));
  }
  addVersion(row: VersionRow) {
    return this.insert("site_versions", [row]);
  }
}

// What each side lacks, from the two observation logs (ids in log order) and version lists. Null when the logs
// differ at a place both hold, which only a person should sort out.
export type Plan = { pullFrom: number; pushFrom: number; pullVersions: number[]; pushVersions: number[] };
export function reconcile(localLog: string[], localVersions: number[], cloudLog: string[], cloudVersions: number[]): Plan | null {
  const shared = Math.min(localLog.length, cloudLog.length);
  for (let i = 0; i < shared; i++) if (localLog[i] !== cloudLog[i]) return null;
  const local = new Set(localVersions), cloud = new Set(cloudVersions);
  return {
    // Pull the cloud's log from where the local log ends, and push the local log from where the cloud's ends.
    pullFrom: localLog.length,
    pushFrom: cloudLog.length,
    pullVersions: cloudVersions.filter((v) => !local.has(v)),
    pushVersions: localVersions.filter((v) => !cloud.has(v)),
  };
}

export class CloudMirror {
  readonly client: CloudClient;
  private readonly log: (line: string) => void;
  private queue: Promise<void> = Promise.resolve();
  private pulling = false;

  constructor(config: CloudConfig) {
    this.client = new CloudClient(config);
    this.log = config.log ?? ((line) => console.log(line));
  }

  // Reconciles every site either side holds. A failure on one site is logged and the rest continue.
  async reconcileAll(store: Store): Promise<void> {
    const ids = [...new Set([...store.siteIds(), ...(await this.client.siteIds())])].sort();
    for (const id of ids) {
      try {
        await this.reconcileSite(store, id);
      } catch (error) {
        this.log(`Cloud: ${id} not reconciled: ${(error as Error).message}`);
      }
    }
  }

  async reconcileSite(store: Store, siteId: string): Promise<void> {
    const localLog = store.observations(siteId);
    const localVersions = store.versionNumbers(siteId);
    const cloudLog = await this.client.observationIds(siteId);
    const cloudVersions = await this.client.versionNumbers(siteId);
    const plan = reconcile(localLog.map((o) => o.id), localVersions, cloudLog.map((o) => o.id), cloudVersions);
    if (!plan) {
      this.log(`Cloud: ${siteId} has a different observation log here than in the cloud; left as is on both sides.`);
      return;
    }
    if (plan.pullVersions.length || plan.pullFrom < cloudLog.length) {
      const rows = await this.client.observations(siteId, plan.pullFrom);
      const versions = await this.client.versions(siteId, plan.pullVersions);
      const fullLog = [...localLog.map((data, seq) => ({ site_id: siteId, seq, id: data.id, field: data.field, data })), ...rows];
      this.pulling = true;
      try {
        // Observations first, so a version is never saved before the log it refers to.
        if (rows.length) store.appendObservations(rows.map((row) => row.data));
        for (const row of versions) store.saveVersion(joinRecord(row, fullLog));
        const latest = store.readVersion(siteId, "latest");
        if (latest) store.saveSite(latest.site);
      } finally {
        this.pulling = false;
      }
      this.log(`Cloud: pulled ${rows.length} observations and ${versions.length} versions of ${siteId}.`);
    }
    if (plan.pushVersions.length || plan.pushFrom < localLog.length) await this.push(store, siteId, cloudLog.length, plan.pushVersions);
  }

  private async push(store: Store, siteId: string, cloudLogLength: number, versions: number[]): Promise<void> {
    const latest = store.readVersion(siteId, "latest");
    if (!latest) return;
    await this.client.saveSite(latest.site, latest);
    const log = store.observations(siteId);
    await this.client.addObservations(log.slice(cloudLogLength).map((data, i) => ({ site_id: siteId, seq: cloudLogLength + i, id: data.id, field: data.field, data })));
    for (const version of versions) {
      const record = store.readVersion(siteId, version);
      if (record) await this.client.addVersion(splitRecord(record).version);
    }
    this.log(`Cloud: pushed ${log.length - cloudLogLength} observations and ${versions.length} versions of ${siteId}.`);
  }

  // Called after the API saves a version: pushes the site in the background, one site at a time, in save order.
  versionSaved(store: Store, record: RecordVersion): void {
    if (this.pulling) return;
    const siteId = record.site.id;
    this.queue = this.queue
      .then(() => this.reconcileSite(store, siteId))
      .catch((error) => this.log(`Cloud: ${siteId} v${record.version} not pushed yet: ${(error as Error).message}. It is pushed at the next save or restart.`));
  }

  // Resolves once every queued push has finished, for tests and shutdown.
  settled(): Promise<void> {
    return this.queue;
  }
}
