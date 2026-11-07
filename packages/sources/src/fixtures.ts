import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RECORDED_AT_HEADER, sha256, type FetchLike } from "./arcgis.ts";

export type RecordedResponse = {
  // Real public data, stored once with where and when it came from.
  label: string;
  dataOrigin: "real";
  url: string;
  body: string | null;
  retrievedAt: string;
  status: number;
  response: unknown;
};

function canonicalBody(body: string | null): string | null {
  if (!body) return null;
  const params = [...new URLSearchParams(body).entries()].sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(params);
}

function keyOf(url: string, body: string | null): string {
  return sha256(JSON.stringify([url, canonicalBody(body)])).slice(0, 16);
}

function bodyText(init?: RequestInit): string | null {
  return typeof init?.body === "string" ? init.body : null;
}

// Replays recorded responses and never touches the network. A request with no recording fails,
// which the adapter reports as a missing source with that reason.
export function fixtureFetch(...directories: string[]): FetchLike {
  const recorded = new Map<string, RecordedResponse>();
  for (const directory of directories) {
    for (const name of readdirSync(directory)) {
      if (!name.endsWith(".json")) continue;
      const fixture = JSON.parse(readFileSync(join(directory, name), "utf8")) as RecordedResponse;
      recorded.set(keyOf(fixture.url, fixture.body), fixture);
    }
  }
  return async (url, init) => {
    const fixture = recorded.get(keyOf(url, bodyText(init)));
    if (!fixture) throw new Error(`No recorded response for ${url}`);
    return new Response(JSON.stringify(fixture.response), {
      status: fixture.status,
      headers: { "content-type": "application/json", [RECORDED_AT_HEADER]: fixture.retrievedAt },
    });
  };
}

// Wraps a live fetch and saves each response, so a test or demo snapshot can replay it.
export function recordingFetch(directory: string, slug: string, live: FetchLike, now: () => string): FetchLike {
  mkdirSync(directory, { recursive: true });
  return async (url, init) => {
    const response = await live(url, init);
    const body = bodyText(init);
    const parsed = (await response.clone().json()) as { error?: unknown };
    // An error body must never replace a good recording.
    if (!response.ok || parsed.error) return response;
    const fixture: RecordedResponse = {
      label: `Real public data from ${new URL(url).hostname}. Recorded response, not synthetic.`,
      dataOrigin: "real",
      url,
      body,
      retrievedAt: now(),
      status: response.status,
      response: parsed,
    };
    writeFileSync(join(directory, `${slug}-${keyOf(url, body)}.json`), `${JSON.stringify(fixture)}\n`);
    return response;
  };
}
