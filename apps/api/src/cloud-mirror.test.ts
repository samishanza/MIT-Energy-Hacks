import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { RecordVersion } from "@eqore/contract";
import { CloudMirror, reconcile } from "./cloud-mirror.ts";
import { joinRecord, type ObservationRow, type VersionRow } from "./cloud-record.ts";
import { Store } from "./store.ts";

describe("reconciling a site between the local store and the cloud", () => {
  it("pulls what only the cloud holds", () => {
    expect(reconcile(["a"], [1], ["a", "b", "c"], [1, 2])).toEqual({ pullFrom: 1, pushFrom: 3, pullVersions: [2], pushVersions: [] });
  });

  it("pushes what only the local store holds", () => {
    expect(reconcile(["a", "b"], [1, 2, 3], ["a"], [1])).toEqual({ pullFrom: 2, pushFrom: 1, pullVersions: [], pushVersions: [2, 3] });
  });

  it("does nothing when both hold the same", () => {
    expect(reconcile(["a", "b"], [1, 2], ["a", "b"], [1, 2])).toEqual({ pullFrom: 2, pushFrom: 2, pullVersions: [], pushVersions: [] });
  });

  it("leaves a site alone when the two logs differ at a place both hold", () => {
    expect(reconcile(["a", "x"], [1, 2], ["a", "b"], [1, 2])).toBeNull();
  });
});

// A stand-in for Supabase's REST API over in-memory tables, covering only the requests the mirror makes.

function fakeSupabase() {
  const tables: Record<string, Record<string, unknown>[]> = { sites: [], observations: [], site_versions: [] };
  const fetchImpl = (async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const name = url.pathname.replace("/rest/v1/", "");
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (name === "rpc/site_record") {
      const { p_site_id, p_version } = JSON.parse(String(init.body));
      const versions = tables.site_versions!.filter((v) => v.site_id === p_site_id) as VersionRow[];
      const row = versions.find((v) => v.version === (p_version ?? Math.max(...versions.map((x) => x.version))));
      return json(row ? joinRecord(row, tables.observations!.filter((o) => o.site_id === p_site_id) as ObservationRow[]) : null);
    }
    const table = tables[name]!;
    if (init.method === "POST") {
      for (const row of JSON.parse(String(init.body)) as Record<string, unknown>[]) {
        const key = name === "sites" ? ["id"] : name === "observations" ? ["site_id", "seq"] : ["site_id", "version"];
        const at = table.findIndex((held) => key.every((k) => held[k] === row[k]));
        if (at >= 0 && name !== "sites") return new Response("duplicate key", { status: 409 });
        if (at >= 0) table[at] = row;
        else table.push(row);
      }
      return new Response(null, { status: 201 });
    }
    let rows = [...table];
    for (const [k, v] of url.searchParams) {
      if (v.startsWith("eq.")) rows = rows.filter((r) => String(r[k]) === v.slice(3));
      if (v.startsWith("gte.")) rows = rows.filter((r) => Number(r[k]) >= Number(v.slice(4)));
      if (v.startsWith("in.(")) rows = rows.filter((r) => v.slice(4, -1).split(",").map(Number).includes(Number(r[k])));
    }
    const order = url.searchParams.get("order");
    if (order) rows.sort((a, b) => (a[order]! < b[order]! ? -1 : 1));
    const offset = Number(url.searchParams.get("offset") ?? 0), limit = Number(url.searchParams.get("limit") ?? 1000);
    return json(rows.slice(offset, offset + limit));
  }) as typeof fetch;
  return { tables, fetchImpl };
}

describe("mirroring the store to the cloud", () => {
  const full = JSON.parse(readFileSync(new URL("../../web/src/mock/worcester.record.json", import.meta.url), "utf8")) as RecordVersion;
  const v1 = { ...full, version: 1, observations: full.observations.slice(0, 40) };
  const v2 = { ...full, version: 2, trigger: "human_action", observations: full.observations } as RecordVersion;
  const quiet = () => undefined;

  it("pushes a local site, then rebuilds it in an empty store exactly", async () => {
    const cloud = fakeSupabase();
    const local = new Store();
    local.appendObservations(v1.observations);
    local.saveVersion(v1);
    local.appendObservations(full.observations.slice(40));
    local.saveVersion(v2);
    await new CloudMirror({ url: "https://test.supabase.co", key: "sb_secret_test", fetch: cloud.fetchImpl, log: quiet }).reconcileAll(local);
    expect(cloud.tables.observations).toHaveLength(full.observations.length);
    expect(cloud.tables.site_versions).toHaveLength(2);

    const fresh = new Store();
    await new CloudMirror({ url: "https://test.supabase.co", key: "sb_secret_test", fetch: cloud.fetchImpl, log: quiet }).reconcileAll(fresh);
    expect(fresh.readVersion(full.site.id, 1)).toEqual(local.readVersion(full.site.id, 1));
    expect(fresh.readVersion(full.site.id, 2)).toEqual(local.readVersion(full.site.id, 2));
    expect(fresh.observations(full.site.id).map((o) => o.id)).toEqual(local.observations(full.site.id).map((o) => o.id));
  });

  it("pushes each version the API saves, in the background, without repeating what the cloud holds", async () => {
    const cloud = fakeSupabase();
    const local = new Store();
    const mirror = new CloudMirror({ url: "https://test.supabase.co", key: "sb_secret_test", fetch: cloud.fetchImpl, log: quiet });
    local.onVersionSaved = (record) => mirror.versionSaved(local, record);
    local.appendObservations(v1.observations);
    local.saveVersion(v1);
    local.appendObservations(full.observations.slice(40));
    local.saveVersion(v2);
    await mirror.settled();
    expect(cloud.tables.site_versions!.map((v) => v.version)).toEqual([1, 2]);
    expect(cloud.tables.observations).toHaveLength(full.observations.length);
  });
});
