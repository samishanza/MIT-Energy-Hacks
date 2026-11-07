import { z } from "zod";

// Bumped by the contract owner whenever a shape changes, so both worktrees can check they match.
export const CONTRACT_VERSION = "4";

export const VALUE_STATES = ["missing", "conflicting", "unreadable", "inferred", "verified"] as const;
export const ValueStateSchema = z.enum(VALUE_STATES);
export type ValueState = z.infer<typeof ValueStateSchema>;

// Separate from state: a verified value isn't necessarily survey accurate.
export const FITNESS_GRADES = ["reference", "layout", "nameplate"] as const;
export const FitnessGradeSchema = z.enum(FITNESS_GRADES);
export type FitnessGrade = z.infer<typeof FitnessGradeSchema>;

export const OWNERS = ["public_data", "utility", "customer", "engineer", "qualified_person"] as const;
export const OwnerSchema = z.enum(OWNERS);
export type Owner = z.infer<typeof OwnerSchema>;

export const METHODS = [
  "source_read", // read straight from a public source
  "assumed",
  "computed", // derived by a deterministic check
  "geocoded_interpolated", // a point along the street, not a located building
  "model_draft", // drafted by an LLM from a photo or bill; never a verified value
  "person_entered",
  "hand_placed", // a pin placed by a person rather than taken from GPS
] as const;
export const MethodSchema = z.enum(METHODS);
export type Method = z.infer<typeof MethodSchema>;

export const SOURCE_KINDS = ["arcgis_rest", "json_api", "earth_engine", "geocoder", "human_evidence"] as const;
export const SourceKindSchema = z.enum(SOURCE_KINDS);

const nonBlank = z.string().trim().min(1);
const isoDateTime = z.iso.datetime({ offset: true });
const fieldKey = z.string().regex(/^[a-z][a-z0-9_]*$/, "Field keys are snake_case");

export const SourceSchema = z.object({
  id: nonBlank,
  name: nonBlank,
  kind: SourceKindSchema,
  dataOrigin: z.enum(["real", "synthetic"]),
  url: z.url().optional(),
  layer: z.string().optional(),
  licenseNote: z.string().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

// "none" is a value that can be verified ("no existing PV"). Missing means we don't know,
// and is represented by the value's state, never by a typed value here.
export const ObservedValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("quantity"), value: z.number(), unit: nonBlank }),
  z.object({ type: z.literal("text"), value: z.string() }),
  z.object({ type: z.literal("boolean"), value: z.boolean() }),
  z.object({ type: z.literal("none") }),
]);
export type ObservedValue = z.infer<typeof ObservedValueSchema>;

export const EvidenceRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("observation"), observationId: nonBlank }),
  z.object({ kind: z.literal("document"), description: nonBlank }),
]);
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const VerificationSchema = z.object({
  verifierName: nonBlank,
  verifiedAt: isoDateTime,
  evidence: z.array(EvidenceRefSchema).min(1),
});
export type Verification = z.infer<typeof VerificationSchema>;

// A repeat read with the same identity is appended but can't change a value's state.
export const EvidenceIdentitySchema = z.object({
  sourceId: nonBlank,
  query: nonBlank,
  contentHash: nonBlank,
});
export type EvidenceIdentity = z.infer<typeof EvidenceIdentitySchema>;

// Where the value sits within its source: a layer and attribute, a page, or an image region.
export const LocatorSchema = z.object({
  query: z.string().optional(),
  attribute: z.string().optional(),
  objectId: z.string().optional(),
  page: z.number().int().positive().optional(),
  imageRegion: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .optional(),
  evidenceFileId: z.string().optional(),
});

export const OBSERVATION_KINDS = [
  "reading", // a source or draft supplied a value
  "no_value", // a source was asked and supplied nothing usable, with the reason
  "unreadable", // evidence exists but can't be read
  "failed_extraction", // a transport or API error; the file is kept and can be retried
  "verification", // a named person confirmed, corrected, chose, or entered a value
] as const;

export const ObservationSchema = z
  .object({
    id: nonBlank,
    siteId: nonBlank,
    field: fieldKey,
    kind: z.enum(OBSERVATION_KINDS),
    value: ObservedValueSchema.nullable(),
    source: SourceSchema,
    retrievedAt: isoDateTime,
    sourceDate: z.string().nullable(),
    method: MethodSchema,
    locator: LocatorSchema,
    identity: EvidenceIdentitySchema,
    grade: FitnessGradeSchema.optional(),
    reason: z.string().optional(),
    verification: VerificationSchema.optional(),
    synthetic: z.boolean(),
  })
  .superRefine((obs, ctx) => {
    if ((obs.source.dataOrigin === "synthetic") !== obs.synthetic) {
      ctx.addIssue({
        code: "custom",
        path: ["synthetic"],
        message: "The synthetic flag must match the source's data origin",
      });
    }
    if (obs.kind === "verification") {
      if (!obs.verification) {
        ctx.addIssue({
          code: "custom",
          path: ["verification"],
          message: "A verification needs a named person and evidence",
        });
      }
      if (obs.method === "model_draft") {
        ctx.addIssue({
          code: "custom",
          path: ["method"],
          message: "Model output is never the source of a verification",
        });
      }
    }
  });
