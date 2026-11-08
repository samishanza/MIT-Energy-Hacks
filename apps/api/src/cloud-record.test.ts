import { describe, expect, it } from "vitest";
import type { RecordVersion } from "@eqore/contract";
import { canonicalJson, joinRecord, newObservations, splitRecord } from "./cloud-record.ts";

// Two synthetic versions of one site; the second appends an observation to the first's log.
const observation = (id: string, field: string) => ({ id, field, kind: "reading", value: { type: "text", value: id } });
const version = (n: number, ids: string[]) =>
  ({
    id: `synthetic-v${n}`,
    contractVersion: "4",
    version: n,
    createdAt: `2026-11-07T00:00:0${n}.000Z`,
    trigger: n === 1 ? "collection" : "human_action",
    snapshot: false,
    synthetic: true,
    site: { id: "synthetic", address: "SYNTHETIC TEST SITE" },
    values: [{ field: "lot_size_acres", state: "verified" }],
    observations: ids.map((id) => observation(id, "lot_size_acres")),
    features: [],
    sourceRuns: [],
  }) as unknown as RecordVersion;

describe("splitting a record for the cloud database", () => {
  const first = version(1, ["a", "b"]);
  const second = version(2, ["a", "b", "c"]);

  it("stores each version without its log, and rebuilds it exactly from the shared log", () => {
    const one = splitRecord(first), two = splitRecord(second);
    expect(one.version.observation_count).toBe(2);
    expect("observations" in one.version.data).toBe(false);
    const log = [...two.observations].reverse();
    expect(canonicalJson(joinRecord(one.version, log))).toBe(canonicalJson(first));
    expect(canonicalJson(joinRecord(two.version, log))).toBe(canonicalJson(second));
  });

  it("adds only observations the cloud doesn't hold, and refuses a log that has diverged", () => {
    const stored = splitRecord(first).observations;
    expect(newObservations(stored, splitRecord(second).observations).map((entry) => entry.id)).toEqual(["c"]);
    expect(() => newObservations(stored, splitRecord(version(2, ["a", "x", "c"])).observations)).toThrow(/diverged/);
  });

  it("refuses to rebuild a version whose observations aren't all stored", () => {
    const two = splitRecord(second);
    expect(() => joinRecord(two.version, two.observations.slice(0, 2))).toThrow(/needs 3/);
    expect(() => joinRecord(two.version, [two.observations[0]!, two.observations[2]!, { ...two.observations[2]!, seq: 3 }])).toThrow(/missing/);
  });

  it("compares records regardless of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { f: 1, e: 0 }], c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: [2, { e: 0, f: 1 }] }, b: 1 }));
  });
});
