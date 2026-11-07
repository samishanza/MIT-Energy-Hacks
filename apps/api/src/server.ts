import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { ENGINEER_PORT, LOOPBACK_HOST } from "@eqore/contract";
import { createEngineerApp } from "./routes.ts";
import { Store } from "./store.ts";

try {
  process.loadEnvFile();
} catch {
  // No .env file: every setting has a default or reports its absence where it's used.
}

const databasePath = resolve(process.env.DATABASE_PATH ?? "./data/site-data.db");
mkdirSync(dirname(databasePath), { recursive: true });

const deps = { store: new Store(databasePath), fetch: globalThis.fetch, now: () => new Date().toISOString() };

serve({ fetch: createEngineerApp(deps).fetch, hostname: LOOPBACK_HOST, port: ENGINEER_PORT }, ({ address, port }) => {
  console.log(`Engineer API on http://${address}:${port}`);
});