export type Observation = z.infer<typeof ObservationSchema>;

export const CandidateSchema = z.object({
  id: nonBlank,
  value: ObservedValueSchema,
  observationId: nonBlank,
  sourceName: nonBlank,
  // Details shown with a candidate, such as a feeder's substation, voltage, and capacity.
  attributes: z.record(z.string(), ObservedValueSchema).optional(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export const VALUE_FAMILIES = ["physical", "utility", "energy", "customer", "decision"] as const;

// One source checked against another. "not_checked" says a check couldn't run, so a clean result can't be assumed.
export const CrossCheckSchema = z.object({
  label: nonBlank,
  result: z.enum(["agrees", "disagrees", "not_checked"]),
  detail: z.string().optional(),
});
export type CrossCheck = z.infer<typeof CrossCheckSchema>;

export const ValueSchema = z
  .object({
    field: fieldKey,
    label: nonBlank,
    state: ValueStateSchema,
    grade: FitnessGradeSchema.nullable(),
    owner: OwnerSchema,
    current: ObservedValueSchema.nullable(),
    method: MethodSchema.optional(),
    candidates: z.array(CandidateSchema),
    // Reported apart: sources disagreeing is a finding, nearby feeders aren't.
    conflictKind: z.enum(["source_disagreement", "feeder_candidates", "listed_candidates"]).optional(),
    observationIds: z.array(nonBlank),
    verification: VerificationSchema.optional(),
    reason: z.string().optional(),
    flags: z.array(z.string()),
    family: z.enum(VALUE_FAMILIES).optional(),
    // The reading this value currently rests on. A confirm must name it, so nobody verifies a value they didn't see.
    currentObservationId: nonBlank.optional(),
    crossChecks: z.array(CrossCheckSchema).optional(),
    synthetic: z.boolean(),
  })
  .superRefine((value, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    switch (value.state) {
      case "missing":
      case "unreadable":
        if (value.current) issue("current", `A ${value.state} value has no current value`);
        break;
      case "conflicting":
        if (value.candidates.length < 2) issue("candidates", "A conflict keeps at least two candidates");
        if (value.current) issue("current", "A conflict has no current value until a person chooses");
        if (!value.conflictKind) issue("conflictKind", "A conflict names its kind");
        if (!value.grade) issue("grade", "A conflicting value has a fitness grade");
        break;
      case "inferred":
        if (!value.current) issue("current", "An inferred value has a current value");
        if (!value.method) issue("method", "An inferred value names its method");
        if (!value.grade) issue("grade", "An inferred value has a fitness grade");
        break;
      case "verified":
        if (!value.current) issue("current", "A verified value has a current value");
        if (!value.verification) issue("verification", "A verified value needs a named person and evidence");
        if (!value.grade) issue("grade", "A verified value has a fitness grade");
        break;
    }
  });
export type Value = z.infer<typeof ValueSchema>;

const position = z.tuple([z.number(), z.number()]);
export const GeometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: position }),
  z.object({ type: z.literal("LineString"), coordinates: z.array(position) }),
  z.object({ type: z.literal("MultiLineString"), coordinates: z.array(z.array(position)) }),
  z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(position)) }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(z.array(position))) }),
]);
export type Geometry = z.infer<typeof GeometrySchema>;

export const MapFeatureSchema = z.object({
  id: nonBlank,
  kind: z.enum(["property_line", "building_outline", "utility_line", "existing_equipment", "capture_pin", "dimension_line", "candidate_area", "substation", "road", "constraint"]),
  // The value this feature shows, which carries its source and state.
  field: fieldKey,
  geometry: GeometrySchema,
  label: z.string().optional(),
  placedByHand: z.boolean().optional(),
  // Facts about this one item, such as a candidate area's size or a substation's name and distance.
  attributes: z.record(z.string(), ObservedValueSchema).optional(),
});
export type MapFeature = z.infer<typeof MapFeatureSchema>;

export const BaseMapSchema = z.object({
  tileUrlTemplate: nonBlank,
  attribution: nonBlank,
  sourceId: nonBlank,
  sourceDate: z.string().nullable(),
  maxZoom: z.number().int().positive(),
  center: position,
  zoom: z.number(),
});
export type BaseMap = z.infer<typeof BaseMapSchema>;

