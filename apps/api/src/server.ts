import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { CAPTURE_PORT, ENGINEER_PORT, LOOPBACK_HOST } from "@eqore/contract";
import { loadEvidenceManifest, type CaptureDeps } from "./capture.ts";
import { createCaptureApp } from "./capture-server.ts";
import { createClaudeExtractor } from "./extract.ts";
import { createEngineerApp } from "./routes.ts";
import { Store } from "./store.ts";
import { liveEarthEngine, readLidarAround } from "@eqore/sources";

try {
  process.loadEnvFile();
} catch {
  // Every setting has a default or reports its absence where it's used.
}

const inRepo = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

const databasePath = resolve(process.env.DATABASE_PATH ?? "./data/site-data.db");
mkdirSync(dirname(databasePath), { recursive: true });

const deps: CaptureDeps = {
  store: new Store(databasePath),
  fetch: globalThis.fetch,
  now: () => new Date().toISOString(),
  uploadDir: resolve(process.env.UPLOAD_DIR ?? "./uploads"),
  capturePublicUrl: process.env.CAPTURE_PUBLIC_URL || `http://${LOOPBACK_HOST}:${CAPTURE_PORT}`,
  extractor: createClaudeExtractor(),
  progress: new Map(),
  earthEngine: await liveEarthEngine(),
  readLidar: readLidarAround,
  evidenceManifest: loadEvidenceManifest(inRepo("fixtures/evidence/manifest.json")),
};

serve({ fetch: createEngineerApp(deps).fetch, hostname: LOOPBACK_HOST, port: ENGINEER_PORT }, ({ address, port }) => {
  console.log(`Engineer API on http://${address}:${port}`);
});

serve({ fetch: createCaptureApp(deps, inRepo("apps/web/dist-capture")).fetch, hostname: LOOPBACK_HOST, port: CAPTURE_PORT }, ({ address, port }) => {
  console.log(`Capture listener on http://${address}:${port}`);
});
