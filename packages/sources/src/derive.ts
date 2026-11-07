import { ValueSchema } from "@eqore/contract";
import type { Candidate, Observation, ObservedValue, Value } from "@eqore/contract";
import { sha256 } from "./arcgis.ts";
import { FEEDER_ATTRIBUTES, FIELDS, type FieldDefinition } from "./fields.ts";

function agrees(definition: FieldDefinition, a: ObservedValue, b: ObservedValue): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "quantity" && b.type === "quantity") {
    if (a.unit !== b.unit) return false;
    const relative = definition.comparison?.kind === "tolerance" ? definition.comparison.relative : 0;
    const largest = Math.max(Math.abs(a.value), Math.abs(b.value));
    return largest === 0 || Math.abs(a.value - b.value) / largest <= relative;
  }
  if (a.type === "text" && b.type === "text") {
    return a.value.trim().toLowerCase() === b.value.trim().toLowerCase();
  }
  if (a.type === "boolean" && b.type === "boolean") return a.value === b.value;
  return a.type === "none" && b.type === "none";
}

function identityKey(observation: Observation): string {
  const { sourceId, query, contentHash } = observation.identity;
  return JSON.stringify([sourceId, query, contentHash]);
}

function candidateFrom(field: string, observation: Observation, attributes: Candidate["attributes"]): Candidate {
  return {
    id: `${field}-${sha256(JSON.stringify(observation.value)).slice(0, 10)}`,
    value: observation.value!,
    observationId: observation.id,
    sourceName: observation.locator.attribute
      ? `${observation.source.name} (${observation.locator.attribute})`
      : observation.source.name,
    ...(attributes && Object.keys(attributes).length ? { attributes } : {}),
  };
}

// Details of one feeder, read from the observations that share its source and object.
function candidateAttributes(reading: Observation, related: Observation[]): Candidate["attributes"] {
  const attributes: NonNullable<Candidate["attributes"]> = {};
  for (const observation of related) {
    const key = FEEDER_ATTRIBUTES[observation.field];
    if (
      key &&
      observation.kind === "reading" &&
      observation.value &&
      observation.source.id === reading.source.id &&
      observation.locator.objectId === reading.locator.objectId
    ) {
      attributes[key] = observation.value;
    }
  }
  if (reading.sourceDate) attributes.source_date = { type: "text", value: reading.sourceDate };
  return attributes;
}

// Folds one field's observations, oldest first, into its current value.
export function deriveValue(definition: FieldDefinition, observations: Observation[], related: Observation[] = []): Value {
  let state: Value["state"] = "missing";
  let current: ObservedValue | null = null;
  let method: Value["method"];
  let grade: Value["grade"] = null;
  let reason: string | undefined = definition.missingReason;
  let verification: Value["verification"];
  let conflictKind: Value["conflictKind"];
  let currentReading: Observation | null = null;
  const candidates: Candidate[] = [];
  const flags = new Set<string>();
  const failedExtractions = new Set<string>();
  const seen = new Set<string>();

  const addCandidate = (observation: Observation) => {
    const candidate = candidateFrom(definition.field, observation, candidateAttributes(observation, related));
    if (!candidates.some((existing) => existing.id === candidate.id)) candidates.push(candidate);
  };
  const conflictKindFor = (): Value["conflictKind"] =>
    definition.comparison?.kind === "candidates" ? "feeder_candidates" : "source_disagreement";

  for (const observation of observations) {
    const identity = identityKey(observation);
    const repeat = seen.has(identity);
    seen.add(identity);

    switch (observation.kind) {
      case "no_value":
        if (state === "missing" && observation.reason) reason = observation.reason;
        break;

      case "unreadable":
        // Only changes state when the value has no usable reading.
        if (state === "missing" || state === "unreadable") {
          state = "unreadable";
          reason = observation.reason ?? "The evidence can't be read.";
        }
        break;

      case "failed_extraction":
        failedExtractions.add(`Extraction failed and can be retried: ${observation.reason ?? "no reason given"}`);
        break;

      case "reading": {
        // A repeat read is on file but can't change state.
        if (repeat || !observation.value) break;
        failedExtractions.clear();
        if (observation.reason) flags.add(observation.reason);
        if (state === "missing" || state === "unreadable") {
          state = "inferred";
          current = observation.value;
          method = observation.method;
          grade = observation.grade ?? definition.grade;
          reason = undefined;
          currentReading = observation;
          if (definition.comparison?.kind === "candidates") addCandidate(observation);
        } else if (state === "inferred") {
          if (current && agrees(definition, current, observation.value)) break;
          if (definition.comparison?.kind === "latest") {
            current = observation.value;
            method = observation.method;
            grade = observation.grade ?? grade;
            currentReading = observation;
            // The flags described the reading this one replaces.
            flags.clear();
            if (observation.reason) flags.add(observation.reason);
            break;
          }
          state = "conflicting";
          conflictKind = conflictKindFor();
          current = null;
          method = undefined;
          addCandidate(currentReading!);
          addCandidate(observation);
          reason = undefined;
        } else if (state === "conflicting") {
          if (!candidates.some((candidate) => agrees(definition, candidate.value, observation.value!))) {
            addCandidate(observation);
          }
        } else if (state === "verified" && current && !agrees(definition, current, observation.value)) {
          // Newer evidence disagrees. The verifier's record stays on the value.
          state = "conflicting";
          conflictKind = conflictKindFor();
          addCandidate(currentReading!);
          addCandidate(observation);
          current = null;
          method = undefined;
        }
        break;
      }

      case "verification":
        failedExtractions.clear();
        state = "verified";
        current = observation.value;
        method = observation.method;
        grade = observation.grade ?? grade ?? definition.grade;
        verification = observation.verification;
        conflictKind = undefined;
        reason = undefined;
        currentReading = observation;
        break;
    }
  }

  return ValueSchema.parse({
    field: definition.field,
    label: definition.label,
    state,
    grade,
    owner: definition.owner,
    current,
    method,
    candidates,
    conflictKind: state === "conflicting" ? conflictKind : undefined,
    observationIds: observations.map((observation) => observation.id),
    verification,
    reason,
    flags: [...flags, ...failedExtractions],
    synthetic: observations.some((observation) => observation.synthetic),
  });
}

// One value per known field, so a field no source has touched still shows as missing with its owner.
export function deriveValues(observations: Observation[]): Value[] {
  const byField = new Map<string, Observation[]>();
  for (const observation of observations) {
    const group = byField.get(observation.field);
    if (group) group.push(observation);
    else byField.set(observation.field, [observation]);
  }
  const feederDetails = observations.filter((observation) => observation.field in FEEDER_ATTRIBUTES);
  return FIELDS.map((definition) =>
    deriveValue(definition, byField.get(definition.field) ?? [], definition.field === "feeder" ? feederDetails : []),
  );
}
