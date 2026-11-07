import {
  CaptureLinkSchema,
  CaptureResultSchema,
  ReadinessReportSchema,
  RecordVersionSchema,
  RunSiteResponseSchema,
  type MapFeature,
  type Observation,
  type ObservedValue,
  type ReadinessItem,
  type ReadinessReport,
  type RecordVersion,
  type Value,
} from "@eqore/contract";
import readinessSample from "@eqore/contract/samples/readiness.sample.json";
import recordSample from "@eqore/contract/samples/record.sample.json";
import { ApiRequestError, type Actor, type EngineerApi } from "./api";
import { formatValue } from "./app/format";
import { isEquipmentPoint } from "./map/layers";

// A synthetic stand-in for the engineer API, so the UI can be walked before the real API exists.

const SAMPLE_PHOTO = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640"><rect width="960" height="640" fill="#4a5157"/><rect x="120" y="80" width="720" height="480" fill="#d8d6ce"/><text x="480" y="170" font-family="sans-serif" font-size="30" text-anchor="middle" fill="#b3261e">SYNTHETIC SAMPLE PHOTO</text><text x="480" y="300" font-family="monospace" font-size="56" text-anchor="middle">800 A 480Y/277 V</text></svg>`,
)}`;

function draftFor(field: string): ObservedValue {
  return field === "meter_number"
    ? { type: "text", value: "SAMPLE-METER-0042" }
    : { type: "quantity", value: 800, unit: "A" };
}

function requireActor(actor: Actor) {
  if (!actor.verifierName.trim()) {
    throw new ApiRequestError("verifier_required", "A verification needs a named person.");
  }
  if (actor.evidence.length === 0) {
    throw new ApiRequestError("evidence_required", "A verification needs evidence: cite what you looked at.");
  }
}

function hasEvidence(value: Value | undefined, minState: ReadinessItem["minState"]) {
  return value?.state === "verified" || (minState !== "verified" && value?.state === minState);
}

const tally = (rows: ReadinessItem[]) => ({
  withEvidence: rows.filter((i) => i.status === "has_evidence").length,
  total: rows.length,
});

function nextReport(record: RecordVersion, previous: ReadinessReport): ReadinessReport {
  const valueOf = (field: string) => record.values.find((v) => v.field === field);
  const items = previous.items.map((item) => {
    const filled = item.fields.every((field) => hasEvidence(valueOf(field), item.minState));
    const status =
      item.status === "engineer_owned" || item.status === "preview_only"
        ? item.status
        : filled
          ? ("has_evidence" as const)
          : ("needs_evidence" as const);
    return { ...item, status };
  });
  const withInputs = items.map((item) => {
    if (!item.inputsWithEvidence) return item;
    const { withEvidence, total } = tally(items.filter((i) => i.parentItemId === item.id));
    return { ...item, inputsWithEvidence: { have: withEvidence, total } };
  });
  const count = (rowKind: "form" | "input") => tally(withInputs.filter((i) => i.rowKind === rowKind));
  const byOwner = Object.fromEntries(
    [...new Set(withInputs.map((i) => i.owner))].map((owner) => [owner, tally(withInputs.filter((i) => i.owner === owner))]),
  );
  return ReadinessReportSchema.parse({
    ...previous,
    recordVersionId: record.id,
    items: withInputs,
    gaps: previous.gaps
      .filter((gap) => valueOf(gap.field)?.state !== "verified")
      .map((gap, index) => ({ ...gap, rank: index + 1 })),
    share: previous.share && { formRows: count("form"), inputRows: count("input"), byOwner },
  });
}

export function createMockApi(): EngineerApi {
  let record = RecordVersionSchema.parse(structuredClone(recordSample));
  let report = ReadinessReportSchema.parse(structuredClone(readinessSample));
  const files = new Map<string, string>([["sample-file-1", SAMPLE_PHOTO]]);
  const pdfs = new Set<string>();
  let serial = 100;

  function commit(trigger: RecordVersion["trigger"], change: (next: RecordVersion) => void): RecordVersion {
    const next = structuredClone(record);
    change(next);
    next.version += 1;
    next.id = `${next.site.id}-v${next.version}`;
    next.trigger = trigger;
    next.createdAt = new Date().toISOString();
    record = RecordVersionSchema.parse(next);
    report = nextReport(record, report);
    return structuredClone(record);
  }

  function observation(next: RecordVersion, field: string, partial: Partial<Observation>): Observation {
    const id = `obs-${(serial += 1)}`;
    const observation: Observation = {
      id,
      siteId: next.site.id,
      field,
      kind: "reading",
      value: null,
      source: { id: "sample-engineer", name: "SYNTHETIC SAMPLE engineer entry", kind: "human_evidence", dataOrigin: "synthetic" },
      retrievedAt: new Date().toISOString(),
      sourceDate: null,
      method: "person_entered",
      locator: {},
      identity: { sourceId: "sample-engineer", query: field, contentHash: id },
      synthetic: true,
      ...partial,
    };
    next.observations.push(observation);
    const value = next.values.find((v) => v.field === field)!;
    value.observationIds.push(id);
    return observation;
  }

  function verify(next: RecordVersion, field: string, actor: Actor, current: ObservedValue) {
    const value = next.values.find((v) => v.field === field);
    if (!value) throw new ApiRequestError("not_found", "That value no longer exists.");
    const grade = value.grade ?? "reference";
    const verification = {
      verifierName: actor.verifierName.trim(),
      verifiedAt: new Date().toISOString(),
      evidence: actor.evidence,
    };
    observation(next, field, { kind: "verification", value: current, grade, verification });
    Object.assign(value, { state: "verified", current, grade, method: "person_entered", verification, reason: undefined });
    delete value.conflictKind;
    const pin = next.features.find((f) => f.field === field && f.kind === "capture_pin");
    if (pin) {
      pin.kind = "existing_equipment";
      pin.label = `(E) ${value.label} ${formatValue(current)}`;
    }
  }

  return {
    async runSite(request) {
      if (/choose/i.test(request.address) && !request.choice) {
        return RunSiteResponseSchema.parse({
          status: "needs_choice",
          candidates: [
            { id: "sample-a", label: "100 Sample Way, Unit A (SYNTHETIC SAMPLE)", source: "SYNTHETIC SAMPLE parcel source" },
            { id: "sample-b", label: "100 Sample Way, Unit B (SYNTHETIC SAMPLE)", source: "SYNTHETIC SAMPLE parcel source" },
          ],
        });
      }
      if (/no match/i.test(request.address) && !request.choice) {
        return RunSiteResponseSchema.parse({ status: "needs_choice", candidates: [] });
      }
      return RunSiteResponseSchema.parse({ status: "ok", record: structuredClone(record) });
    },
    async readVersion() {
      return structuredClone(record);
    },
    async readReadiness() {
      return structuredClone(report);
    },
    async confirmValue(_siteId, field, actor) {
      requireActor(actor);
      const value = record.values.find((v) => v.field === field);
      if (value?.state !== "inferred" || !value.current) {
        throw new ApiRequestError("illegal_transition", "Only an inferred value can be confirmed.");
      }
      const current = value.current;
      return commit("human_action", (next) => verify(next, field, actor, current));
    },
    async correctValue(_siteId, field, request) {
      requireActor(request);
      return commit("human_action", (next) => verify(next, field, request, request.value));
    },
    async resolveConflict(_siteId, field, request) {
      requireActor(request);
      const candidate = record.values
        .find((v) => v.field === field)
        ?.candidates.find((c) => c.id === request.candidateId);
      if (!candidate) throw new ApiRequestError("not_found", "That candidate no longer exists.");
      return commit("human_action", (next) => verify(next, field, request, candidate.value));
    },
    async movePin(_siteId, request) {
      if (!request.placedBy.trim()) {
        throw new ApiRequestError("verifier_required", "Placing equipment needs a named person.");
      }
      const value = record.values.find((v) => v.field === request.field);
      if (!value) throw new ApiRequestError("not_found", "That value no longer exists.");
      return commit("human_action", (next) => {
        const coordinates: [number, number] = [request.longitude, request.latitude];
        const existing = next.features.find((f) => f.field === request.field && isEquipmentPoint(f));
        const feature: MapFeature = existing ?? {
          id: `f-${request.field}`,
          kind: value.state === "verified" ? "existing_equipment" : "capture_pin",
          field: request.field,
          geometry: { type: "Point", coordinates },
          ...(value.state === "verified" && value.current
            ? { label: `(E) ${value.label} ${formatValue(value.current)}` }
            : {}),
        };
        feature.geometry = { type: "Point", coordinates };
        feature.placedByHand = true;
        if (!existing) next.features.push(feature);
      });
    },
    async createCaptureLink(siteId, field) {
      return CaptureLinkSchema.parse({
        id: `link-${(serial += 1)}`,
        siteId,
        field,
        url: `${location.origin}/capture.html?token=SAMPLE-TOKEN`,
        status: "open",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        uploadsUsed: 0,
        maxUploads: 5,
      });
    },
    async uploadEvidence(_siteId, field, file, metadata = {}) {
      const value = record.values.find((v) => v.field === field);
      if (!value) throw new ApiRequestError("not_found", "That value no longer exists.");
      const evidenceFileId = `sample-upload-${(serial += 1)}`;
      files.set(evidenceFileId, URL.createObjectURL?.(file) ?? SAMPLE_PHOTO);
      if (file.type === "application/pdf") pdfs.add(evidenceFileId);
      const placed = metadata.latitude !== undefined && metadata.longitude !== undefined;
      commit("capture", (next) => {
        const draft = draftFor(field);
        observation(next, field, {
          value: draft,
          grade: "nameplate",
          method: "model_draft",
          source: { id: "sample-capture", name: "SYNTHETIC SAMPLE uploaded evidence", kind: "human_evidence", dataOrigin: "synthetic" },
          locator: { evidenceFileId, imageRegion: { x: 120, y: 80, width: 720, height: 300 } },
        });
        const target = next.values.find((v) => v.field === field)!;
        Object.assign(target, { state: "inferred", current: draft, grade: "nameplate", method: "model_draft" });
        delete target.reason;
        if (placed) {
          next.features.push({
            id: `f-pin-${evidenceFileId}`,
            kind: "capture_pin",
            field,
            geometry: { type: "Point", coordinates: [metadata.longitude!, metadata.latitude!] },
          });
        }
      });
      return CaptureResultSchema.parse({ evidenceFileId, state: "inferred", positionStatus: placed ? "placed" : "needs_pin" });
    },
    evidenceUrl: (evidenceFileId) => files.get(evidenceFileId) ?? SAMPLE_PHOTO,
    evidenceKind: async (evidenceFileId) => (pdfs.has(evidenceFileId) ? "pdf" : "image"),
  };
}
