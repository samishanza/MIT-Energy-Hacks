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
import type { EvidenceRef, MapFeature, Observation, ObservedValue, RecordVersion, RunProgress, Value } from "@eqore/contract";
import { ADDRESS_CANDIDATE, REGIONS, crossCheck, RESOLVE_DEADLINE_MS, withRunDeadline, canonicalAddress, catalogCoverage, collectSite, deriveValues, fieldDefinition, resolveSite, selectRegion, sha256, siteIdFor } from "@eqore/sources";
import { measureSlope } from "@eqore/agents";
import type { CollectContext, FetchLike, RegionConfig, SiteChoice } from "@eqore/sources";
import { z } from "zod";
import type { Store } from "./store.ts";

export class ApiFailure extends Error {
  readonly code: "stale_value" | "verifier_required" | "evidence_required" | "illegal_transition" | "not_found" | "source_failed" | "invalid_token" | "token_closed" | "token_expired" | "upload_limit" | "file_too_large" | "file_type";
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
  retryDelayMs?: number;
  availableKeys?: string[];
  earthEngine?: CollectContext["earthEngine"];
  readLidar?: CollectContext["readLidar"];
  decodeImage?: CollectContext["decodeImage"];
  runDeadlineMs?: number;
  resolveDeadlineMs?: number;
  progress?: Map<string, RunProgress>;
  // Called with each new collected version, for the review agent to audit every step in the background.
  afterRun?: (record: RecordVersion) => void;
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
    // Equipment the collector inferred from public maps keeps its own label, which says it isn't verified.
    if (feature.attributes?.basis) return feature;
    const value = values.find((entry) => entry.field === feature.field);
    if (value?.state !== "verified") return { ...feature, kind: "capture_pin", label: value?.label ?? feature.label };
    return { ...feature, kind: "existing_equipment", label: equipmentLabel(value) };
  });
}

export function createVersion(deps: ApiDeps, parts: VersionParts): RecordVersion {
  const { store } = deps;
  const observations = store.observations(parts.site.id);
  const values = crossCheck({ address: parts.site.address, values: deriveValues(observations), observations, features: parts.features });
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
    coverage: catalogCoverage(values),
    baseMap: parts.baseMap,
    sourceRuns: parts.sourceRuns,
  };
  store.saveVersion(record);
  return record;
}

export function nextVersion(deps: ApiDeps, latest: RecordVersion, trigger: RecordVersion["trigger"], features = latest.features): RecordVersion {
  return createVersion(deps, { site: latest.site, features, baseMap: latest.baseMap, sourceRuns: latest.sourceRuns, trigger });
}

function parseRequest<Schema extends z.ZodType>(schema: Schema, body: unknown): z.infer<Schema> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiFailure("illegal_transition", 400, `The request isn't valid: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export function runProgressKey(address: string): string {
  return address.trim().toLowerCase();
}

const KEPT_RUNS = 50;

function setProgress(deps: ApiDeps, key: string, progress: RunProgress) {
  if (!deps.progress) return;
  deps.progress.delete(key);
  deps.progress.set(key, progress);
  for (const oldest of deps.progress.keys()) {
    if (deps.progress.size <= KEPT_RUNS) break;
    deps.progress.delete(oldest);
  }
}

export async function runSite(deps: ApiDeps, body: unknown) {
  const request = parseRequest(RunSiteRequestSchema, body);
  const asTyped = request.address;
  const progressKey = runProgressKey(asTyped);
  // A chosen spelling replaces the typed one and isn't a site choice.
  const spelled = request.choice?.kind === "candidate" && request.choice.candidateId.startsWith(ADDRESS_CANDIDATE) ? request.choice.candidateId.slice(ADDRESS_CANDIDATE.length) : null;
  const choice = spelled ? undefined : request.choice;
  // Only the parcel lookup is limited, so a late parcel service still leaves the geocoded point to fall back on.
  const finding = withRunDeadline(deps.fetch, deps.resolveDeadlineMs ?? RESOLVE_DEADLINE_MS, "parcel lookup");
  const findFetch: FetchLike = (url, init) => (new URL(url).hostname === "geocoding.geo.census.gov" ? deps.fetch(url, init) : finding.limited(url, init));
  const firstCtx: CollectContext = { siteId: "", fetch: deps.fetch, now: deps.now, retryDelayMs: deps.retryDelayMs };
  const canonical = await canonicalAddress(spelled ?? asTyped, firstCtx);
  if (canonical.status === "failed") throw new ApiFailure("source_failed", 502, `The address couldn't be checked. ${canonical.reason}`);
  if (canonical.status === "choose") return { status: "needs_choice" as const, candidates: canonical.candidates };
  if (canonical.status === "unknown") throw new ApiFailure("not_found", 404, "No match for this address. Write it as street, city, state.");
  const address = canonical.address;
  const region = selectRegion(address, REGIONS);
  if (!region) throw new ApiFailure("not_found", 404, "No region is configured for this address. Write it as street, city, state.");

  const siteId = siteIdFor(address);
  const ctx: CollectContext = { siteId, fetch: deps.fetch, now: deps.now, retryDelayMs: deps.retryDelayMs, availableKeys: deps.availableKeys, earthEngine: deps.earthEngine, readLidar: deps.readLidar, decodeImage: deps.decodeImage, runDeadlineMs: deps.runDeadlineMs, measureSlope };
  setProgress(deps, progressKey, { status: "running", sourceRuns: [], features: [] });
  try {
    return await collectAndRecord(deps, { address, region, siteId, ctx, choice, progressKey, findFetch });
  } catch (error) {
    setProgress(deps, progressKey, { status: "failed", sourceRuns: [], features: [], reason: (error as Error).message });
    throw error;
  } finally {
    finding.cancel();
  }
}

