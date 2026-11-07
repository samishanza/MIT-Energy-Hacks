import type { Observation, Source, SourceRun } from "@eqore/contract";
import { RECORDED_AT_HEADER, observe, type CollectContext, type FetchLike } from "./arcgis.ts";

export type JsonReading = Pick<Parameters<typeof observe>[2], "field" | "value" | "attribute" | "grade" | "sourceDate" | "reason">;

export type JsonRequest = { location: [number, number]; address: string };

export type JsonSource = {
  id: string;
  name: string;
  url: string;
  licenseNote: string;
  robotsChecked: string;
  fields: string[];
  // Named here, and supplied only by the live fetch, so a key never reaches a URL this code builds.
  keyName?: string;
  params: (request: JsonRequest) => Record<string, string>;
  read: (body: unknown) => JsonReading[];
  // A named reason for an answer that holds no usable value.
  emptyReason: string;
};

export type JsonCollection = { observations: Observation[]; run: SourceRun };

const RETRIES = 2;

// Adds keys at the last moment before the network, inside whatever records or logs a request,
// and takes them back out of any error, so no recording, query, or reason ever holds one.
export function withApiKeys(fetchImpl: FetchLike, keys: Record<string, { host: string; param: string; value: string | undefined }>): FetchLike & { available: string[] } {
  const entries = Object.values(keys).filter((key) => key.value);
  const keyed: FetchLike = async (url, init) => {
    const target = new URL(url);
    for (const key of entries) if (target.hostname === key.host) target.searchParams.set(key.param, key.value!);
    try {
      return await fetchImpl(target.toString(), init);
    } catch (error) {
      let message = (error as Error).message;
      for (const key of entries) message = message.split(key.value!).join("[key]");
      throw new Error(message);
    }
  };
  return Object.assign(keyed, { available: Object.entries(keys).filter(([, key]) => key.value).map(([name]) => name) });
}

export async function collectJson(source: JsonSource, request: JsonRequest, ctx: CollectContext): Promise<JsonCollection> {
  const params = new URLSearchParams(source.params(request));
  const query = `${source.id} ${params}`;
  const origin = (retrievedAt: string) => ({
    source: { id: source.id, name: source.name, kind: "json_api", dataOrigin: "real", url: source.url, licenseNote: source.licenseNote } satisfies Source,
    query,
    retrievedAt,
  });
  const missing = (reason: string, retrievedAt = ctx.now()): JsonCollection => ({
    observations: source.fields.map((field) => observe(origin(retrievedAt), ctx, { field, kind: "no_value", value: null, reason })),
    run: { sourceId: source.id, name: source.name, status: "missing", reason },
  });

  if (source.keyName && !ctx.availableKeys?.includes(source.keyName)) {
    return missing(`${source.name} needs ${source.keyName}, which isn't set.`);
  }

  let failure = "";
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await new Promise((done) => setTimeout(done, (ctx.retryDelayMs ?? 1500) * attempt));
    try {
      const response = await ctx.fetch(`${source.url}?${params}`, { signal: AbortSignal.timeout(30_000) });
      const retrievedAt = response.headers.get(RECORDED_AT_HEADER) ?? ctx.now();
      if (!response.ok) {
        failure = `The service returned HTTP ${response.status}`;
        // A refused request won't change on retry.
        if (response.status < 500) return missing(failure, retrievedAt);
        continue;
      }
      const readings = source.read(await response.json());
      if (readings.length === 0) return missing(source.emptyReason, retrievedAt);
      return {
        observations: readings.map((reading) => observe(origin(retrievedAt), ctx, { ...reading, kind: "reading" })),
        run: { sourceId: source.id, name: source.name, status: "done" },
      };
    } catch (error) {
      failure = `The service could not be reached: ${(error as Error).message}`;
      if ((error as Error).name === "RunDeadlineError") return missing(failure);
    }
  }
  return missing(failure);
}
