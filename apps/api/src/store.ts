import { DatabaseSync } from "node:sqlite";
import { ObservationSchema, RecordVersionSchema } from "@eqore/contract";
import type { Observation, RecordVersion, Site } from "@eqore/contract";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS observations (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    site_id TEXT NOT NULL,
    field TEXT NOT NULL,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS observations_by_site ON observations (site_id, seq);
  CREATE TABLE IF NOT EXISTS versions (
    site_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    json TEXT NOT NULL,
    PRIMARY KEY (site_id, version)
  );
  CREATE TABLE IF NOT EXISTS evidence_files (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    field TEXT NOT NULL,
    path TEXT NOT NULL,
    content_type TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    size INTEGER NOT NULL,
    uploaded_by TEXT NOT NULL,
    received_at TEXT NOT NULL,
    synthetic INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS capture_links (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    site_id TEXT NOT NULL,
    field TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    uploads_used INTEGER NOT NULL,
    max_uploads INTEGER NOT NULL
  );

  -- The record's evidence and versions are append-only, enforced here as well as in code.
  CREATE TRIGGER IF NOT EXISTS observations_no_update BEFORE UPDATE ON observations
    BEGIN SELECT RAISE(ABORT, 'observations are append-only'); END;
  CREATE TRIGGER IF NOT EXISTS observations_no_delete BEFORE DELETE ON observations
    BEGIN SELECT RAISE(ABORT, 'observations are append-only'); END;
  CREATE TRIGGER IF NOT EXISTS versions_no_update BEFORE UPDATE ON versions
    BEGIN SELECT RAISE(ABORT, 'record versions are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS versions_no_delete BEFORE DELETE ON versions
    BEGIN SELECT RAISE(ABORT, 'record versions are immutable'); END;
`;

export type EvidenceFileRow = {
  id: string;
  siteId: string;
  field: string;
  path: string;
  contentType: string;
  sha256: string;
  size: number;
  uploadedBy: string;
  receivedAt: string;
  synthetic: boolean;
};

export type CaptureLinkRow = {
  id: string;
  tokenHash: string;
  siteId: string;
  field: string;
  expiresAt: string;
  uploadsUsed: number;
  maxUploads: number;
};

type Row = Record<string, string | number | null>;

export class Store {
  readonly db: DatabaseSync;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
  }

  saveSite(site: Site): void {
    this.db.prepare("INSERT INTO sites (id, json) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json").run(site.id, JSON.stringify(site));
  }

  appendObservations(observations: Observation[]): void {
    const insert = this.db.prepare("INSERT INTO observations (id, site_id, field, json) VALUES (?, ?, ?, ?)");
    this.transaction(() => {
      for (const observation of observations) {
        insert.run(observation.id, observation.siteId, observation.field, JSON.stringify(ObservationSchema.parse(observation)));
      }
    });
  }

  // Oldest first, which is the order state is derived in.
  observations(siteId: string): Observation[] {
    const rows = this.db.prepare("SELECT json FROM observations WHERE site_id = ? ORDER BY seq").all(siteId) as Row[];
    return rows.map((row) => JSON.parse(String(row.json)) as Observation);
  }

  latestVersionNumber(siteId: string): number {
    const row = this.db.prepare("SELECT MAX(version) AS latest FROM versions WHERE site_id = ?").get(siteId) as Row;
    return Number(row.latest ?? 0);
  }

  saveVersion(record: RecordVersion): void {
    this.db.prepare("INSERT INTO versions (site_id, version, json) VALUES (?, ?, ?)").run(record.site.id, record.version, JSON.stringify(RecordVersionSchema.parse(record)));
  }

  readVersion(siteId: string, version: number | "latest"): RecordVersion | null {
    const row = (
      version === "latest"
        ? this.db.prepare("SELECT json FROM versions WHERE site_id = ? ORDER BY version DESC LIMIT 1").get(siteId)
        : this.db.prepare("SELECT json FROM versions WHERE site_id = ? AND version = ?").get(siteId, version)
    ) as Row | undefined;
    return row ? (JSON.parse(String(row.json)) as RecordVersion) : null;
  }

  saveEvidenceFile(file: EvidenceFileRow): void {
    this.db
      .prepare("INSERT INTO evidence_files (id, site_id, field, path, content_type, sha256, size, uploaded_by, received_at, synthetic) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(file.id, file.siteId, file.field, file.path, file.contentType, file.sha256, file.size, file.uploadedBy, file.receivedAt, file.synthetic ? 1 : 0);
  }

  evidenceFile(id: string): EvidenceFileRow | null {
    const row = this.db.prepare("SELECT * FROM evidence_files WHERE id = ?").get(id) as Row | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      siteId: String(row.site_id),
      field: String(row.field),
      path: String(row.path),
      contentType: String(row.content_type),
      sha256: String(row.sha256),
      size: Number(row.size),
      uploadedBy: String(row.uploaded_by),
      receivedAt: String(row.received_at),
      synthetic: Number(row.synthetic) === 1,
    };
  }

  saveCaptureLink(link: CaptureLinkRow): void {
    this.db
      .prepare("INSERT INTO capture_links (id, token_hash, site_id, field, expires_at, uploads_used, max_uploads) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(link.id, link.tokenHash, link.siteId, link.field, link.expiresAt, link.uploadsUsed, link.maxUploads);
  }

  captureLinkByTokenHash(tokenHash: string): CaptureLinkRow | null {
    const row = this.db.prepare("SELECT * FROM capture_links WHERE token_hash = ?").get(tokenHash) as Row | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      tokenHash: String(row.token_hash),
      siteId: String(row.site_id),
      field: String(row.field),
      expiresAt: String(row.expires_at),
      uploadsUsed: Number(row.uploads_used),
      maxUploads: Number(row.max_uploads),
    };
  }

  // Counts an upload only while the limit allows it, so concurrent uploads can't pass the limit.
  useCaptureUpload(linkId: string): boolean {
    const result = this.db.prepare("UPDATE capture_links SET uploads_used = uploads_used + 1 WHERE id = ? AND uploads_used < max_uploads").run(linkId);
    return Number(result.changes) === 1;
  }

  transaction(work: () => void): void {
    this.db.exec("BEGIN");
    try {
      work();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}
