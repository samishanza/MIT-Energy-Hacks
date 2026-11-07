import {
  ApiErrorSchema,
  CaptureLinkSchema,
  CaptureResultSchema,
  ReadinessReportSchema,
  RecordVersionSchema,
  routes,
  RunSiteResponseSchema,
  type CaptureLink,
  type CaptureMetadata,
  type CaptureResult,
  type EvidenceRef,
  type MovePinRequestSchema,
  type ObservedValue,
  type ReadinessReport,
  type RecordVersion,
  type RunSiteRequestSchema,
} from "@eqore/contract";

export type RunSiteRequest = (typeof RunSiteRequestSchema)["_output"];
export type RunSiteResponse = (typeof RunSiteResponseSchema)["_output"];
export type MovePinRequest = (typeof MovePinRequestSchema)["_output"];

export interface Actor {
  verifierName: string;
  evidence: EvidenceRef[];
}

export class ApiRequestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface EngineerApi {
  runSite(request: RunSiteRequest): Promise<RunSiteResponse>;
  readVersion(siteId: string, version: number | "latest"): Promise<RecordVersion>;
  readReadiness(siteId: string, version: number | "latest"): Promise<ReadinessReport>;
  confirmValue(siteId: string, field: string, actor: Actor): Promise<RecordVersion>;
  correctValue(siteId: string, field: string, request: Actor & { value: ObservedValue }): Promise<RecordVersion>;
  resolveConflict(siteId: string, field: string, request: Actor & { candidateId: string }): Promise<RecordVersion>;
  movePin(siteId: string, request: MovePinRequest): Promise<RecordVersion>;
  createCaptureLink(siteId: string, field: string): Promise<CaptureLink>;
  uploadEvidence(siteId: string, field: string, file: File, metadata?: CaptureMetadata): Promise<CaptureResult>;
  evidenceUrl(evidenceFileId: string): string;
}

function fill(path: string, params: Record<string, string | number>): string {
  return path.replace(/:([A-Za-z]+)/g, (_, name: string) => encodeURIComponent(String(params[name])));
}

async function send<T>(schema: { parse(data: unknown): T }, path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiRequestError("network", "The API isn't reachable.");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = ApiErrorSchema.safeParse(body);
    if (error.success) throw new ApiRequestError(error.data.code, error.data.message);
    throw new ApiRequestError("unknown", `The API returned ${response.status}.`);
  }
  return schema.parse(body);
}

const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const httpApi: EngineerApi = {
  runSite: (request) => send(RunSiteResponseSchema, routes.runSite.path, postJson(request)),
  readVersion: (siteId, version) =>
    send(RecordVersionSchema, fill(routes.readVersion.path, { siteId, version })),
  readReadiness: (siteId, version) =>
    send(ReadinessReportSchema, fill(routes.readReadiness.path, { siteId, version })),
  confirmValue: (siteId, field, actor) =>
    send(RecordVersionSchema, fill(routes.confirmValue.path, { siteId, field }), postJson(actor)),
  correctValue: (siteId, field, request) =>
    send(RecordVersionSchema, fill(routes.correctValue.path, { siteId, field }), postJson(request)),
  resolveConflict: (siteId, field, request) =>
    send(RecordVersionSchema, fill(routes.resolveConflict.path, { siteId, field }), postJson(request)),
  movePin: (siteId, request) => send(RecordVersionSchema, fill(routes.movePin.path, { siteId }), postJson(request)),
  createCaptureLink: (siteId, field) =>
    send(CaptureLinkSchema, fill(routes.createCaptureLink.path, { siteId }), postJson({ field })),
  uploadEvidence: (siteId, field, file, metadata = {}) => {
    const form = new FormData();
    form.append("file", file);
    for (const [name, value] of Object.entries(metadata)) form.append(name, String(value));
    return send(CaptureResultSchema, fill(routes.uploadEvidence.path, { siteId, field }), {
      method: "POST",
      body: form,
    });
  },
  evidenceUrl: (evidenceFileId) => fill(routes.readEvidenceFile.path, { evidenceFileId }),
};
