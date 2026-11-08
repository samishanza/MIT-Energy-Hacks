import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { booleanPointInPolygon, pointToPolygonDistance } from "@turf/turf";
import { CaptureLinkSchema, CaptureMetadataSchema, CaptureRequestSchema, CaptureResultSchema, DOORS_CLOSED_SAFETY_TEXT, ObservationSchema } from "@eqore/contract";
import type { CaptureLink, CaptureMetadata, CaptureRequest, CaptureResult, Observation, ObservedValue, RecordVersion, Source } from "@eqore/contract";
import { fieldDefinition, sha256 } from "@eqore/sources";
import { EXTRACTION_FIELDS, type DraftReading, type Extraction, type ExtractionField, type ExtractionRequest, type Extractor } from "./extract.ts";
import { EVIDENCE_REQUESTS, offersCaptureLink, type EvidenceRequest } from "./requests.ts";
import { ApiFailure, latestOrFail, nextVersion, withPin, type ApiDeps } from "./run.ts";
import type { CaptureLinkRow } from "./store.ts";

export const LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const MAX_UPLOADS = 5;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
// The Claude API takes at most 10 MB of base64 per image, which is about 7.5 MB of file.
export const MAX_IMAGE_BYTES = 7.5 * 1024 * 1024;

const STANDARD_AMPS = new Set([100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000, 5000, 6000]);

export type EvidenceManifestEntry = {
  sha256: string;
  label: string;
  synthetic: boolean;
  // A recorded draft, replayed in snapshot mode so the demo runs with no model call.
  draft?: DraftReading[];
};

export type CaptureDeps = ApiDeps & {
  uploadDir: string;
  capturePublicUrl: string;
  extractor: Extractor;
  evidenceManifest?: Map<string, EvidenceManifestEntry>;
};

export function loadEvidenceManifest(path: string): Map<string, EvidenceManifestEntry> {
  if (!existsSync(path)) return new Map();
  const entries = JSON.parse(readFileSync(path, "utf8")) as EvidenceManifestEntry[];
  return new Map(entries.map((entry) => [entry.sha256, entry]));
}

function requestFor(field: string): EvidenceRequest | undefined {
  return EVIDENCE_REQUESTS.find((request) => request.fields.includes(field) && offersCaptureLink(request.route));
}

function fieldsToExtract(request: EvidenceRequest): ExtractionField[] {
  const names = [...request.fields, ...(request.alsoExtract ?? [])];
  return EXTRACTION_FIELDS.filter((field) => names.includes(field.field));
}

function isVerified(record: RecordVersion, field: string): boolean {
  return record.values.find((value) => value.field === field)?.state === "verified";
}

export function fileTooLarge(limitBytes = MAX_FILE_BYTES): ApiFailure {
  return new ApiFailure("file_too_large", 413, `The file is over the ${limitBytes / (1024 * 1024)} MB limit.`);
}

export function createCaptureLink(deps: CaptureDeps, siteId: string, body: unknown): CaptureLink {
  const latest = latestOrFail(deps, siteId);
  const field = (body as { field?: unknown } | null)?.field;
  if (typeof field !== "string" || !fieldDefinition(field)) throw new ApiFailure("not_found", 404, `No field ${String(field)}`);
  // Facts inside equipment are for a qualified person, and are never asked of facility staff.
  if (!requestFor(field)) throw new ApiFailure("illegal_transition", 409, `No capture link can be offered for ${field}. It needs a person or a document instead.`);
  if (isVerified(latest, field)) throw new ApiFailure("illegal_transition", 409, `${field} is already verified.`);

  // Only the hash is stored, so a copy of the database can't be used to open the link.
  const token = randomBytes(32).toString("base64url");
  const row: CaptureLinkRow = {
    id: randomUUID(),
    tokenHash: sha256(token),
    siteId,
    field,
    expiresAt: new Date(Date.parse(deps.now()) + LINK_LIFETIME_MS).toISOString(),
    uploadsUsed: 0,
    maxUploads: MAX_UPLOADS,
  };
  deps.store.saveCaptureLink(row);
  return CaptureLinkSchema.parse({
    id: row.id,
    siteId,
    field,
    url: `${deps.capturePublicUrl.replace(/\/$/, "")}/capture/${token}`,
    status: "open",
    expiresAt: row.expiresAt,
    uploadsUsed: 0,
    maxUploads: MAX_UPLOADS,
  });
}

