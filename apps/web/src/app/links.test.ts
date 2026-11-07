import type { CaptureLink, Observation, RecordVersion } from "@eqore/contract";
import { describe, expect, it } from "vitest";
import { sampleRecord } from "../test/fixtures";
import { isLinkOpen, linkRow, trackLink } from "./links";

const NOW = Date.parse("2026-11-07T12:00:00Z");

const link = (overrides: Partial<CaptureLink> = {}): CaptureLink => ({
  id: "link-1",
  siteId: "sample-site",
  field: "meter_number",
  url: "https://sample-tunnel.invalid/capture/T",
  status: "open",
  expiresAt: "2026-11-08T12:00:00Z",
  uploadsUsed: 0,
  maxUploads: 5,
  ...overrides,
});

function arrive(record: RecordVersion, partial: Partial<Observation>): RecordVersion {
  const next = structuredClone(record);
  const base = next.observations.find((o) => o.field === "meter_number")!;
  next.observations.push({ ...structuredClone(base), id: "obs-new", ...partial });
  return next;
}

describe("capture link row", () => {
  const record = sampleRecord();
  const tracked = (overrides?: Partial<CaptureLink>) => trackLink(link(overrides), record, NOW);

  it("says it's waiting when nothing new has arrived", () => {
    const row = linkRow(tracked(), record, NOW);
    expect(row?.text).toMatch(/waiting for a photo/);
    expect(row?.action).toBe("copy");
  });

  it("offers the confirm view for a new draft", () => {
    const next = arrive(record, { kind: "reading", method: "model_draft" });
    expect(linkRow(tracked(), next, NOW)).toEqual({ text: "Draft waiting for you to confirm", action: "confirm" });
  });

  it("offers the confirm view for a new unreadable file", () => {
    const next = arrive(record, { kind: "unreadable" });
    expect(linkRow(tracked(), next, NOW)).toEqual({ text: "Couldn't read it", action: "confirm" });
  });

  it("gives the reason a reading failed", () => {
    const next = arrive(record, { kind: "failed_extraction", reason: "The model timed out." });
    expect(linkRow(tracked(), next, NOW)?.text).toMatch(/Reading failed: The model timed out\./);
  });

  it("ignores observations that were already there", () => {
    expect(linkRow(tracked(), record, NOW)?.text).not.toMatch(/Couldn't read it/);
  });

  it("reports an expired link, by status and by date", () => {
    expect(linkRow(tracked({ status: "expired" }), record, NOW)?.action).toBe("new");
    expect(linkRow(tracked({ expiresAt: "2026-11-07T11:00:00Z" }), record, NOW)?.action).toBe("new");
  });

  it("drops the row once the link closes or the field is verified", () => {
    expect(linkRow(tracked({ status: "closed" }), record, NOW)).toBeNull();
    const next = structuredClone(record);
    const value = next.values.find((v) => v.field === "meter_number")!;
    value.state = "verified";
    expect(linkRow(tracked(), next, NOW)).toBeNull();
  });
});

describe("whether to keep checking a link", () => {
  const record = sampleRecord();

  it("is open until it expires, closes, or its field is verified", () => {
    expect(isLinkOpen(trackLink(link(), record, NOW), record, NOW)).toBe(true);
    expect(isLinkOpen(trackLink(link({ status: "closed" }), record, NOW), record, NOW)).toBe(false);
    expect(isLinkOpen(trackLink(link({ expiresAt: "2026-11-07T11:00:00Z" }), record, NOW), record, NOW)).toBe(false);
    const next = structuredClone(record);
    next.values.find((v) => v.field === "meter_number")!.state = "verified";
    expect(isLinkOpen(trackLink(link(), record, NOW), next, NOW)).toBe(false);
  });
});
