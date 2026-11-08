import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { CAPTURE_PORT, ENGINEER_PORT, LOOPBACK_HOST } from "@eqore/contract";
import { loadEvidenceManifest, type CaptureDeps } from "./capture.ts";
import { createCaptureApp } from "./capture-server.ts";
import { createClaudeExtractor } from "./extract.ts";
import { createEngineerApp } from "./routes.ts";
import { CloudMirror, cloudConfigFromEnv } from "./cloud-mirror.ts";
import { Store } from "./store.ts";
import { decodeJpeg, liveEarthEngine, readLidarAround } from "@eqore/sources";

try {
  process.loadEnvFile();
} catch {
  // Every setting has a default or reports its absence where it's used.
}

const inRepo = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

const databasePath = resolve(process.env.DATABASE_PATH ?? "./data/site-data.db");
mkdirSync(dirname(databasePath), { recursive: true });

const store = new Store(databasePath);

// With Supabase configured, the cloud is the system of record: sites are reconciled both ways before the API
// listens, and each saved version is pushed in the background. Without it, the API runs on SQLite alone.
const cloud = cloudConfigFromEnv();
if (cloud) {
  const mirror = new CloudMirror(cloud);
  try {
    await mirror.reconcileAll(store);
    console.log("Cloud: Supabase reconciled.");
  } catch (error) {
    console.log(`Cloud: Supabase unreachable at startup (${(error as Error).message}); running on the local store, and saves are pushed when it answers.`);
  }
  store.onVersionSaved = (record) => mirror.versionSaved(store, record);
} else {
  console.log("Cloud: SUPABASE_URL and SUPABASE_SECRET_KEY aren't set; running on the local store only.");
}

const deps: CaptureDeps = {
  store,
  fetch: globalThis.fetch,
  now: () => new Date().toISOString(),
  uploadDir: resolve(process.env.UPLOAD_DIR ?? "./uploads"),
  capturePublicUrl: process.env.CAPTURE_PUBLIC_URL || `http://${LOOPBACK_HOST}:${CAPTURE_PORT}`,
  extractor: createClaudeExtractor(),
  progress: new Map(),
  earthEngine: await liveEarthEngine(),
  readLidar: readLidarAround,
  decodeImage: decodeJpeg,
  evidenceManifest: loadEvidenceManifest(inRepo("fixtures/evidence/manifest.json")),
};

serve({ fetch: createEngineerApp(deps).fetch, hostname: LOOPBACK_HOST, port: ENGINEER_PORT }, ({ address, port }) => {
  console.log(`Engineer API on http://${address}:${port}`);
});

serve({ fetch: createCaptureApp(deps, inRepo("apps/web/dist-capture")).fetch, hostname: LOOPBACK_HOST, port: CAPTURE_PORT }, ({ address, port }) => {
  console.log(`Capture listener on http://${address}:${port}`);
});