export const SourceRunSchema = z.object({
  sourceId: nonBlank,
  name: nonBlank,
  status: z.enum(["pending", "done", "missing", "snapshot", "person_only"]),
  reason: z.string().optional(),
});
export type SourceRun = z.infer<typeof SourceRunSchema>;

export const SiteSchema = z.object({
  id: nonBlank,
  address: nonBlank,
  region: nonBlank,
  location: position.nullable(),
  locationMethod: MethodSchema.nullable(),
  // A labeled trial of the phone capture, such as one at the venue. Not a customer site.
  captureTest: z.boolean().optional(),
});
export type Site = z.infer<typeof SiteSchema>;

// Plan-set catalog fields this record fills, and who must supply the rest.
export const CoverageSchema = z.object({
  filled: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  byOwner: z.partialRecord(OwnerSchema, z.number().int().nonnegative()),
});
export type Coverage = z.infer<typeof CoverageSchema>;

export const RecordVersionSchema = z.object({
  id: nonBlank,
  contractVersion: nonBlank,
  version: z.number().int().positive(),
  createdAt: isoDateTime,
  trigger: z.enum(["run", "human_action", "capture"]),
  // True when served from recorded data, so the UI can label it.
  snapshot: z.boolean(),
  synthetic: z.boolean(),
  site: SiteSchema,
  values: z.array(ValueSchema),
  observations: z.array(ObservationSchema),
  features: z.array(MapFeatureSchema),
  baseMap: BaseMapSchema.nullable(),
  sourceRuns: z.array(SourceRunSchema),
  coverage: CoverageSchema.optional(),
});
export type RecordVersion = z.infer<typeof RecordVersionSchema>;

export const ReadinessItemSchema = z
  .object({
    id: nonBlank,
    // Form rows cite the utility form. Input rows feed a drawing the form requires.
    rowKind: z.enum(["form", "input"]),
    label: nonBlank,
    citation: nonBlank,
    parentItemId: nonBlank.optional(),
    teamDerived: z.boolean(),
    fields: z.array(fieldKey),
    minState: ValueStateSchema,
    owner: OwnerSchema,
    status: z.enum(["has_evidence", "needs_evidence", "preview_only", "engineer_owned"]),
    // For a drawing: how many of its input rows have evidence.
    inputsWithEvidence: z
      .object({ have: z.number().int().nonnegative(), total: z.number().int().nonnegative() })
      .optional(),
  })
  .superRefine((item, ctx) => {
    if (item.rowKind === "input" && (!item.parentItemId || !item.teamDerived)) {
      ctx.addIssue({
        code: "custom",
        path: ["teamDerived"],
        message: "An input row names its parent drawing and is labeled team-derived",
      });
    }
  });
export type ReadinessItem = z.infer<typeof ReadinessItemSchema>;

export const GAP_ROUTES = [
  "capture_photo",
  "capture_bill",
  "pre_application_report",
  "customer_record",
  "qualified_person",
  "engineer",
] as const;

export const GapSchema = z
  .object({
    id: nonBlank,
    rank: z.number().int().positive(),
    request: nonBlank,
    route: z.enum(GAP_ROUTES),
    owner: OwnerSchema,
    field: fieldKey,
    rowsFilled: z.array(nonBlank),
    routeCost: z.number().int().nonnegative(),
    captureLinkAllowed: z.boolean(),
    // A draft for a person to review and send. The tool never sends it.
    draftRequest: z.string().optional(),
  })
  .superRefine((gap, ctx) => {
    const phoneRoute = gap.route === "capture_photo" || gap.route === "capture_bill";
    if (gap.captureLinkAllowed !== phoneRoute) {
      ctx.addIssue({
        code: "custom",
        path: ["captureLinkAllowed"],
        message: "Only photo and bill requests offer a capture link",
      });
    }
  });
export type Gap = z.infer<typeof GapSchema>;

