// Scores the lidar detector against every site with a traced drawing set.
// Usage: node scripts/eval/run-eval.ts [--params params.json] [--out result.json]
// See scripts/eval/harness.ts for the manifest.
import { readFileSync, writeFileSync } from "node:fs";
import { DEFAULT_PARAMS, type DetectorParams } from "../../packages/sources/src/checks/lidar-equipment.ts";
import { evaluate, loadManifest, prepare, table } from "./harness.ts";

const args = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const paramsPath = option("--params");
const params = paramsPath ? (JSON.parse(readFileSync(paramsPath, "utf8")) as DetectorParams) : DEFAULT_PARAMS;

const results = [];
for (const entry of loadManifest()) {
  const site = await prepare(entry);
  results.push(evaluate(site, params));
}
console.log(table(results));
const out = option("--out");
if (out) writeFileSync(out, JSON.stringify({ params, results }, null, 2));
