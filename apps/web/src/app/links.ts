import type { CaptureLink, RecordVersion } from "@eqore/contract";
import { shortTime } from "./format";

export interface TrackedLink {
  link: CaptureLink;
  createdAt: number;
  baseline: string[];
}

export function trackLink(link: CaptureLink, record: RecordVersion, now = Date.now()): TrackedLink {
  return { link, createdAt: now, baseline: record.observations.map((o) => o.id) };
}

export type LinkAction = "confirm" | "copy" | "new" | null;

export function isLinkOpen(tracked: TrackedLink, record: RecordVersion, now = Date.now()): boolean {
  const value = record.values.find((v) => v.field === tracked.link.field);
  return (
    tracked.link.status === "open" && Date.parse(tracked.link.expiresAt) > now && value?.state !== "verified"
  );
}

export function linkRow(
  tracked: TrackedLink,
  record: RecordVersion,
  now = Date.now(),
): { text: string; action: LinkAction } | null {
  const { link, baseline } = tracked;
  const value = record.values.find((v) => v.field === link.field);
  if (link.status === "closed" || value?.state === "verified") return null;
  const latest = record.observations
    .filter((o) => o.field === link.field && !baseline.includes(o.id))
    .at(-1);
  if (latest?.kind === "reading" && latest.method === "model_draft") {
    return { text: "Draft waiting for you to confirm", action: "confirm" };
  }
  if (latest?.kind === "unreadable") return { text: "Couldn't read it", action: "confirm" };
  if (latest?.kind === "failed_extraction") {
    return { text: `Reading failed: ${latest.reason ?? "no reason given"}. Send the link again or upload the file.`, action: "copy" };
  }
  if (link.status === "expired" || Date.parse(link.expiresAt) <= now) {
    return { text: "Link expired", action: "new" };
  }
  return { text: `Link created ${shortTime(tracked.createdAt)}, waiting for a photo`, action: "copy" };
}