async function collectAndRecord(
  deps: ApiDeps,
  { address, region, siteId, ctx, choice, progressKey, findFetch }: { address: string; region: RegionConfig; siteId: string; ctx: CollectContext; choice?: SiteChoice; progressKey: string; findFetch: FetchLike },
) {
  const resolved = await resolveSite(address, region, { ...ctx, fetch: findFetch }, choice);
  if (resolved.status === "needs_choice") {
    deps.progress?.delete(progressKey);
    return { status: "needs_choice" as const, candidates: resolved.candidates };
  }

  // During an outage, a street-level point would add conflicting readings to a parcel-anchored site that
  // no later run could clear. The current record stays until the parcel service answers.
  if (resolved.anchor.kind === "point" && resolved.anchor.parcelLookup?.failure) {
    const anchored = deps.store.readVersion(siteId, "latest")?.features.some((feature) => feature.kind === "property_line");
    if (anchored) throw new ApiFailure("source_failed", 502, `The parcel source failed, so the current record was kept. ${resolved.anchor.parcelLookup.failure}`);
  }

  const collection = await collectSite(address, region, resolved.anchor, ctx, (progress) => setProgress(deps, progressKey, { status: "running", ...progress }));
  deps.store.saveSite(collection.site);
  deps.store.appendObservations(collection.observations);

  setProgress(deps, progressKey, { status: "done", site: collection.site, sourceRuns: collection.sourceRuns, features: collection.features });
  // Only what a person placed carries over. Equipment the collector inferred has a basis and is inferred again by this run.
  const previous = deps.store.readVersion(siteId, "latest")?.features ?? [];
  const pins = previous.filter(
    (feature) => (feature.kind === "capture_pin" || feature.kind === "existing_equipment") && !feature.attributes?.["basis"],
  );
  // Look back past runs where the same source also failed, to the last one that drew its shapes.
  const latestVersion = deps.store.readVersion(siteId, "latest")?.version ?? 0;
  const history = Array.from({ length: Math.min(latestVersion, 30) }, (_, i) => deps.store.readVersion(siteId, latestVersion - i)?.features ?? []);
  const kept = shapesOfFailedSources(history, collection).filter((feature) => !pins.includes(feature));
  const sourceRuns = deps.snapshot
    ? collection.sourceRuns.map((run) => (run.status === "done" ? { ...run, status: "snapshot" as const } : run))
    : collection.sourceRuns;

  const record = createVersion(deps, {
    site: collection.site,
    features: [...collection.features, ...kept, ...pins],
    baseMap: collection.baseMap,
    sourceRuns,
    trigger: "run",
  });
  deps.afterRun?.(record);
  return { status: "ok" as const, record };
}

// A source that didn't answer this time keeps its shapes from the last run, as its values already carry
// over: a timed-out land cover service shouldn't erase the paved areas the battery zone avoids.
// `history` is the feature lists of earlier versions, newest first; each field takes its shapes from the
// newest version that has any.
export function shapesOfFailedSources(
  history: MapFeature[][],
  collection: { sourceRuns: { sourceId: string; status: string }[]; observations: Observation[]; features: MapFeature[] },
): MapFeature[] {
  const failedSources = new Set(collection.sourceRuns.filter((run) => run.status !== "done").map((run) => run.sourceId));
  const failedFields = new Set(collection.observations.filter((o) => failedSources.has(o.source.id) && o.kind === "no_value").map((o) => o.field));
  const drawnNow = new Set(collection.features.map((feature) => feature.field));
  const kept: MapFeature[] = [];
  for (const field of failedFields) {
    if (drawnNow.has(field)) continue;
    const found = history.find((features) => features.some((feature) => feature.field === field));
    if (found) kept.push(...found.filter((feature) => feature.field === field));
  }
  return kept;
}

