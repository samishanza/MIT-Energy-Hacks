import { randomUUID } from "node:crypto";
import {
  CONTRACT_VERSION,
  ConfirmValueRequestSchema,
  CorrectValueRequestSchema,
  EvidenceRefSchema,
  MovePinRequestSchema,
  ObservationSchema,
  ResolveConflictRequestSchema,
  RunSiteRequestSchema,
} from "@eqore/contract";
import type { EvidenceRef, MapFeature, Observation, ObservedValue, RecordVersion, Value } from "@eqore/contract";
import { REGIONS, collectSite, deriveValues, fieldDefinition, resolveSite, selectRegion, sha256, siteIdFor } from "@eqore/sources";
import type { CollectContext, FetchLike } from "@eqore/sources";
import { z } from "zod";
import type { Store } from "./store.ts";

export class ApiFailure extends Error {
  readonly code: "verifier_required" | "evidence_required" | "illegal_transition" | "not_found" | "source_failed" | "invalid_token" | "token_closed" | "token_expired" | "upload_limit" | "file_too_large" | "file_type";
  readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 415 | 429 | 502;

  constructor(code: ApiFailure["code"], status: ApiFailure["status"], message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export type ApiDeps = {
  store: Store;
  fetch: FetchLike;
  now: () => string;
  // True when running from recorded data, so the record and its sources say so.
  snapshot?: boolean;
};

type VersionParts = Pick<RecordVersion, "site" | "features" | "baseMap" | "sourceRuns" | "trigger">;

function equipmentLabel(value: Value): string {
  const shown = value.current?.type === "quantity" ? ` ${value.current.value} ${value.current.unit}` : "";
  return `(E) ${value.label.replace(/ location$/i, "").toUpperCase()}${shown}`;
}

// A pin becomes a labeled existing-equipment feature once a person verifies its field.
function labelVerifiedEquipment(features: MapFeature[], values: Value[]): MapFeature[] {
  return features.map((feature) => {
    if (feature.kind !== "capture_pin" && feature.kind !== "existing_equipment") return feature;
    const value = values.find((entry) => entry.field === feature.field);
    if (value?.state !== "verified") return { ...feature, kind: "capture_pin" };
    return { ...feature, kind: "existing_equipment", label: equipmentLabel(value) };
  });
}

// Every run or human action creates a new immutable version, derived from all observations so far.
export function createVersion(deps: ApiDeps, parts: VersionParts): RecordVersion {
  const { store } = deps;
  const observations = store.observations(parts.site.id);
  const values = deriveValues(observations);
  const version = store.latestVersionNumber(parts.site.id) + 1;
  const record: RecordVersion = {
    id: `${parts.site.id}-v${version}`,
    contractVersion: CONTRACT_VERSION,
    version,
    createdAt: deps.now(),
    trigger: parts.trigger,
    snapshot: Boolean(deps.snapshot),
    synthetic: observations.some((observation) => observation.synthetic),
    site: parts.site,
    values,
    observations,
    features: labelVerifiedEquipment(parts.features, values),
    baseMap: parts.baseMap,
    sourceRuns: parts.sourceRuns,
  };
  store.saveVersion(record);
  return record;
}

// A new version that keeps everything from the last one except what the caller changes.
export function nextVersion(deps: ApiDeps, latest: RecordVersion, trigger: RecordVersion["trigger"], features = latest.features): RecordVersion {
  return createVersion(deps, { site: latest.site, features, baseMap: latest.baseMap, sourceRuns: latest.sourceRuns, trigger });
}

function invalidRequest(error: z.ZodError): ApiFailure {
  return new ApiFailure("illegal_transition", 400, `The request isn't valid: ${z.prettifyError(error)}`);
}

export async function runSite(deps: ApiDeps, body: unknown) {
  const parsed = RunSiteRequestSchema.safeParse(body);
  if (!parsed.success) throw invalidRequest(parsed.error);
  const { address, choice } = parsed.data;
  const region = selectRegion(address, REGIONS);
  if (!region) throw new ApiFailure("not_found", 404, "No region is configured for this address. Write it as street, city, state.");

  const siteId = siteIdFor(address);
  const ctx: CollectContext = { siteId, fetch: deps.fetch, now: deps.now };
  const resolved = await resolveSite(address, region, ctx, choice);
  if (resolved.status === "needs_choice") return { status: "needs_choice" as const, candidates: resolved.candidates };

  const collection = await collectSite(address, region, resolved.anchor, ctx);
  deps.store.saveSite(collection.site);
  deps.store.appendObservations(collection.observations);

  // Pins placed in earlier versions stay on the map after a re-run.
  const pins = (deps.store.readVersion(siteId, "latest")?.features ?? []).filter((feature) => feature.kind === "capture_pin" || feature.kind === "existing_equipment");
  const sourceRuns = deps.snapshot
    ? collection.sourceRuns.map((run) => (run.status === "done" ? { ...run, status: "snapshot" as const } : run))
    : collection.sourceRuns;

  const record = createVersion(deps, {
    site: collection.site,
    features: [...collection.features, ...pins],
    baseMap: collection.baseMap,
    sourceRuns,
    trigger: "run",
  });
  return { status: "ok" as const, record };
}

function latestOrFail(deps: ApiDeps, siteId: string): RecordVersion {
  const latest = deps.store.readVersion(siteId, "latest");
  if (!latest) throw new ApiFailure("not_found", 404, `No site ${siteId}`);
  return latest;
}

function valueOrFail(record: RecordVersion, field: string): Value {
  const value = record.values.find((entry) => entry.field === field);
  if (!value) throw new ApiFailure("not_found", 404, `No field ${field}`);
  return value;
}

type Actor = { verifierName: string; evidence: EvidenceRef[] };

// Named reasons come first, so the engineer sees which of the two is missing.
function requireActor(body: unknown, deps: ApiDeps, siteId: string): Actor {
  const input = (body ?? {}) as { verifierName?: unknown; evidence?: unknown };
  if (typeof input.verifierName !== "string" || input.verifierName.trim() === "") {
    throw new ApiFailure("verifier_required", 400, "Verifying a value needs the name of the person verifying it.");
  }
  const evidence = z.array(EvidenceRefSchema).min(1).safeParse(input.evidence);
  if (!evidence.success) {
    throw new ApiFailure("evidence_required", 400, "Verifying a value needs at least one piece of cited evidence.");
  }
  const known = new Set(deps.store.observations(siteId).map((observation) => observation.id));
  for (const reference of evidence.data) {
    if (reference.kind === "observation" && !known.has(reference.observationId)) {
      throw new ApiFailure("evidence_required", 400, `The cited evidence ${reference.observationId} isn't on this site's record.`);
    }
  }
  return { verifierName: input.verifierName.trim(), evidence: evidence.data };
}

// The only way a value becomes verified. It always names a person and their evidence, and never
// carries a model's method, so model output can't reach verified without a person's decision.
function appendVerification(deps: ApiDeps, value: Value, siteId: string, actor: Actor, verified: ObservedValue): void {
  const verifiedAt = deps.now();
  const origin = value.synthetic ? "synthetic" : "real";
  const query = `verify ${value.field}`;
  const observation: Observation = ObservationSchema.parse({
    id: randomUUID(),
    siteId,
    field: value.field,
    kind: "verification",
    value: verified,
    source: { id: "engineer-review", name: "Engineer review", kind: "human_evidence", dataOrigin: origin },
    retrievedAt: verifiedAt,
    sourceDate: null,
    method: "person_entered",
    locator: { query },
    identity: { sourceId: "engineer-review", query, contentHash: sha256(JSON.stringify([verified, actor.verifierName, verifiedAt])) },
    grade: value.grade ?? fieldDefinition(value.field)?.grade ?? "reference",
    verification: { verifierName: actor.verifierName, verifiedAt, evidence: actor.evidence },
    synthetic: value.synthetic,
  });
  deps.store.appendObservations([observation]);
}

export function confirmValue(deps: ApiDeps, siteId: string, field: string, body: unknown): RecordVersion {
  const latest = latestOrFail(deps, siteId);
  const value = valueOrFail(latest, field);
  const actor = requireActor(body, deps, siteId);
  const parsed = ConfirmValueRequestSchema.safeParse(body);
  if (!parsed.success) throw invalidRequest(parsed.error);
  if (value.state !== "inferred" || !value.current) {
    throw new ApiFailure("illegal_transition", 409, `Only an inferred value can be confirmed. This one is ${value.state}.`);
  }
  appendVerification(deps, value, siteId, actor, value.current);
  return nextVersion(deps, latest, "human_action");
}

// Also how a person enters a value when there's no draft. The earlier evidence stays on file.
export function correctValue(deps: ApiDeps, siteId: string, field: string, body: unknown): RecordVersion {
  const latest = latestOrFail(deps, siteId);
  const value = valueOrFail(latest, field);
  const actor = requireActor(body, deps, siteId);
  const parsed = CorrectValueRequestSchema.safeParse(body);
  if (!parsed.success) throw invalidRequest(parsed.error);
  appendVerification(deps, value, siteId, actor, parsed.data.value);
  return nextVersion(deps, latest, "human_action");
}

export function resolveConflict(deps: ApiDeps, siteId: string, field: string, body: unknown): RecordVersion {
  const latest = latestOrFail(deps, siteId);
  const value = valueOrFail(latest, field);
  const actor = requireActor(body, deps, siteId);
  const parsed = ResolveConflictRequestSchema.safeParse(body);
  if (!parsed.success) throw invalidRequest(parsed.error);
  if (value.state !== "conflicting") {
    throw new ApiFailure("illegal_transition", 409, `Only a conflicting value can be resolved. This one is ${value.state}.`);
  }
  const candidate = value.candidates.find((entry) => entry.id === parsed.data.candidateId);
  if (!candidate) throw new ApiFailure("not_found", 404, `No candidate ${parsed.data.candidateId} on ${field}`);
  appendVerification(deps, value, siteId, actor, candidate.value);
  return nextVersion(deps, latest, "human_action");
}

const PERSON_SOURCE_ID = "engineer-pin";

export function movePin(deps: ApiDeps, siteId: string, body: unknown): RecordVersion {
  const latest = latestOrFail(deps, siteId);
  const parsed = MovePinRequestSchema.safeParse(body);
  if (!parsed.success) throw invalidRequest(parsed.error);
  const { field, latitude, longitude, placedBy } = parsed.data;
  const value = valueOrFail(latest, field);

  // A moved location replaces the earlier pin as the current reading until someone confirms it.
  if (fieldDefinition(field)?.comparison?.kind === "latest") {
    const text = `${latitude}, ${longitude}`;
    const query = `pin ${field}`;
    const synthetic = value.synthetic;
    deps.store.appendObservations([
      ObservationSchema.parse({
        id: randomUUID(),
        siteId,
        field,
        kind: "reading",
        value: { type: "text", value: text },
        source: { id: PERSON_SOURCE_ID, name: `Map pin placed by ${placedBy}`, kind: "human_evidence", dataOrigin: synthetic ? "synthetic" : "real" },
        retrievedAt: deps.now(),
        sourceDate: null,
        method: "hand_placed",
        locator: { query },
        identity: { sourceId: PERSON_SOURCE_ID, query, contentHash: sha256(text) },
        grade: "layout",
        synthetic,
      }),
    ]);
  }

  const pin: MapFeature = {
    id: `pin-${field}`,
    kind: "capture_pin",
    field,
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    label: value.label,
    placedByHand: true,
  };
  const features = [...latest.features.filter((feature) => feature.id !== pin.id), pin];
  return nextVersion(deps, latest, "human_action", features);
}
