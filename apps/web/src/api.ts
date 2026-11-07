import {
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
import { ApiRequestError, send as sendWith, uploadForm } from "./app/http";

export { ApiRequestError };

export type RunSiteRequest = (typeof RunSiteRequestSchema)["_output"];
export type RunSiteResponse = (typeof RunSiteResponseSchema)["_output"];
export type MovePinRequest = (typeof MovePinRequestSchema)["_output"];

export interface Actor {
  verifierName: string;
  evidence: EvidenceRef[];
}

export interface EngineerApi {
  runSite(request: RunSiteRequest): Promise<RunSiteResponse>;
  readVersion(siteId: string, version: number | "latest"): Promise<RecordVersion>;
  readReadiness(siteId: string, version: number | "latest"): Promise<ReadinessReport>;
  confirmValue(siteId: string, field: string, request: Actor & { expectedObservationId: string }): Promise<RecordVersion>;
  correctValue(siteId: string, field: string, request: Actor & { value: ObservedValue }): Promise<RecordVersion>;
  resolveConflict(siteId: string, field: string, request: Actor & { candidateId: string }): Promise<RecordVersion>;
  movePin(siteId: string, request: MovePinRequest): Promise<RecordVersion>;
  createCaptureLink(siteId: string, field: string): Promise<CaptureLink>;
  uploadEvidence(siteId: string, field: string, file: File, metadata?: CaptureMetadata): Promise<CaptureResult>;
  evidenceUrl(evidenceFileId: string): string;
  // The contract serves a stored file's bytes without naming its type, so the type is read from the response.
  evidenceKind?(evidenceFileId: string): Promise<"image" | "pdf">;
}

function fill(path: string, params: Record<string, string | number>): string {
  return path.replace(/:([A-Za-z]+)/g, (_, name: string) => encodeURIComponent(String(params[name])));
}

const send = <T>(schema: { parse(data: unknown): T }, path: string, init?: RequestInit) =>
  sendWith(schema, path, init, { unreachable: "The API isn't reachable.", unknownCode: "unknown", serverName: "API" });

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
  confirmValue: (siteId, field, request) =>
    send(RecordVersionSchema, fill(routes.confirmValue.path, { siteId, field }), postJson(request)),
  correctValue: (siteId, field, request) =>
    send(RecordVersionSchema, fill(routes.correctValue.path, { siteId, field }), postJson(request)),
  resolveConflict: (siteId, field, request) =>
    send(RecordVersionSchema, fill(routes.resolveConflict.path, { siteId, field }), postJson(request)),
  movePin: (siteId, request) => send(RecordVersionSchema, fill(routes.movePin.path, { siteId }), postJson(request)),
  createCaptureLink: (siteId, field) =>
    send(CaptureLinkSchema, fill(routes.createCaptureLink.path, { siteId }), postJson({ field })),
  uploadEvidence: (siteId, field, file, metadata = {}) =>
    send(CaptureResultSchema, fill(routes.uploadEvidence.path, { siteId, field }), {
      method: "POST",
      body: uploadForm(file, metadata),
    }),
  evidenceUrl: (evidenceFileId) => fill(routes.readEvidenceFile.path, { evidenceFileId }),
  evidenceKind: async (evidenceFileId) => {
    const url = fill(routes.readEvidenceFile.path, { evidenceFileId });
    const response = await fetch(url, { method: "HEAD" }).catch(() => null);
    return response?.headers.get("content-type")?.includes("pdf") ? "pdf" : "image";
  },
};
