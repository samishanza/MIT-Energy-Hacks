import { Hono, type MiddlewareHandler } from "hono";
import { ENGINEER_PORT, WEB_PORT, routes } from "@eqore/contract";
import { createCaptureLink, readEvidenceFile, uploadEvidence, type CaptureDeps } from "./capture.ts";
import { checkReadiness } from "./readiness.ts";
import { toSiteMap } from "./site-map.ts";
import { toDxf, toKml } from "./export-files.ts";
import { ApiFailure, runProgressKey, confirmValue, correctValue, movePin, resolveConflict, runSite } from "./run.ts";

async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function respondToFailures(app: Hono): void {
  app.onError((error, c) => {
    if (error instanceof ApiFailure) return c.json({ code: error.code, message: error.message }, error.status);
    throw error;
  });
}

function parseVersion(raw: string): number | "latest" {
  if (raw === "latest") return "latest";
  const number = Number(raw);
  if (!Number.isInteger(number) || number < 1) throw new ApiFailure("not_found", 404, `No version ${raw}`);
  return number;
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"].flatMap((host) => [ENGINEER_PORT, WEB_PORT].map((port) => `${host}:${port}`)));

// With no login, binding to loopback doesn't stop a web page in the engineer's browser from posting here,
// or a rebound DNS name from reaching it, so every request must come from this app's own origin.
const localOriginOnly: MiddlewareHandler = async (c, next) => {
  const host = c.req.header("host");
  const origin = c.req.header("origin");
  const originHost = origin?.replace(/^https?:\/\//, "");
  if ((host !== undefined && !LOCAL_HOSTS.has(host)) || (originHost !== undefined && !LOCAL_HOSTS.has(originHost))) {
    throw new ApiFailure("illegal_transition", 403, "This API only accepts requests from the local app.");
  }
  await next();
};

// The engineer API has no login, and sends no CORS headers. It binds to loopback and is never tunneled.
export function createEngineerApp(deps: CaptureDeps): Hono {
  const app = new Hono();
  respondToFailures(app);
  app.use("*", localOriginOnly);

  app.post(routes.runSite.path, async (c) => c.json(await runSite(deps, await jsonBody(c.req.raw))));

  app.get(routes.readRunProgress.path, (c) => {
    const progress = deps.progress?.get(runProgressKey(c.req.query("address") ?? ""));
    if (!progress) throw new ApiFailure("not_found", 404, "No run for that address");
    return c.json(progress);
  });

  const requestedVersion = (siteId: string, version: string) => {
    const record = deps.store.readVersion(siteId, parseVersion(version));
    if (!record) throw new ApiFailure("not_found", 404, "No such site or version");
    return record;
  };

  app.get(routes.readVersion.path, (c) => c.json(requestedVersion(c.req.param("siteId")!, c.req.param("version")!)));
  app.get(routes.readReadiness.path, (c) => c.json(checkReadiness(requestedVersion(c.req.param("siteId")!, c.req.param("version")!))));

  app.get(routes.readSiteMap.path, (c) => c.json(toSiteMap(requestedVersion(c.req.param("siteId")!, c.req.param("version")!), deps.now())));

  const download = (text: string, type: string, name: string) =>
    new Response(text, { headers: { "content-type": type, "content-disposition": `attachment; filename="${name}"` } });
  app.get(routes.exportDxf.path, (c) => {
    const record = requestedVersion(c.req.param("siteId")!, c.req.param("version")!);
    return download(toDxf(record, deps.now()), "application/dxf", `${record.site.id}-v${record.version}.dxf`);
  });
  app.get(routes.exportKml.path, (c) => {
    const record = requestedVersion(c.req.param("siteId")!, c.req.param("version")!);
    return download(toKml(record, deps.now()), "application/vnd.google-earth.kml+xml", `${record.site.id}-v${record.version}.kml`);
  });

  app.post(routes.confirmValue.path, async (c) =>
    c.json(confirmValue(deps, c.req.param("siteId")!, c.req.param("field")!, await jsonBody(c.req.raw))),
  );
  app.post(routes.correctValue.path, async (c) =>
    c.json(correctValue(deps, c.req.param("siteId")!, c.req.param("field")!, await jsonBody(c.req.raw))),
  );
  app.post(routes.resolveConflict.path, async (c) =>
    c.json(resolveConflict(deps, c.req.param("siteId")!, c.req.param("field")!, await jsonBody(c.req.raw))),
  );
  app.post(routes.movePin.path, async (c) => c.json(movePin(deps, c.req.param("siteId")!, await jsonBody(c.req.raw))));

  app.post(routes.createCaptureLink.path, async (c) => c.json(createCaptureLink(deps, c.req.param("siteId")!, await jsonBody(c.req.raw))));
  app.post(routes.uploadEvidence.path, async (c) =>
    c.json(await uploadEvidence(deps, c.req.param("siteId")!, c.req.param("field")!, await c.req.parseBody())),
  );
  app.get(routes.readEvidenceFile.path, (c) => {
    const file = readEvidenceFile(deps, c.req.param("evidenceFileId")!);
    return c.body(Buffer.from(file.bytes), 200, { "content-type": file.contentType, "x-content-type-options": "nosniff" });
  });

  return app;
}