export function latestOrFail(deps: ApiDeps, siteId: string): RecordVersion {
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
function requireActor(body: unknown, latest: RecordVersion): Actor {
  const input = (body ?? {}) as { verifierName?: unknown; evidence?: unknown };
  if (typeof input.verifierName !== "string" || input.verifierName.trim() === "") {
    throw new ApiFailure("verifier_required", 400, "Verifying a value needs the name of the person verifying it.");
  }
  const evidence = z.array(EvidenceRefSchema).min(1).safeParse(input.evidence);
  if (!evidence.success) {
    throw new ApiFailure("evidence_required", 400, "Verifying a value needs at least one piece of cited evidence.");
  }
  const known = new Set(latest.observations.map((observation) => observation.id));
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
  const actor = requireActor(body, latest);
  const { expectedObservationId } = parseRequest(ConfirmValueRequestSchema, body);
  if (value.state !== "inferred" || !value.current) {
    throw new ApiFailure("illegal_transition", 409, `Only an inferred value can be confirmed. This one is ${value.state}.`);
  }
  if (expectedObservationId !== value.currentObservationId) {
    throw new ApiFailure("stale_value", 409, "This value changed after you opened it. Review the current reading, then confirm it.");
  }
  appendVerification(deps, value, siteId, actor, value.current);
  return nextVersion(deps, latest, "human_action");
}

// Also how a person enters a value when there's no draft. The earlier evidence stays on file.
export function correctValue(deps: ApiDeps, siteId: string, field: string, body: unknown): RecordVersion {
  const latest = latestOrFail(deps, siteId);
  const value = valueOrFail(latest, field);
  const actor = requireActor(body, latest);
  const { value: corrected } = parseRequest(CorrectValueRequestSchema, body);
  appendVerification(deps, value, siteId, actor, corrected);
  return nextVersion(deps, latest, "human_action");
}

export function resolveConflict(deps: ApiDeps, siteId: string, field: string, body: unknown): RecordVersion {
  const latest = latestOrFail(deps, siteId);
  const value = valueOrFail(latest, field);
  const actor = requireActor(body, latest);
  const { candidateId } = parseRequest(ResolveConflictRequestSchema, body);
  if (value.state !== "conflicting") {
    throw new ApiFailure("illegal_transition", 409, `Only a conflicting value can be resolved. This one is ${value.state}.`);
  }
  const candidate = value.candidates.find((entry) => entry.id === candidateId);
  if (!candidate) throw new ApiFailure("not_found", 404, `No candidate ${candidateId} on ${field}`);
  appendVerification(deps, value, siteId, actor, candidate.value);
  return nextVersion(deps, latest, "human_action");
}

const PERSON_SOURCE_ID = "engineer-pin";

export function withPin(features: MapFeature[], pin: { field: string; label: string; longitude: number; latitude: number; placedByHand: boolean }): MapFeature[] {
  const id = `pin-${pin.field}`;
  return [
    ...features.filter((feature) => feature.id !== id),
    { id, kind: "capture_pin", field: pin.field, geometry: { type: "Point", coordinates: [pin.longitude, pin.latitude] }, label: pin.label, placedByHand: pin.placedByHand },
  ];
}

export function movePin(deps: ApiDeps, siteId: string, body: unknown): RecordVersion {
  const latest = latestOrFail(deps, siteId);
  const { field, latitude, longitude, placedBy } = parseRequest(MovePinRequestSchema, body);
  const value = valueOrFail(latest, field);

  // A moved location replaces the earlier pin as the current reading until someone confirms it.
  if (fieldDefinition(field)?.comparison?.kind === "latest") {
    const text = `${latitude}, ${longitude}`;
    const query = `pin ${field}`;
    const synthetic = value.synthetic;
    const placedAt = deps.now();
    deps.store.appendObservations([
      ObservationSchema.parse({
        id: randomUUID(),
        siteId,
        field,
        kind: "reading",
        value: { type: "text", value: text },
        source: { id: PERSON_SOURCE_ID, name: `Map pin placed by ${placedBy}`, kind: "human_evidence", dataOrigin: synthetic ? "synthetic" : "real" },
        retrievedAt: placedAt,
        sourceDate: null,
        method: "hand_placed",
        locator: { query },
        // Placing a pin is an act, not a re-read, so moving back to an earlier spot still takes effect.
        identity: { sourceId: PERSON_SOURCE_ID, query, contentHash: sha256(JSON.stringify([text, placedBy, placedAt])) },
        grade: "layout",
        synthetic,
      }),
    ]);
  }

  return nextVersion(deps, latest, "human_action", withPin(latest.features, { field, label: value.label, longitude, latitude, placedByHand: true }));
}
