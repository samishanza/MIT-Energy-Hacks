import type { Gap, RecordVersion, Value } from "@eqore/contract";

export type EvidenceRequest = {
  id: string;
  request: string;
  route: Gap["route"];
  owner: Gap["owner"];
  // The field a capture link names. Other fields the same evidence can fill follow it.
  fields: [string, ...string[]];
  // Other fields a draft can read from the same file. They offer no capture link of their own.
  alsoExtract?: string[];
  // A team estimate of how hard the route is: a bill is easier than a utility report, which takes
  // a fee and up to 10 business days, and a qualified person's visit costs the most.
  routeCost: number;
  // The question shown on the phone, for routes that offer a capture link.
  question?: string;
};

export function offersCaptureLink(route: Gap["route"]): boolean {
  return route === "capture_photo" || route === "capture_bill";
}

export const EVIDENCE_REQUESTS: EvidenceRequest[] = [
  {
    id: "bill",
    request: "Photo or PDF of a recent electric bill",
    route: "capture_bill",
    owner: "customer",
    fields: ["meter_number", "account_number"],
    alsoExtract: ["peak_demand_kw", "serving_utility"],
    routeCost: 1,
    question: "Please take a photo of a recent electric bill, showing the account and meter numbers.",
  },
  {
    id: "contract-documents",
    request: "Signed contract details and the landowner form (Attachment 1A or 1B)",
    route: "customer_record",
    owner: "customer",
    fields: ["interconnecting_customer", "site_control"],
    routeCost: 2,
  },
  {
    id: "existing-generation-record",
    request: "Existing generation on the account or parcel, with any application numbers and nameplate capacity",
    route: "customer_record",
    owner: "customer",
    fields: ["existing_generation", "existing_facility_record"],
    routeCost: 2,
  },
  {
    id: "nameplate-photo",
    request: "Doors-closed photo of the main switchboard's exterior label",
    route: "capture_photo",
    owner: "customer",
    fields: ["main_device_rating", "service_voltage"],
    routeCost: 2,
    question: "Please photograph the label on the outside of the main electrical switchboard, showing any printed ratings.",
  },
  {
    id: "switchboard-location-photo",
    request: "Geotagged doors-closed photo at the main switchboard",
    route: "capture_photo",
    owner: "customer",
    fields: ["switchboard_location"],
    routeCost: 2,
    question: "Please stand next to the main electrical switchboard and take a photo of it from the outside.",
  },
  {
    id: "meter-location-photo",
    request: "Geotagged photo at the electric meter",
    route: "capture_photo",
    owner: "customer",
    fields: ["meter_location"],
    routeCost: 2,
    question: "Please stand next to the electric meter and take a photo of it from the outside.",
  },
  {
    id: "transformer-location-photo",
    request: "Geotagged photo near the utility transformer, from outside any fence",
    route: "capture_photo",
    owner: "customer",
    fields: ["utility_transformer_location"],
    routeCost: 2,
    question: "Please take a photo of the utility transformer from a safe distance, outside any fence or barrier.",
  },
  {
    id: "pre-application-report",
    request: "Pre-Application Report from the utility",
    route: "pre_application_report",
    owner: "utility",
    fields: ["feeder"],
    routeCost: 4,
  },
  {
    id: "qualified-person-ratings",
    request: "Bus and short-circuit ratings from a qualified electrician or PE",
    route: "qualified_person",
    owner: "qualified_person",
    fields: ["bus_rating", "kaic_rating"],
    routeCost: 5,
  },
];

const DRAFT_NOTICE = "DRAFT for a person to review and send. Nothing has been sent.";

function known(values: Value[], field: string): string | null {
  const value = values.find((entry) => entry.field === field);
  const current = value?.current;
  if (!current) return null;
  const note = value?.method === "model_draft" ? " (unconfirmed draft reading, check before sending)" : "";
  if (current.type === "text") return `${current.value}${note}`;
  if (current.type === "quantity") return `${current.value} ${current.unit}${note}`;
  return null;
}

function preApplicationDraft(record: RecordVersion): string {
  const line = (label: string, value: string | null) => `- ${label}: ${value ?? "[to be filled in by a person]"}`;
  return [
    DRAFT_NOTICE,
    "",
    "Pre-Application Report request (Exhibit B), for National Grid.",
    "",
    line("Proposed facility address", record.site.address),
    line("GPS coordinates, from public data, not surveyed", known(record.values, "site_location")),
    line("Generation type", null),
    line("Size in AC kW, an engineer decision", known(record.values, "system_capacity_kw")),
    line("Single or three phase generator configuration", null),
    line("Stand-alone, with no on-site load", null),
    line("Interconnecting customer account number", known(record.values, "account_number")),
    line("Site minimum and maximum load in kW", null),
    line("New service or service upgrade needed", null),
    "",
    "Also needs a Google Map still picture, cross streets, the applicant's contacts, and the report fee.",
  ].join("\n");
}

function askDraft(request: EvidenceRequest, record: RecordVersion): string {
  const reason =
    request.route === "qualified_person"
      ? "These ratings are inside the equipment, so please have a qualified electrician or PE read them. Facility staff should not open the equipment."
      : "Please keep all doors and covers closed if this involves electrical equipment.";
  return [DRAFT_NOTICE, "", `Site: ${record.site.address}`, `Request: ${request.request}.`, reason].join("\n");
}

export function draftRequest(request: EvidenceRequest, record: RecordVersion): string {
  return request.route === "pre_application_report" ? preApplicationDraft(record) : askDraft(request, record);
}

export function engineerDraft(label: string, record: RecordVersion): string {
  return [DRAFT_NOTICE, "", `Site: ${record.site.address}`, `For the design engineer: ${label}. The tool doesn't fill this in.`].join("\n");
}
