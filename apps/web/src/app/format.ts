import type { FitnessGrade, Method, Observation, ObservedValue, Owner, Value, ValueState } from "@eqore/contract";

export function formatValue(value: ObservedValue | null | undefined): string {
  if (!value) return "No value yet";
  switch (value.type) {
    case "quantity":
      return `${value.value} ${value.unit}`;
    case "text":
      return value.value;
    case "boolean":
      return value.value ? "Yes" : "No";
    case "none":
      return "None";
  }
}

export function formatCurrent(value: Value): string {
  if (value.current) return formatValue(value.current);
  if (value.state === "conflicting") return "Not chosen yet";
  if (value.state === "unreadable") return "Couldn't be read";
  return "No value yet";
}

export const STATE_WORDS: Record<ValueState, string> = {
  missing: "Missing",
  conflicting: "Conflicting",
  unreadable: "Unreadable",
  inferred: "Inferred",
  verified: "Verified",
};

export const METHOD_WORDS: Record<Method, string> = {
  source_read: "Read from source",
  assumed: "Assumed",
  computed: "Computed",
  geocoded_interpolated: "Interpolated along the street",
  model_draft: "Draft from photo",
  person_entered: "Entered by a person",
  hand_placed: "Placed by hand",
};

export const GRADE_WORDS: Record<FitnessGrade, string> = {
  reference: "Reference",
  layout: "Layout",
  nameplate: "Nameplate",
};

export const OWNER_WORDS: Record<Owner, string> = {
  public_data: "public data",
  utility: "the utility",
  customer: "the customer",
  engineer: "the engineer",
  qualified_person: "a qualified person",
};

export const CHECK_WORDS = { agrees: "agrees", disagrees: "disagrees", not_checked: "not checked" } as const;

export function observationWord(observation: Observation): string {
  switch (observation.kind) {
    case "verification":
      return "Verified";
    case "unreadable":
      return "Unreadable";
    case "failed_extraction":
      return "Failed reading";
    case "no_value":
      return "No value";
    case "reading":
      return observation.method === "model_draft" ? "Draft" : "Reading";
  }
}

export function locationWords(observation: Observation): string {
  const { attribute, objectId, page, query } = observation.locator;
  return [
    attribute && `attribute ${attribute}`,
    objectId && `object ${objectId}`,
    page && `page ${page}`,
    query && `query: ${query}`,
  ]
    .filter(Boolean)
    .join(", ");
}

export const shortTime = (time: number) =>
  new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
