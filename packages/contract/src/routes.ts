import { z } from "zod";
import {
  CaptureLinkSchema,
  CaptureMetadataSchema,
  CaptureRequestSchema,
  CaptureResultSchema,
  EvidenceRefSchema,
  ObservedValueSchema,
  ReadinessReportSchema,
  SiteMapExportSchema,
  RecordVersionSchema,
} from "./schemas.ts";

// The engineer API has no login, so it stays on loopback and is never tunneled.
// A tunnel may point at the capture listener only.
export const ENGINEER_PORT = 8787;
export const CAPTURE_PORT = 8788;
export const WEB_PORT = 5173;
export const LOOPBACK_HOST = "127.0.0.1";

const actor = {
  verifierName: z.string().trim().min(1),
  evidence: z.array(EvidenceRefSchema).min(1),
};

export const RunSiteRequestSchema = z.object({
  address: z.string().trim().min(1),
  // Sent on the second call, after the engineer settles an address with no single match.
  choice: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("candidate"), candidateId: z.string().min(1) }),
      z.object({ kind: z.literal("pin"), latitude: z.number(), longitude: z.number() }),
    ])
    .optional(),
});

// On zero or several matches, no site values are stored until the engineer chooses.
export const RunSiteResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), record: RecordVersionSchema }),
  z.object({
    status: z.literal("needs_choice"),
    candidates: z.array(
      z.object({ id: z.string().min(1), label: z.string().min(1), source: z.string().min(1) }),
    ),
  }),
]);

export const ConfirmValueRequestSchema = z.object(actor);
export const CorrectValueRequestSchema = z.object({ ...actor, value: ObservedValueSchema });
export const ResolveConflictRequestSchema = z.object({ ...actor, candidateId: z.string().min(1) });
export const CreateCaptureLinkRequestSchema = z.object({ field: z.string().min(1) });
export const MovePinRequestSchema = z.object({
  field: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  placedBy: z.string().trim().min(1),
});
const noBody = z.undefined();
const fileUpload = CaptureMetadataSchema; // multipart: a `file` part plus these fields

type Route<Req extends z.ZodType, Res extends z.ZodType> = {
  method: "GET" | "POST";
  path: string;
  listener: "engineer" | "capture";
  request: Req;
  response: Res;
};

function route<Req extends z.ZodType, Res extends z.ZodType>(r: Route<Req, Res>) {
  return r;
}

export const routes = {
  runSite: route({
    method: "POST",
    path: "/api/sites/run",
    listener: "engineer",
    request: RunSiteRequestSchema,
    response: RunSiteResponseSchema,
  }),
  readVersion: route({
    method: "GET",
    // :version is a number or "latest"
    path: "/api/sites/:siteId/versions/:version",
    listener: "engineer",
    request: noBody,
    response: RecordVersionSchema,
  }),
  readReadiness: route({
    method: "GET",
    path: "/api/sites/:siteId/versions/:version/readiness",
    listener: "engineer",
    request: noBody,
    response: ReadinessReportSchema,
  }),
  readSiteMap: route({
    method: "GET",
    path: "/api/sites/:siteId/versions/:version/site-map",
    listener: "engineer",
    request: noBody,
    response: SiteMapExportSchema,
  }),
  confirmValue: route({
    method: "POST",
    path: "/api/sites/:siteId/values/:field/confirm",
    listener: "engineer",
    request: ConfirmValueRequestSchema,
    response: RecordVersionSchema,
  }),
  // Also how a person enters a value when no draft exists.
  correctValue: route({
    method: "POST",
    path: "/api/sites/:siteId/values/:field/correct",
    listener: "engineer",
    request: CorrectValueRequestSchema,
    response: RecordVersionSchema,
  }),
  resolveConflict: route({
    method: "POST",
    path: "/api/sites/:siteId/values/:field/resolve",
    listener: "engineer",
    request: ResolveConflictRequestSchema,
    response: RecordVersionSchema,
  }),
  movePin: route({
    method: "POST",
    path: "/api/sites/:siteId/pins",
    listener: "engineer",
    request: MovePinRequestSchema,
    response: RecordVersionSchema,
  }),
  createCaptureLink: route({
    method: "POST",
    path: "/api/sites/:siteId/capture-links",
    listener: "engineer",
    request: CreateCaptureLinkRequestSchema,
    response: CaptureLinkSchema,
  }),
  // The fallback when the tunnel is down. Recorded as uploaded by the engineer, with a hand-placed pin.
  uploadEvidence: route({
    method: "POST",
    path: "/api/sites/:siteId/values/:field/evidence",
    listener: "engineer",
    request: fileUpload,
    response: CaptureResultSchema,
  }),
  // Serves the stored original.
  readEvidenceFile: route({
    method: "GET",
    path: "/api/evidence/:evidenceFileId",
    listener: "engineer",
    request: noBody,
    response: z.instanceof(Uint8Array),
  }),
  readCaptureRequest: route({
    method: "GET",
    path: "/capture/:token",
    listener: "capture",
    request: noBody,
    response: CaptureRequestSchema,
  }),
  submitCapture: route({
    method: "POST",
    path: "/capture/:token/submit",
    listener: "capture",
    request: fileUpload,
    response: CaptureResultSchema,
  }),
};