// Checks a token before anything is stored or any model is called.
export function openLink(deps: CaptureDeps, token: string): { link: CaptureLinkRow; latest: RecordVersion } {
  const link = deps.store.captureLinkByTokenHash(sha256(token));
  if (!link) throw new ApiFailure("invalid_token", 404, "This link isn't active.");
  if (Date.parse(deps.now()) > Date.parse(link.expiresAt)) throw new ApiFailure("token_expired", 410, "This link has expired.");
  const latest = latestOrFail(deps, link.siteId);
  if (isVerified(latest, link.field)) throw new ApiFailure("token_closed", 410, "This request has been answered.");
  if (link.uploadsUsed >= link.maxUploads) throw new ApiFailure("upload_limit", 429, "This link has reached its upload limit.");
  return { link, latest };
}

export function readCaptureRequest(deps: CaptureDeps, token: string): CaptureRequest {
  const { link, latest } = openLink(deps, token);
  const request = requestFor(link.field)!;
  const pin = latest.features.find((feature) => feature.field === link.field && feature.geometry.type === "Point")?.geometry;
  const position = pin?.type === "Point" ? pin.coordinates : latest.site.location;
  return CaptureRequestSchema.parse({
    field: link.field,
    label: fieldDefinition(link.field)!.label,
    question: request.question,
    accepts: request.route === "capture_bill" ? "bill" : "photo",
    safetyText: DOORS_CLOSED_SAFETY_TEXT,
    aerial: latest.baseMap && position ? { ...latest.baseMap, center: position } : latest.baseMap,
    pin: position,
    synthetic: latest.synthetic,
  });
}

export type AcceptedType = { contentType: ExtractionRequest["contentType"]; extension: string };

export function sniffType(bytes: Uint8Array): AcceptedType | null {
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  if (starts(0xff, 0xd8, 0xff)) return { contentType: "image/jpeg", extension: ".jpg" };
  if (starts(0x89, 0x50, 0x4e, 0x47)) return { contentType: "image/png", extension: ".png" };
  if (starts(0x25, 0x50, 0x44, 0x46)) return { contentType: "application/pdf", extension: ".pdf" };
  return null;
}

function metadataFrom(form: Record<string, unknown>): CaptureMetadata {
  const number = (key: string) => {
    const raw = form[key];
    return typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
  };
  const parsed = CaptureMetadataSchema.safeParse({
    latitude: number("latitude"),
    longitude: number("longitude"),
    accuracyMeters: number("accuracyMeters"),
    headingDegrees: number("headingDegrees"),
  });
  // Bad position data never blocks a photo. The engineer places the pin instead.
  return parsed.success ? parsed.data : {};
}

type PositionCheck = { status: CaptureResult["positionStatus"]; flag?: string };

function checkPosition(metadata: CaptureMetadata, latest: RecordVersion): PositionCheck {
  const { latitude, longitude, accuracyMeters = 0 } = metadata;
  if (latitude === undefined || longitude === undefined) return { status: "needs_pin" };
  const parcel = latest.features.find((feature) => feature.kind === "property_line")?.geometry;
  if (parcel?.type !== "Polygon" && parcel?.type !== "MultiPolygon") return { status: "placed" };
  const point = [longitude, latitude];
  if (booleanPointInPolygon(point, parcel)) return { status: "placed" };
  const meters = pointToPolygonDistance(point, { type: "Feature", properties: {}, geometry: parcel }, { units: "meters" });
  if (meters <= accuracyMeters) return { status: "placed" };
  return {
    status: "outside_parcel",
    flag: `The phone's position is about ${Math.round(meters)} m outside the parcel, beyond its stated accuracy of ${Math.round(accuracyMeters)} m, so it wasn't placed on the map. Place the pin by hand.`,
  };
}

const UNIT_NAMES: Record<string, string> = { a: "A", amp: "A", amps: "A", ampere: "A", amperes: "A", kw: "kW", ka: "kA", kaic: "kA", kva: "kVA" };

