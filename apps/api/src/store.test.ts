import { describe, expect, it } from "vitest";
import type { Observation } from "@eqore/contract";
import { Store } from "./store.ts";

const observation: Observation = {
  id: "obs-1",
  siteId: "site-1",
  field: "parcel_id",
  kind: "reading",
  value: { type: "text", value: "P-1" },
  source: { id: "test", name: "SYNTHETIC TEST source", kind: "arcgis_rest", dataOrigin: "synthetic" },
  retrievedAt: "2026-11-07T10:00:00Z",
  sourceDate: null,
  method: "source_read",
  locator: {},
  identity: { sourceId: "test", query: "q", contentHash: "h" },
  synthetic: true,
};

describe("the record store", () => {
  it("returns observations in the order they were appended", () => {
    const store = new Store();
    store.appendObservations([observation, { ...observation, id: "obs-2" }]);
    expect(store.observations("site-1").map((entry) => entry.id)).toEqual(["obs-1", "obs-2"]);
  });

  it("refuses at the database to update or delete an observation", () => {
    const store = new Store();
    store.appendObservations([observation]);
    expect(() => store.db.exec("UPDATE observations SET field = 'x'")).toThrow("append-only");
    expect(() => store.db.exec("DELETE FROM observations")).toThrow("append-only");
    expect(store.observations("site-1")).toHaveLength(1);
  });

  it("refuses an observation that fails the contract and stores none of its batch", () => {
    const store = new Store();
    const unlabeled = { ...observation, id: "obs-2", synthetic: false };
    expect(() => store.appendObservations([observation, unlabeled])).toThrow();
    expect(store.observations("site-1")).toEqual([]);
  });

  it("counts capture uploads only up to the limit", () => {
    const store = new Store();
    store.saveCaptureLink({ id: "l", tokenHash: "t", siteId: "s", field: "meter_number", url: "u", expiresAt: "2026-11-08T00:00:00Z", uploadsUsed: 0, maxUploads: 1 });
    expect(store.useCaptureUpload("l")).toBe(true);
    expect(store.useCaptureUpload("l")).toBe(false);
  });
});
