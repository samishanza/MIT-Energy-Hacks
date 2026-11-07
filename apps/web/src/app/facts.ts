import type { Observation, ReadinessReport, RecordVersion, Value } from "@eqore/contract";
import { formatValue } from "./format";

export type Family = NonNullable<Value["family"]>;

export const PUBLIC_FAMILIES = ["physical", "utility", "energy"] as const satisfies readonly Family[];

export const FAMILY_WORDS: Record<Family, string> = {
  physical: "Physical",
  utility: "Utility",
  energy: "Energy",
  customer: "Customer",
  decision: "Engineer decisions",
};

// Older records carry no family, so it's read from the owner, as the collector does.
export function familyOf(value: Value): Family {
  if (value.family) return value.family;
  switch (value.owner) {
    case "public_data":
      return "physical";
    case "utility":
      return "utility";
    case "customer":
    case "qualified_person":
      return "customer";
    case "engineer":
      return "decision";
  }
}

export const isPublicFact = (value: Value) => (PUBLIC_FAMILIES as readonly Family[]).includes(familyOf(value));

export const isFound = (value: Value) => value.state !== "missing";

// The reading a value rests on now, which is what its source and date describe.
export function currentObservation(record: RecordVersion, value: Value): Observation | undefined {
  const id = value.currentObservationId ?? value.observationIds.at(-1);
  return record.observations.find((observation) => observation.id === id);
}

export function factsFound(record: RecordVersion): number {
  return record.values.filter((value) => isPublicFact(value) && isFound(value)).length;
}

export function conflictCounts(record: RecordVersion) {
  const count = (kind: Value["conflictKind"]) =>
    record.values.filter((value) => value.state === "conflicting" && value.conflictKind === kind).length;
  return { source: count("source_disagreement"), feeder: count("feeder_candidates"), listed: count("listed_candidates") };
}

export function notPublicCounts(record: RecordVersion) {
  const count = (family: Family) => record.values.filter((value) => familyOf(value) === family).length;
  return { customer: count("customer"), decision: count("decision") };
}

export const verifiedCount = (record: RecordVersion) => record.values.filter((value) => value.state === "verified").length;

// Below layout grade: good enough to plan from, not to lay equipment out on.
export const isBelowLayout = (value: Value) => isFound(value) && value.state !== "verified" && value.grade === "reference";

export type AttentionItem = {
  id: string;
  kind: "conflict" | "layer" | "cross_check" | "low_grade";
  title: string;
  reason: string;
  field?: string;
  fields?: string[];
};

function conflictReason(value: Value): string {
  const n = value.candidates.length;
  switch (value.conflictKind) {
    case "feeder_candidates":
      return `${n} nearby feeders. The utility's Pre-Application Report settles which one serves the site.`;
    case "listed_candidates":
      return `${n} candidates, not settled. Choose one only with evidence.`;
    default:
      return `Sources disagree: ${value.candidates.map((c) => `${formatValue(c.value)} (${c.sourceName})`).join(" vs. ")}.`;
  }
}

// Only what needs a person: conflicts, layers that failed or weren't checked, and values below layout grade.
// Everything else stays drawn and traced without asking to be read.
export function attentionItems(record: RecordVersion): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const value of record.values) {
    if (value.state !== "conflicting") continue;
    items.push({ id: `conflict-${value.field}`, kind: "conflict", title: value.label, reason: conflictReason(value), field: value.field });
  }
  for (const run of record.sourceRuns) {
    if (run.status === "missing") {
      items.push({ id: `layer-${run.sourceId}`, kind: "layer", title: run.name, reason: `Failed or not run. ${run.reason ?? "It didn't answer."}` });
    } else if (run.status === "person_only") {
      items.push({ id: `layer-${run.sourceId}`, kind: "layer", title: run.name, reason: `Not checked by the tool. ${run.reason ?? "A person looks this up."}` });
    }
  }
  for (const value of record.values) {
    for (const [index, check] of (value.crossChecks ?? []).entries()) {
      if (check.result === "agrees") continue;
      // A disagreement on a value already listed as a conflict would say the same thing twice.
      if (check.result === "disagrees" && value.state === "conflicting") continue;
      const words = check.result === "disagrees" ? "Disagrees." : "Not checked.";
      items.push({
        id: `check-${value.field}-${index}`,
        kind: "cross_check",
        title: `${value.label}: ${check.label}`,
        reason: [words, check.detail].filter(Boolean).join(" "),
        field: value.field,
      });
    }
  }
  const low = record.values.filter((value) => isPublicFact(value) && isBelowLayout(value) && value.state !== "conflicting");
  if (low.length > 0) {
    items.push({
      id: "low-grade",
      kind: "low_grade",
      title: `${low.length} public ${low.length === 1 ? "fact is" : "facts are"} reference grade, below layout grade`,
      reason: "Good enough to plan from. Check them against a survey or a site photo before laying out equipment.",
      fields: low.map((value) => value.field),
    });
  }
  return items;
}

// What public data covers on the utility's application, counting form rows and drawing inputs apart.
export function gridRequestLine(report: ReadinessReport | null): string | null {
  if (!report) return null;
  if (!report.requirementsTable) return `Grid connection request: no requirements table applies. ${report.noTableReason ?? ""}`.trim();
  const fromPublic = (rowKind: "form" | "input") => {
    const rows = report.items.filter((item) => item.rowKind === rowKind);
    const filled = rows.filter((item) => item.status === "has_evidence" && (item.owner === "public_data" || item.owner === "utility"));
    return { filled: filled.length, total: rows.length };
  };
  const form = fromPublic("form");
  const input = fromPublic("input");
  const inputs = input.total > 0 ? `, and ${input.filled} of ${input.total} drawing inputs,` : "";
  return `Grid connection request: ${form.filled} of ${form.total} items${inputs} from public data. The rest wait on your decisions or customer documents.`;
}
