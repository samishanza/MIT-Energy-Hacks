// Tunes the detector's thresholds against the sites with traced drawing sets, and reports the result on held-out
// sites it didn't tune on.
// Usage: node scripts/eval/tune.ts [--rounds 3] [--claude]
//
// Each round tries every threshold a step up and down and keeps a change only when the mean score on the training
// sites rises. With --claude (and ANTHROPIC_API_KEY set), Claude also reads the scores, misses, and history each
// round and proposes a set of thresholds, which is kept only on the same test. The search never edits code: it writes
// the best thresholds to private/eval/tuned-params.json for a person to review and adopt.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PARAMS, type DetectorParams } from "../../packages/sources/src/checks/lidar-equipment.ts";
import { EVAL_DIR, evaluate, loadManifest, meanObjective, prepare, table, type Prepared, type SiteResult } from "./harness.ts";

const args = process.argv.slice(2);
const rounds = Number(args[args.indexOf("--rounds") + 1] ?? 3) || 3;
const useClaude = args.includes("--claude") && Boolean(process.env.ANTHROPIC_API_KEY);

// Each threshold's allowed range, so neither search can wander somewhere meaningless.
const BOUNDS: Record<string, [number, number]> = {
  "box.minHeightM": [0.5, 1.4], "box.maxHeightM": [1.8, 3], "box.minSizeM": [0.5, 1.5], "box.maxSizeM": [2, 4.5],
  "box.joinToleranceM": [0.15, 0.6], "box.maxTopSpreadM": [0.1, 0.5], "box.minFill": [0.3, 0.9], "box.minSingleReturns": [0.2, 0.9],
  "box.maxWallM": [10, 60], "box.streetClearanceM": [1, 8], "box.pavedDepthM": [0.5, 4], "box.typicalHeightM": [1, 2],
  "light.minTopM": [3, 7], "light.maxTopM": [9, 16], "light.headDepthM": [0.8, 2.5], "light.minHeadReturns": [1, 8],
  "light.maxHeadSpanM": [1.2, 4], "light.bodyFromM": [1.5, 4], "light.maxBodyExtentM": [0.5, 2.5], "light.maxRingReturns": [0, 20],
  "light.minOpenShare": [0.1, 0.8], "hydrant.minTopM": [0.3, 0.8], "hydrant.maxTopM": [0.9, 1.5], "hydrant.maxRingReturns": [0, 4],
  "hydrant.clearAboveM": [1.1, 2], "hydrant.maxRoadM": [5, 25], "hydrant.maxPavedEdgeM": [1, 8], "hydrant.minOpenShare": [0.2, 0.8],
};
const INTEGER = new Set(["light.minHeadReturns", "light.maxRingReturns", "hydrant.maxRingReturns"]);

const get = (p: DetectorParams, key: string) => (p as unknown as Record<string, Record<string, number>>)[key.split(".")[0]!]![key.split(".")[1]!]!;
function set(p: DetectorParams, key: string, value: number): DetectorParams {
  const [group, name] = key.split(".") as [keyof DetectorParams, string];
  const [lo, hi] = BOUNDS[key]!;
  const v = Math.min(hi, Math.max(lo, INTEGER.has(key) ? Math.round(value) : Math.round(value * 100) / 100));
  return { ...p, [group]: { ...p[group], [name]: v } } as DetectorParams;
}

const manifest = loadManifest();
const sites: Prepared[] = [];
for (const entry of manifest) sites.push(await prepare(entry));
const train = sites.filter((s) => (s.entry.split ?? "train") === "train");
const holdout = sites.filter((s) => s.entry.split === "holdout");
const run = (p: DetectorParams, list: Prepared[]) => list.map((s) => evaluate(s, p));

let best = DEFAULT_PARAMS;
let bestTrain = run(best, train);
const history: { change: string; train: number; kept: boolean }[] = [];
console.log(`start: train ${meanObjective(bestTrain).toFixed(3)}, holdout ${meanObjective(run(best, holdout)).toFixed(3)}`);

async function claudeProposal(results: SiteResult[]): Promise<DetectorParams | null> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const prompt = [
    "You tune the thresholds of a rule-based detector that finds utility poles, light poles, hydrants, and pad-mounted transformer boxes in USGS 3DEP airborne lidar (about 25 points per square metre).",
    "Scores come from comparing detections to engineered drawing sets. Propose one new set of thresholds that should raise the mean objective (mean F1 per kind, transformer counted as 1 / rank).",
    "Stay inside the bounds. Prefer changes with a physical reason. Answer with JSON only: {\"params\": <same shape as current>, \"reason\": \"...\"}.",
    `Bounds: ${JSON.stringify(BOUNDS)}`,
    `Current thresholds: ${JSON.stringify(best)}`,
    `Training results (misses list drawn objects with no detection within 3 m, with the nearest detection's distance; extras are detections the drawing doesn't show): ${JSON.stringify(results)}`,
    `History of tried changes: ${JSON.stringify(history.slice(-40))}`,
  ].join("\n\n");
  const response = await client.messages.create({ model: "claude-opus-5-5", max_tokens: 8000, messages: [{ role: "user", content: prompt }] });
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    const proposed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { params: DetectorParams; reason: string };
    console.log(`Claude: ${proposed.reason}`);
    // Only known thresholds, clamped to their bounds.
    return Object.keys(BOUNDS).reduce((p, key) => { const v = get(proposed.params, key); return typeof v === "number" && Number.isFinite(v) ? set(p, key, v) : p; }, best);
  } catch {
    console.log("Claude's proposal wasn't usable JSON; skipped.");
    return null;
  }
}

for (let round = 1; round <= rounds; round++) {
  let improved = false;
  if (useClaude) {
    const proposal = await claudeProposal(bestTrain);
    if (proposal) {
      const results = run(proposal, train);
      const kept = meanObjective(results) > meanObjective(bestTrain);
      history.push({ change: "Claude proposal", train: meanObjective(results), kept });
      if (kept) { best = proposal; bestTrain = results; improved = true; }
    }
  }
  for (const key of Object.keys(BOUNDS)) {
    const value = get(best, key);
    const step = INTEGER.has(key) ? 1 : Math.max(0.05, Math.abs(value) * 0.15);
    for (const candidate of [value - step, value + step]) {
      const trial = set(best, key, candidate);
      if (get(trial, key) === value) continue;
      const results = run(trial, train);
      const kept = meanObjective(results) > meanObjective(bestTrain) + 1e-9;
      history.push({ change: `${key} ${value} -> ${get(trial, key)}`, train: Math.round(meanObjective(results) * 1000) / 1000, kept });
      if (kept) { best = trial; bestTrain = results; improved = true; console.log(`  kept ${key} ${value} -> ${get(trial, key)}: train ${meanObjective(results).toFixed(3)}`); break; }
    }
  }
  console.log(`round ${round}: train ${meanObjective(bestTrain).toFixed(3)}`);
  if (!improved) break;
}

const finalHoldout = run(best, holdout);
console.log("\nTuned thresholds, every site:\n" + table([...bestTrain, ...finalHoldout]));
console.log(`\nHeld-out sites: ${meanObjective(run(DEFAULT_PARAMS, holdout)).toFixed(3)} with the current thresholds, ${meanObjective(finalHoldout).toFixed(3)} tuned.`);
writeFileSync(join(EVAL_DIR, "tuned-params.json"), JSON.stringify(best, null, 2));
writeFileSync(join(EVAL_DIR, `tune-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify({ best, history }, null, 2));
