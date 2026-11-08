// The customer document portal: one link per site where the facility's contact uploads the documents the battery
// project needs (a utility bill, the main switchboard's label, the transformer's nameplate, electrical drawings),
// sees what is still needed, and nothing else of the record.
//
// Each upload is checked by its bytes, stored as evidence, and read by Claude into drafts of the fields its kind
// covers, through the same path as the phone capture links. A draft is inferred until an engineer verifies it, and a
// field a person already verified is never re-read. The link is a hashed token with an expiry and an upload limit,
// served only on the capture listener, the one a tunnel may reach.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Observation, RecordVersion } from "@eqore/contract";
import { ObservationSchema } from "@eqore/contract";
import { fieldDefinition, sha256 } from "@eqore/sources";
import { MAX_FILE_BYTES, MAX_IMAGE_BYTES, draftObservations, fileTooLarge, imageSize, sniffType, type CaptureDeps, type EvidenceFile } from "./capture.ts";
import { EXTRACTION_FIELDS, type Extraction } from "./extract.ts";
import { ApiFailure, latestOrFail, nextVersion } from "./run.ts";

export const PORTAL_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;
export const PORTAL_MAX_UPLOADS = 30;

// What a customer can send, in the order the page asks for it. `fields` are the values Claude drafts from the file;
// `on_file` is the document field the upload itself answers.
export const DOCUMENT_KINDS = [
  { kind: "utility_bill", label: "A recent electric bill", hint: "A photo or PDF of a full bill, all pages. It shows the account, the meter, and the peak demand.", fields: ["serving_utility", "account_number", "meter_number", "peak_demand_kw"], primary: "account_number" },
  { kind: "switchgear_label", label: "The main switchboard's label", hint: "A clear photo of the label on the main switchboard or main breaker. Don't open any panel; photograph only what's on the outside.", fields: ["main_device_rating", "service_voltage", "bus_rating", "kaic_rating", "switchgear_make_model"], primary: "main_device_rating" },
  { kind: "transformer_nameplate", label: "The utility transformer's nameplate", hint: "A photo of the kVA rating on the transformer's nameplate or cabinet, taken from a safe distance. Never open the cabinet.", fields: ["transformer_kva"], primary: "transformer_kva" },
  { kind: "electrical_drawings", label: "Electrical drawings or a one-line diagram", hint: "PDF drawings of the building's electrical service, if you have them: a one-line diagram, an electrical site plan, or panel schedules.", fields: ["service_voltage", "main_device_rating", "bus_rating", "kaic_rating", "transformer_kva", "switchgear_make_model"], primary: "one_line_diagram", onFile: "one_line_diagram" },
  { kind: "other", label: "Anything else about the site", hint: "Site plans, permits, photos of the electrical room or the area where a battery could go.", fields: [], primary: "site_documentation", onFile: "site_documentation" },
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]["kind"];

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS portal_links (
    id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, site_id TEXT NOT NULL, created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL, uploads_used INTEGER NOT NULL, max_uploads INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS portal_uploads (
    id TEXT PRIMARY KEY, link_id TEXT NOT NULL, site_id TEXT NOT NULL, kind TEXT NOT NULL, evidence_file_id TEXT NOT NULL,
    file_name TEXT NOT NULL, received_at TEXT NOT NULL, state TEXT NOT NULL
  );
`;
type Row = Record<string, string | number | null>;
type LinkRow = { id: string; siteId: string; expiresAt: string; uploadsUsed: number; maxUploads: number };

function db(deps: CaptureDeps) {
  deps.store.db.exec(SCHEMA);
  return deps.store.db;
}

export function createPortalLink(deps: CaptureDeps, siteId: string): { url: string; expiresAt: string; maxUploads: number } {
  latestOrFail(deps, siteId);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.parse(deps.now()) + PORTAL_LIFETIME_MS).toISOString();
  db(deps).prepare("INSERT INTO portal_links (id, token_hash, site_id, created_at, expires_at, uploads_used, max_uploads) VALUES (?, ?, ?, ?, ?, 0, ?)")
    .run(randomUUID(), sha256(token), siteId, deps.now(), expiresAt, PORTAL_MAX_UPLOADS);
  return { url: `${deps.capturePublicUrl.replace(/\/$/, "")}/portal/${token}`, expiresAt, maxUploads: PORTAL_MAX_UPLOADS };
}

// Checks a token before anything is read, stored, or sent to a model.
export function openPortal(deps: CaptureDeps, token: string): LinkRow {
  const row = db(deps).prepare("SELECT * FROM portal_links WHERE token_hash = ?").get(sha256(token)) as Row | undefined;
  if (!row) throw new ApiFailure("invalid_token", 404, "This link isn't active.");
  if (Date.parse(deps.now()) > Date.parse(String(row.expires_at))) throw new ApiFailure("token_expired", 410, "This link has expired.");
  return { id: String(row.id), siteId: String(row.site_id), expiresAt: String(row.expires_at), uploadsUsed: Number(row.uploads_used), maxUploads: Number(row.max_uploads) };
}

// What each kind still needs, in words a customer reads: no values, sources, or engineering data.
const status = (record: RecordVersion, fields: readonly string[], onFile?: string): "needed" | "received" | "confirmed" => {
  const states = [...fields, ...(onFile ? [onFile] : [])].map((field) => record.values.find((v) => v.field === field)?.state ?? "missing");
  if (states.length && states.every((s) => s === "verified")) return "confirmed";
  return states.some((s) => s === "inferred" || s === "verified" || s === "conflicting") ? "received" : "needed";
};

export function readPortal(deps: CaptureDeps, token: string) {
  const link = openPortal(deps, token);
  const record = latestOrFail(deps, link.siteId);
  const uploads = (db(deps).prepare("SELECT kind, file_name, received_at, state FROM portal_uploads WHERE link_id = ? ORDER BY received_at").all(link.id) as Row[])
    .map((row) => ({ kind: String(row.kind), fileName: String(row.file_name), receivedAt: String(row.received_at), state: String(row.state) }));
  return {
    address: record.site.address,
    expiresAt: link.expiresAt,
    uploadsLeft: Math.max(0, link.maxUploads - link.uploadsUsed),
    documents: DOCUMENT_KINDS.map((d) => ({ kind: d.kind, label: d.label, hint: d.hint, status: d.kind === "other" ? (uploads.some((u) => u.kind === "other") ? "received" : "optional") : status(record, d.fields, "onFile" in d ? d.onFile : undefined) })),
    uploads,
  };
}

// Counts an upload only while the limit allows it, so concurrent uploads can't pass it.
function useUpload(deps: CaptureDeps, linkId: string): boolean {
  return Number(db(deps).prepare("UPDATE portal_links SET uploads_used = uploads_used + 1 WHERE id = ? AND uploads_used < max_uploads").run(linkId).changes) === 1;
}

const cleanName = (name: string) => name.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "file";

export async function submitPortal(deps: CaptureDeps, token: string, form: Record<string, unknown>) {
  const link = openPortal(deps, token);
  const spec = DOCUMENT_KINDS.find((d) => d.kind === form.kind);
  if (!spec) throw new ApiFailure("not_found", 404, `Choose what the file is: ${DOCUMENT_KINDS.map((d) => d.kind).join(", ")}.`);
  const file = form.file instanceof File ? form.file : null;
  if (!file) throw new ApiFailure("file_type", 415, "Send a JPEG, PNG, or PDF file.");
  if (file.size > MAX_FILE_BYTES) throw fileTooLarge();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffType(bytes);
  if (!type) throw new ApiFailure("file_type", 415, "Send a JPEG, PNG, or PDF file.");
  if (type.contentType !== "application/pdf" && file.size > MAX_IMAGE_BYTES) throw fileTooLarge(MAX_IMAGE_BYTES);
  if (!useUpload(deps, link.id)) throw new ApiFailure("upload_limit", 429, "This link has reached its upload limit.");

  const siteId = link.siteId;
  const latest = latestOrFail(deps, siteId);
  const now = deps.now();
  const hash = sha256(bytes);
  const evidence: EvidenceFile = { id: randomUUID(), hash, uploadedBy: "the customer, through the document portal", synthetic: deps.evidenceManifest?.get(hash)?.synthetic ?? false };
  mkdirSync(deps.uploadDir, { recursive: true });
  const path = join(deps.uploadDir, `${evidence.id}${type.extension}`);
  writeFileSync(path, bytes, { flag: "wx" });
  deps.store.saveEvidenceFile({ id: evidence.id, siteId, field: spec.primary, path, contentType: type.contentType, sha256: hash, size: bytes.length, uploadedBy: evidence.uploadedBy, receivedAt: now, synthetic: evidence.synthetic });

  // Only fields no person has verified are read, so an upload can't reopen a confirmed value.
  const verified = (field: string) => latest.values.find((v) => v.field === field)?.state === "verified";
  const fields = EXTRACTION_FIELDS.filter((f) => (spec.fields as readonly string[]).includes(f.field) && !verified(f.field));
  const observations: Observation[] = [];
  let state = "stored";
  if (fields.length) {
    const manifest = deps.evidenceManifest?.get(hash);
    const extraction: Extraction = deps.snapshot
      ? manifest?.draft ? { kind: "readings", readings: manifest.draft } : { kind: "failed", reason: "Snapshot mode makes no model call." }
      : await deps.extractor({ bytes, contentType: type.contentType, fields });
    // The primary field gets a no-reading note when nothing in the file answers it; for drawings that is the document itself.
    const primary = fields.some((f) => f.field === spec.primary) ? spec.primary : fields[0]!.field;
    observations.push(...draftObservations(evidence, siteId, extraction, fields, primary, now, imageSize(bytes, type.contentType)));
    state = extraction.kind === "readings" ? (observations.some((o) => o.kind === "reading") ? "read" : "unreadable") : extraction.kind === "failed" ? "read_failed" : "unreadable";
  }
  // A drawing or site document answers its own document field: the customer says they provided it, nothing more.
  if ("onFile" in spec && !verified(spec.onFile)) {
    const query = `portal ${hash.slice(0, 16)}`;
    observations.push(ObservationSchema.parse({
      id: randomUUID(), siteId, field: spec.onFile, kind: "reading",
      value: { type: "text", value: `Provided by the customer: ${cleanName(file.name)}` },
      source: { id: "customer-portal", name: "Customer document portal", kind: "human_evidence", dataOrigin: evidence.synthetic ? "synthetic" : "real" },
      retrievedAt: now, sourceDate: null, method: "source_read",
      locator: { query, evidenceFileId: evidence.id },
      identity: { sourceId: "customer-portal", query, contentHash: sha256(JSON.stringify([spec.onFile, hash])) },
      grade: fieldDefinition(spec.onFile)?.grade, reason: "Uploaded by the customer; an engineer reviews whether it is the document needed.",
      synthetic: evidence.synthetic,
    }));
  }
  if (observations.length) deps.store.appendObservations(observations);
  db(deps).prepare("INSERT INTO portal_uploads (id, link_id, site_id, kind, evidence_file_id, file_name, received_at, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), link.id, siteId, spec.kind, evidence.id, cleanName(file.name), now, state);
  // The model call can take a while, so the version builds on whatever the record holds now.
  nextVersion(deps, latestOrFail(deps, siteId), "capture");
  return { received: true, kind: spec.kind, state };
}

// For the engineer: everything uploaded through any portal link for the site.
export function portalUploads(deps: CaptureDeps, siteId: string) {
  return (db(deps).prepare("SELECT kind, evidence_file_id, file_name, received_at, state FROM portal_uploads WHERE site_id = ? ORDER BY received_at").all(siteId) as Row[])
    .map((row) => ({ kind: String(row.kind), evidenceFileId: String(row.evidence_file_id), fileName: String(row.file_name), receivedAt: String(row.received_at), state: String(row.state) }));
}