function normalizeUnit(unit: string | null): string | null {
  if (!unit) return null;
  return UNIT_NAMES[unit.trim().toLowerCase()] ?? unit.trim();
}

type ImageSize = { width: number; height: number };

// Read from the file's header, so a region can be stored in the original image's pixels.
export function imageSize(bytes: Uint8Array, contentType: AcceptedType["contentType"]): ImageSize | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (contentType === "image/png") {
    return bytes.length >= 24 ? { width: view.getUint32(16), height: view.getUint32(20) } : null;
  }
  if (contentType !== "image/jpeg") return null;
  let offset = 2;
  while (offset + 9 < bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1]!;
    const isFrameHeader = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader) return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
}

// The model reports a region as fractions, because it may read a downscaled copy of the image.
function pixelRegion(region: DraftReading["region"], size: ImageSize | null) {
  if (!region || !size) return undefined;
  return {
    x: Math.round(region.x * size.width),
    y: Math.round(region.y * size.height),
    width: Math.round(region.width * size.width),
    height: Math.round(region.height * size.height),
  };
}

type Interpreted = { kind: "reading"; value: ObservedValue; flag?: string } | { kind: "unreadable"; reason: string };

function interpret(reading: DraftReading, spec: ExtractionField): Interpreted {
  if (!reading.readable) return { kind: "unreadable", reason: reading.note || "The file doesn't show this legibly." };
  if (spec.type === "text") {
    return reading.text?.trim() ? { kind: "reading", value: { type: "text", value: reading.text.trim() } } : { kind: "unreadable", reason: "The draft gave no text for this field." };
  }
  if (reading.number === null) return { kind: "unreadable", reason: "The draft gave no number for this field." };
  const unit = normalizeUnit(reading.unit);
  // No conversion: a kWh figure over 15 minutes isn't a kW value unless a person decides it is.
  if (unit !== spec.unit) {
    return { kind: "unreadable", reason: `The file shows ${reading.number} ${unit ?? "with no unit"}, and this field is in ${spec.unit}. It wasn't converted or stored as ${spec.unit}.` };
  }
  const offStandard = spec.unit === "A" && !STANDARD_AMPS.has(reading.number);
  return {
    kind: "reading",
    value: { type: "quantity", value: reading.number, unit },
    ...(offStandard ? { flag: `${reading.number} A isn't a common device size. Compare it closely with the photo.` } : {}),
  };
}

export type EvidenceFile = { id: string; hash: string; uploadedBy: string; synthetic: boolean };

export function draftObservations(file: EvidenceFile, siteId: string, extraction: Extraction, fields: ExtractionField[], primary: string, now: string, size: ImageSize | null, positionFlag?: string): Observation[] {
  const source: Source = {
    id: "capture-draft",
    name: `Claude draft from a file uploaded by ${file.uploadedBy}`,
    kind: "human_evidence",
    dataOrigin: file.synthetic ? "synthetic" : "real",
  };
  const make = (field: string, kind: Observation["kind"], value: ObservedValue | null, extra: { reason?: string; reading?: DraftReading; grade?: Observation["grade"] }) => {
    const query = `file ${file.hash.slice(0, 16)}`;
    const imageRegion = pixelRegion(extra.reading?.region ?? null, size);
    return ObservationSchema.parse({
      id: randomUUID(),
      siteId,
      field,
      kind,
      value,
      source,
      retrievedAt: now,
      sourceDate: null,
      method: "model_draft",
      locator: {
        query,
        evidenceFileId: file.id,
        ...(imageRegion ? { imageRegion } : {}),
        ...(extra.reading?.page ? { page: extra.reading.page } : {}),
      },
      identity: { sourceId: source.id, query, contentHash: sha256(JSON.stringify([field, kind, value, extra.reason])) },
      grade: extra.grade,
      reason: extra.reason,
      synthetic: file.synthetic,
    });
  };

  if (extraction.kind === "failed") return [make(primary, "failed_extraction", null, { reason: extraction.reason })];
  if (extraction.kind === "unreadable") return [make(primary, "unreadable", null, { reason: extraction.reason })];

  return fields.flatMap((spec) => {
    // A bill can show more than one meter. Each reading is kept, and different values become a conflict.
    const readings = extraction.readings.filter((entry) => entry.field === spec.field);
    if (readings.length === 0) {
      return spec.field === primary ? [make(spec.field, "unreadable", null, { reason: "The draft didn't report this field." })] : [];
    }
    return readings.map((reading) => {
      const interpreted = interpret(reading, spec);
      if (interpreted.kind === "unreadable") return make(spec.field, "unreadable", null, { reason: interpreted.reason, reading });
      const reason = [interpreted.flag, spec.field === primary ? positionFlag : undefined].filter(Boolean).join(" ") || undefined;
      return make(spec.field, "reading", interpreted.value, { reason, reading, grade: fieldDefinition(spec.field)?.grade });
    });
  });
}

