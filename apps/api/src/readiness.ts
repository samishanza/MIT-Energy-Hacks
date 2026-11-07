import { ReadinessReportSchema } from "@eqore/contract";
import type { Gap, Owner, ReadinessItem, ReadinessReport, RecordVersion, Value, ValueState } from "@eqore/contract";
import { NATIONAL_GRID_EXHIBIT_C, type RequirementRow, type RequirementsTable } from "./requirements/national-grid-exhibit-c.ts";
import { EVIDENCE_REQUESTS, draftRequest, engineerDraft } from "./requests.ts";

// Tables are chosen by serving utility. PG&E's is added after the Worcester walkthrough.
const TABLES: RequirementsTable[] = [NATIONAL_GRID_EXHIBIT_C];

const PRE_APPLICATION_THRESHOLD_KW = 250;

function meetsMinimum(state: ValueState, minimum: ValueState): boolean {
  if (minimum === "verified") return state === "verified";
  if (minimum === "inferred") return state === "inferred" || state === "verified";
  return state === minimum;
}

function preApplicationLabel(values: Map<string, Value>): string {
  const size = values.get("system_capacity_kw")?.current;
  if (size?.type === "quantity" && size.unit === "kW") {
    return size.value >= PRE_APPLICATION_THRESHOLD_KW
      ? `Pre-Application Report (required: ${size.value} kW is at or above ${PRE_APPLICATION_THRESHOLD_KW} kW)`
      : `Pre-Application Report (optional: ${size.value} kW is below ${PRE_APPLICATION_THRESHOLD_KW} kW)`;
  }
  return `Pre-Application Report (required at ${PRE_APPLICATION_THRESHOLD_KW} kW or above, optional below; system size is an engineer decision and isn't set)`;
}

function statusOf(row: RequirementRow, values: Map<string, Value>): ReadinessItem["status"] {
  if (row.rowKind === "form" && row.owner === "engineer") return "engineer_owned";
  const states = row.fields.map((field) => values.get(field)?.state ?? "missing");
  if (states.every((state) => meetsMinimum(state, row.minState))) return "has_evidence";
  if (row.previewOnly && states.some((state) => state === "inferred" || state === "conflicting")) return "preview_only";
  return "needs_evidence";
}

function toItems(table: RequirementsTable, values: Map<string, Value>): ReadinessItem[] {
  const items: ReadinessItem[] = table.rows.map((row) => ({
    id: row.id,
    rowKind: row.rowKind,
    label: row.id === "pre-application-report" ? preApplicationLabel(values) : row.label,
    citation: row.citation,
    ...(row.parentItemId ? { parentItemId: row.parentItemId } : {}),
    teamDerived: row.rowKind === "input",
    fields: row.fields,
    minState: row.minState,
    owner: row.owner,
    status: statusOf(row, values),
  }));
  return items.map((item) => {
    const inputs = items.filter((candidate) => candidate.parentItemId === item.id);
    if (inputs.length === 0) return item;
    return { ...item, inputsWithEvidence: { have: inputs.filter((input) => input.status === "has_evidence").length, total: inputs.length } };
  });
}

// Ranked by how many required rows each request can fill, then by how cheaply it can be obtained,
// with a stable tie-break. It's not tuned to favor any route.
function rankGaps(items: ReadinessItem[], values: Map<string, Value>, record: RecordVersion): Gap[] {
  const open = items.filter((item) => item.status === "needs_evidence" || item.status === "preview_only");

  const requested = EVIDENCE_REQUESTS.flatMap((request) => {
    const rowsFilled = open.filter((item) => item.fields.some((field) => request.fields.includes(field))).map((item) => item.id);
    if (rowsFilled.length === 0) return [];
    const unfilled = request.fields.find((field) => values.get(field)?.state !== "verified") ?? request.fields[0];
    return [{
      id: request.id,
      request: request.request,
      route: request.route,
      owner: request.owner,
      field: unfilled,
      rowsFilled,
      routeCost: request.routeCost,
      captureLinkAllowed: request.route === "capture_photo" || request.route === "capture_bill",
      draftRequest: draftRequest(request, record),
    }];
  });

  const engineerDecisions = items
    .filter((item) => item.status === "engineer_owned" && item.fields.some((field) => values.get(field)?.state !== "verified"))
    .map((item) => ({
      id: `engineer-${item.id}`,
      request: item.label,
      route: "engineer" as const,
      owner: "engineer" as const,
      field: item.fields[0]!,
      // Engineer-owned rows aren't filled by evidence from anyone else.
      rowsFilled: [],
      routeCost: 5,
      captureLinkAllowed: false,
      draftRequest: engineerDraft(item.label, record),
    }));

  return [...requested, ...engineerDecisions]
    .sort((a, b) => b.rowsFilled.length - a.rowsFilled.length || a.routeCost - b.routeCost || a.id.localeCompare(b.id))
    .map((gap, index) => ({ ...gap, rank: index + 1 }));
}

function countsBy(items: ReadinessItem[]) {
  const count = (rows: ReadinessItem[]) => ({ withEvidence: rows.filter((item) => item.status === "has_evidence").length, total: rows.length });
  const owners = [...new Set(items.map((item) => item.owner))] as Owner[];
  return {
    formRows: count(items.filter((item) => item.rowKind === "form")),
    inputRows: count(items.filter((item) => item.rowKind === "input")),
    byOwner: Object.fromEntries(owners.map((owner) => [owner, count(items.filter((item) => item.owner === owner))])),
  };
}

function noTableReport(record: RecordVersion, utility: string | null): ReadinessReport {
  const bill = EVIDENCE_REQUESTS.find((request) => request.id === "bill")!;
  const noTableReason = utility
    ? `No requirements table applies yet: the ${utility} table isn't built. The bill is the next request.`
    : "No requirements table applies, because the record has no serving utility. The bill names the utility, so it's the next request.";
  return ReadinessReportSchema.parse({
    recordVersionId: record.id,
    synthetic: record.synthetic,
    requirementsTable: null,
    noTableReason,
    items: [],
    gaps: [
      {
        id: bill.id,
        rank: 1,
        request: bill.request,
        route: bill.route,
        owner: bill.owner,
        field: bill.fields[0],
        rowsFilled: [],
        routeCost: bill.routeCost,
        captureLinkAllowed: true,
        draftRequest: draftRequest(bill, record),
      },
    ],
    share: null,
  });
}

// Deterministic: the same record version always gives the same report, with no model involved.
export function checkReadiness(record: RecordVersion): ReadinessReport {
  const values = new Map(record.values.map((value) => [value.field, value]));
  const utility = values.get("serving_utility")?.current;
  const utilityName = utility?.type === "text" ? utility.value : null;
  const table = TABLES.find((candidate) => candidate.utility === utilityName);
  if (!table) return noTableReport(record, utilityName);

  const items = toItems(table, values);
  return ReadinessReportSchema.parse({
    recordVersionId: record.id,
    synthetic: record.synthetic,
    requirementsTable: { utility: table.utility, form: table.form, formDate: table.formDate, superseded: table.superseded },
    items,
    gaps: rankGaps(items, values, record),
    share: countsBy(items),
  });
}
