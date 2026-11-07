import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CollectContext, FetchLike } from "./index.ts";
import { usgsPointElevation } from "../config/national.ts";
import { fixtureFetch, recordingFetch } from "./fixtures.ts";
import { collectJson, withApiKeys, type JsonSource } from "./json-api.ts";

const request = { location: [-71.77, 42.28] as [number, number], address: "1 Test Way, Worcester, MA" };
const context = (fetch: FetchLike, extra: Partial<CollectContext> = {}): CollectContext => ({ siteId: "t", fetch, now: () => "2026-11-07T20:00:00.000Z", retryDelayMs: 0, ...extra });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const SECRET = "sentinel-secret-key-value";
const keyed: JsonSource = {
  id: "test-rates",
  name: "SYNTHETIC TEST rates",
  url: "https://rates.example.invalid/api",
  licenseNote: "Test source",
  robotsChecked: "2026-11-07",
  fields: ["rate_schedule"],
  keyName: "TEST_KEY",
  params: () => ({ q: "1" }),
  read: (body) => [{ field: "rate_schedule", value: { type: "text", value: String((body as { name: string }).name) }, grade: "reference" }],
  emptyReason: "No rate here.",
};

describe("the JSON adapter", () => {
  it("reads USGS elevation in feet, with a no-data value stored as missing", async () => {
    const answered = await collectJson(usgsPointElevation, request, context(async () => json({ value: "545.37" })));
    expect(answered.observations[0]).toMatchObject({ field: "ground_elevation_ft", kind: "reading", value: { type: "quantity", value: 545.4, unit: "ft" }, source: { kind: "json_api" } });

    const noData = await collectJson(usgsPointElevation, request, context(async () => json({ value: -1000000 })));
    expect(noData.observations[0]).toMatchObject({ kind: "no_value", reason: "The elevation service holds no value at this point." });
    expect(noData.run.status).toBe("missing");
  });

  it("retries a server error and reports the reason if it never clears, but not a refusal", async () => {
    let calls = 0;
    const once: FetchLike = async () => (++calls === 1 ? json({}, 504) : json({ value: 10 }));
    expect((await collectJson(usgsPointElevation, request, context(once))).run.status).toBe("done");

    const down = await collectJson(usgsPointElevation, request, context(async () => json({}, 504)));
    expect(down.run).toMatchObject({ status: "missing", reason: "The service returned HTTP 504" });

    let refusals = 0;
    await collectJson(usgsPointElevation, request, context(async () => { refusals += 1; return json({}, 403); }));
    expect(refusals).toBe(1);
  });

  it("makes no request and says why when a key isn't set", async () => {
    let requests = 0;
    const result = await collectJson(keyed, request, context(async () => { requests += 1; return json({}); }));
    expect(requests).toBe(0);
    expect(result.run).toMatchObject({ status: "missing", reason: "SYNTHETIC TEST rates needs TEST_KEY, which isn't set." });
  });

  it("keeps a key out of the recording, the observations, the source run, and any failure reason", async () => {
    const urls: string[] = [];
    const network: FetchLike = async (url) => {
      urls.push(url);
      return json({ name: "G-3" });
    };
    const keys = { TEST_KEY: { host: "rates.example.invalid", param: "api_key", value: SECRET } };
    const directory = mkdtempSync(join(tmpdir(), "json-recording-"));
    const recording = recordingFetch(directory, "keys", withApiKeys(network, keys), () => "2026-11-07T20:00:00.000Z");
    const result = await collectJson(keyed, request, context(recording, { availableKeys: withApiKeys(network, keys).available }));

    expect(urls[0]).toContain(`api_key=${SECRET}`);
    expect(result.run.status).toBe("done");
    expect(JSON.stringify(result)).not.toContain(SECRET);
    const stored = readdirSync(directory).map((name) => readFileSync(join(directory, name), "utf8")).join("");
    expect(stored).toContain("G-3");
    expect(stored).not.toContain(SECRET);

    const replayed = await collectJson(keyed, request, context(fixtureFetch(directory), { availableKeys: ["TEST_KEY"] }));
    expect(replayed.observations[0]!.value).toEqual({ type: "text", value: "G-3" });

    const leaky = withApiKeys(async (url) => { throw new Error(`fetch failed for ${url}`); }, keys);
    const failed = await collectJson(keyed, request, context(leaky, { availableKeys: leaky.available }));
    expect(failed.run.status).toBe("missing");
    expect(JSON.stringify(failed)).not.toContain(SECRET);
  });
});