function geotagObservation(file: EvidenceFile, siteId: string, field: string, now: string, placedByHand: boolean, outcome: { kind: "reading"; text: string; reason: string } | { kind: "unreadable"; reason: string }): Observation {
  const query = `geotag ${file.hash.slice(0, 16)}`;
  const reading = outcome.kind === "reading";
  const source = placedByHand
    ? { id: "engineer-pin", name: "Map pin placed by the engineer" }
    : { id: "capture-geotag", name: `Phone position from a file uploaded by ${file.uploadedBy}` };
  return ObservationSchema.parse({
    id: randomUUID(),
    siteId,
    field,
    kind: outcome.kind,
    value: reading ? { type: "text", value: outcome.text } : null,
    source: { ...source, kind: "human_evidence", dataOrigin: file.synthetic ? "synthetic" : "real" },
    retrievedAt: now,
    sourceDate: null,
    method: placedByHand ? "hand_placed" : "source_read",
    locator: { query, evidenceFileId: file.id },
    // Each upload is a new position report, even at the same spot as an earlier one.
    identity: { sourceId: source.id, query, contentHash: sha256(JSON.stringify([file.id, reading ? outcome.text : outcome.reason])) },
    grade: reading ? "layout" : undefined,
    reason: outcome.reason,
    synthetic: file.synthetic,
  });
}

function positionReading(metadata: CaptureMetadata, placedByHand: boolean): { kind: "reading"; text: string; reason: string } {
  const text = `${metadata.latitude}, ${metadata.longitude}`;
  if (placedByHand) return { kind: "reading", text, reason: "Placed by the engineer, using the uploaded file. A person confirms it against the aerial." };
  const accuracy = metadata.accuracyMeters === undefined ? "with no stated accuracy" : `stated accuracy ${Math.round(metadata.accuracyMeters)} m`;
  return { kind: "reading", text, reason: `Phone position, ${accuracy}. A person confirms it against the aerial.` };
}

type Intake = {
  siteId: string;
  field: string;
  file: File | null;
  metadata: CaptureMetadata;
  uploadedBy: string;
  placedByHand: boolean;
  // Counts an upload only once the file passes its checks, so a rejected file doesn't use one up.
  useUpload?: () => boolean;
};

