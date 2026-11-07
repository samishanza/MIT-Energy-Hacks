import { Hono } from "hono";
import { routes } from "@eqore/contract";
import { createCaptureLink, readEvidenceFile, uploadEvidence, type CaptureDeps } from "./capture.ts";
import { checkReadiness } from "./readiness.ts";
import { ApiFailure, confirmValue, correctValue, movePin, resolveConflict, runSite } from "./run.ts";

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

// The engineer API has no login, and sends no CORS headers. It binds to loopback and is never tunneled.
export function createEngineerApp(deps: CaptureDeps): Hono {
  const app = new Hono();
  respondToFailures(app);

  app.post(routes.runSite.path, async (c) => c.json(await runSite(deps, await jsonBody(c.req.raw))));

  app.get(routes.readVersion.path, (c) => {
    const record = deps.store.readVersion(c.req.param("siteId")!, parseVersion(c.req.param("version")!));
    if (!record) throw new ApiFailure("not_found", 404, "No such site or version");
    return c.json(record);
  });

  app.get(routes.readReadiness.path, (c) => {
    const record = deps.store.readVersion(c.req.param("siteId")!, parseVersion(c.req.param("version")!));
    if (!record) throw new ApiFailure("not_found", 404, "No such site or version");
    return c.json(checkReadiness(record));
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