const countSchema = z.object({
  withEvidence: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const ReadinessShareSchema = z.object({
  formRows: countSchema,
  inputRows: countSchema,
  byOwner: z.partialRecord(OwnerSchema, countSchema),
});

export const RequirementsTableSchema = z.object({
  utility: nonBlank,
  form: nonBlank,
  formDate: nonBlank,
  // True when built from a form we know has been replaced.
  superseded: z.boolean(),
});

export const ReadinessReportSchema = z
  .object({
    recordVersionId: nonBlank,
    synthetic: z.boolean(),
    requirementsTable: RequirementsTableSchema.nullable(),
    noTableReason: z.string().optional(),
    items: z.array(ReadinessItemSchema),
    gaps: z.array(GapSchema),
    share: ReadinessShareSchema.nullable(),
  })
  .superRefine((report, ctx) => {
    if (!report.requirementsTable && (report.share || !report.noTableReason)) {
      ctx.addIssue({
        code: "custom",
        path: ["share"],
        message: "With no requirements table, give the reason and show no readiness share",
      });
    }
  });
export type ReadinessReport = z.infer<typeof ReadinessReportSchema>;

// Shown on every capture prompt. An EQORE engineer should review this wording before real use.
export const DOORS_CLOSED_SAFETY_TEXT =
  "Keep all doors and covers closed. Photograph only what you can see from outside. Do not open, unbolt, or reach into electrical equipment.";

export const CaptureLinkSchema = z.object({
  id: nonBlank,
  siteId: nonBlank,
  field: fieldKey,
  url: nonBlank,
  status: z.enum(["open", "closed", "expired"]),
  expiresAt: isoDateTime,
  uploadsUsed: z.number().int().nonnegative(),
  maxUploads: z.number().int().positive(),
});
export type CaptureLink = z.infer<typeof CaptureLinkSchema>;

// What the phone page gets. It carries nothing from the engineer's record beyond this request.
export const CaptureRequestSchema = z.object({
  field: fieldKey,
  label: nonBlank,
  question: nonBlank,
  accepts: z.enum(["photo", "bill"]),
  safetyText: nonBlank,
  aerial: BaseMapSchema.nullable(),
  pin: position.nullable(),
  synthetic: z.boolean(),
});
export type CaptureRequest = z.infer<typeof CaptureRequestSchema>;

// Sent as form fields alongside the uploaded file. Every position field is optional,
// because a photo without a location is still accepted.
export const CaptureMetadataSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracyMeters: z.number().nonnegative().optional(),
  headingDegrees: z.number().min(0).lt(360).optional(),
});
export type CaptureMetadata = z.infer<typeof CaptureMetadataSchema>;

export const CaptureResultSchema = z.object({
  evidenceFileId: nonBlank,
  // Nothing is verified yet. A person still has to confirm the reading.
  state: z.enum(["inferred", "unreadable", "extraction_failed"]),
  positionStatus: z.enum(["placed", "needs_pin", "outside_parcel"]),
});
export type CaptureResult = z.infer<typeof CaptureResultSchema>;

export const ERROR_CODES = [
  "invalid_token",
  "token_closed",
  "token_expired",
  "upload_limit",
  "file_too_large",
  "file_type",
  "verifier_required",
  "evidence_required",
  "illegal_transition",
  "not_found",
  "source_failed",
  "stale_value",
] as const;

export const ApiErrorSchema = z.object({
  code: z.enum(ERROR_CODES),
  message: nonBlank,
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// Goes out with every export, so the site map can't be read as a construction document downstream.
export const CONCEPT_GRADE_NOTE = "Concept-grade. Not surveyed. Not a construction document.";

// The generated site map, for an agent or a drawing step. GeoJSON, so any map or CAD tool can read it.
// Each feature keeps its value's state: consumers can trust what they choose, but can't lose what's unverified.
export const SiteMapExportSchema = z.object({
  contractVersion: nonBlank,
  recordVersionId: nonBlank,
  version: z.number().int().positive(),
  generatedAt: isoDateTime,
  note: z.literal(CONCEPT_GRADE_NOTE),
  snapshot: z.boolean(),
  synthetic: z.boolean(),
  site: SiteSchema,
  baseMap: BaseMapSchema.nullable(),
  features: z.object({
    type: z.literal("FeatureCollection"),
    features: z.array(
      z.object({
        type: z.literal("Feature"),
        id: nonBlank,
        geometry: GeometrySchema,
        properties: z.object({
          kind: MapFeatureSchema.shape.kind,
          field: fieldKey,
          label: z.string().optional(),
          placedByHand: z.boolean().optional(),
          attributes: z.record(z.string(), ObservedValueSchema).optional(),
          state: ValueStateSchema,
          grade: FitnessGradeSchema.nullable(),
          owner: OwnerSchema,
          synthetic: z.boolean(),
        }),
      }),
    ),
  }),
  // Every value, including what's missing. Evidence stays on the record version this names.
  values: z.array(ValueSchema),
  coverage: CoverageSchema.optional(),
});
export type SiteMapExport = z.infer<typeof SiteMapExportSchema>;

// What's known during a run. A record version is still created only when the run ends.
export const RunProgressSchema = z.object({
  status: z.enum(["running", "done", "failed"]),
  site: SiteSchema.optional(),
  sourceRuns: z.array(SourceRunSchema),
  features: z.array(MapFeatureSchema),
  reason: z.string().optional(),
});
export type RunProgress = z.infer<typeof RunProgressSchema>;

export const CaptureSampleSchema = z.object({
  synthetic: z.literal(true),
  link: CaptureLinkSchema,
  request: CaptureRequestSchema,
  metadata: CaptureMetadataSchema,
  result: CaptureResultSchema,
});