async function takeEvidence(deps: CaptureDeps, intake: Intake): Promise<CaptureResult> {
  const { siteId, field, file, metadata } = intake;
  const request = requestFor(field);
  if (!request) throw new ApiFailure("illegal_transition", 409, `No capture is offered for ${field}.`);
  if (!file) throw new ApiFailure("file_type", 415, "Send a JPEG, PNG, or PDF file.");
  if (file.size > MAX_FILE_BYTES) throw fileTooLarge();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffType(bytes);
  if (!type) throw new ApiFailure("file_type", 415, "Send a JPEG, PNG, or PDF file.");
  if (type.contentType !== "application/pdf" && file.size > MAX_IMAGE_BYTES) throw fileTooLarge(MAX_IMAGE_BYTES);
  if (intake.useUpload && !intake.useUpload()) throw new ApiFailure("upload_limit", 429, "This link has reached its upload limit.");

  const latest = latestOrFail(deps, siteId);
  const now = deps.now();
  const hash = sha256(bytes);
  const manifest = deps.evidenceManifest?.get(hash);
  const evidence: EvidenceFile = { id: randomUUID(), hash, uploadedBy: intake.uploadedBy, synthetic: manifest?.synthetic ?? false };

  mkdirSync(deps.uploadDir, { recursive: true });
  const path = join(deps.uploadDir, `${evidence.id}${type.extension}`);
  writeFileSync(path, bytes, { flag: "wx" });
  deps.store.saveEvidenceFile({
    id: evidence.id,
    siteId,
    field,
    path,
    contentType: type.contentType,
    sha256: hash,
    size: bytes.length,
    uploadedBy: intake.uploadedBy,
    receivedAt: now,
    synthetic: evidence.synthetic,
  });

  const position: PositionCheck = intake.placedByHand && metadata.latitude !== undefined && metadata.longitude !== undefined ? { status: "placed" } : checkPosition(metadata, latest);
  // A link answers its own field. It can't reopen a sibling that a person has already verified.
  const fields = fieldsToExtract(request).filter((spec) => !intake.useUpload || spec.field === field || !isVerified(latest, spec.field));
  const observations: Observation[] = [];
  let state: CaptureResult["state"] = "inferred";

  if (fields.length > 0) {
    let extraction: Extraction;
    if (deps.snapshot) {
      extraction = manifest?.draft ? { kind: "readings", readings: manifest.draft } : { kind: "failed", reason: "Snapshot mode has no recorded draft for this file, and makes no model call." };
    } else {
      extraction = await deps.extractor({ bytes, contentType: type.contentType, fields });
    }
    const drafts = draftObservations(evidence, siteId, extraction, fields, field, now, imageSize(bytes, type.contentType), position.flag);
    observations.push(...drafts);
    const primary = drafts.find((observation) => observation.field === field);
    if (extraction.kind === "failed") state = "extraction_failed";
    else if (primary?.kind !== "reading") state = "unreadable";
  } else if (position.status === "placed") {
    observations.push(geotagObservation(evidence, siteId, field, now, intake.placedByHand, positionReading(metadata, intake.placedByHand)));
  } else {
    state = "unreadable";
    observations.push(geotagObservation(evidence, siteId, field, now, false, { kind: "unreadable", reason: position.flag ?? "The photo came with no position. Place the pin by hand, using the photo." }));
  }

  deps.store.appendObservations(observations);
  // The model call can take a while, so this builds on whatever the record holds now.
  const current = latestOrFail(deps, siteId);
  // A bill's position says where someone stood, not where any equipment is.
  const features =
    position.status === "placed" && request.route === "capture_photo"
      ? withPin(current.features, { field, label: fieldDefinition(field)?.label ?? field, longitude: metadata.longitude!, latitude: metadata.latitude!, placedByHand: intake.placedByHand })
      : current.features;
  nextVersion(deps, current, "capture", features);
  return CaptureResultSchema.parse({ evidenceFileId: evidence.id, state, positionStatus: position.status });
}

type Form = Record<string, unknown>;

function fileFrom(form: Form): File | null {
  return form.file instanceof File ? form.file : null;
}

export function submitCapture(deps: CaptureDeps, token: string, form: Form): Promise<CaptureResult> {
  const { link } = openLink(deps, token);
  return takeEvidence(deps, {
    siteId: link.siteId,
    field: link.field,
    file: fileFrom(form),
    metadata: metadataFrom(form),
    uploadedBy: "the facility contact",
    placedByHand: false,
    useUpload: () => deps.store.useCaptureUpload(link.id),
  });
}

// The fallback when the tunnel is down. Any position sent here was placed by the engineer.
export function uploadEvidence(deps: CaptureDeps, siteId: string, field: string, form: Form): Promise<CaptureResult> {
  return takeEvidence(deps, { siteId, field, file: fileFrom(form), metadata: metadataFrom(form), uploadedBy: "the engineer", placedByHand: true });
}

export function readEvidenceFile(deps: CaptureDeps, id: string): { bytes: Uint8Array; contentType: string } {
  const file = deps.store.evidenceFile(id);
  if (!file || !existsSync(file.path)) throw new ApiFailure("not_found", 404, `No evidence file ${id}`);
  return { bytes: readFileSync(file.path), contentType: file.contentType };
}
