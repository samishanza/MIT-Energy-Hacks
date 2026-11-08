// A record version split for a cloud database, and joined back exactly.
//
// Each version carries the site's whole observation log up to that point, and every version's log is the start of
// the next one's, so storing the log in every version repeats it (at one test site, 94% of each version). Instead each
// observation is stored once with its place in the log, and each version is stored without the log, with the
// count of observations it held. A version is rebuilt by taking that many observations in log order.
import type { Observation, RecordVersion } from "@eqore/contract";

export type VersionRow = {
  site_id: string;
  version: number;
  created_at: string;
  trigger: string;
  synthetic: boolean;
  observation_count: number;
  data: Omit<RecordVersion, "observations">;
};
export type ObservationRow = { site_id: string; seq: number; id: string; field: string; data: Observation };

export function splitRecord(record: RecordVersion): { version: VersionRow; observations: ObservationRow[] } {
  const { observations, ...rest } = record;
  return {
    version: {
      site_id: record.site.id,
      version: record.version,
      created_at: record.createdAt,
      trigger: record.trigger,
      synthetic: record.synthetic,
      observation_count: observations.length,
      data: rest,
    },
    observations: observations.map((observation, seq) => ({ site_id: record.site.id, seq, id: observation.id, field: observation.field, data: observation })),
  };
}

// `log` is the site's observations in any order; only the first `observation_count` by seq belong to this version.
export function joinRecord(row: VersionRow, log: ObservationRow[]): RecordVersion {
  const ordered = [...log].sort((a, b) => a.seq - b.seq);
  if (ordered.length < row.observation_count) throw new Error(`Version ${row.version} of ${row.site_id} needs ${row.observation_count} observations; ${ordered.length} are stored.`);
  ordered.slice(0, row.observation_count).forEach((entry, index) => {
    if (entry.seq !== index) throw new Error(`Observation ${index} of ${row.site_id} is missing from the stored log.`);
  });
  return { ...row.data, observations: ordered.slice(0, row.observation_count).map((entry) => entry.data) } as RecordVersion;
}

// Adds a version's observations to the log already stored, checking that the stored log is the start of this one,
// as it must be for an append-only log. Returns the rows to insert.
export function newObservations(stored: Pick<ObservationRow, "seq" | "id">[], incoming: ObservationRow[]): ObservationRow[] {
  const byId = new Map(stored.map((entry) => [entry.seq, entry.id]));
  for (const entry of incoming) {
    const held = byId.get(entry.seq);
    if (held !== undefined && held !== entry.id) throw new Error(`Observation ${entry.seq} of ${entry.site_id} is ${held} in the cloud but ${entry.id} here: the logs have diverged.`);
  }
  return incoming.filter((entry) => !byId.has(entry.seq));
}

// JSON with object keys sorted, so a record read back from jsonb (which reorders keys) compares equal to the original.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : inner,
  );
}
