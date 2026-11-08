import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";

// True and false labels a person gives detected equipment: the training and evaluation set
// for the lidar detector. One JSON line per label, kept in the repo so the team shares it.
// No personal names are stored.

const LabelSchema = z.object({
  siteId: z.string().min(1),
  address: z.string().min(1),
  recordVersion: z.number().int(),
  featureId: z.string().min(1),
  equipmentType: z.string().min(1),
  basis: z.string().nullable().optional(),
  verdict: z.enum(["correct", "wrong"]),
  actualType: z.string().nullable().optional(),
  position: z.tuple([z.number(), z.number()]).nullable(),
});

export const labelsPath = () => resolve(process.env.EQUIPMENT_LABELS_PATH ?? "fixtures/equipment-labels/labels.jsonl");

export function appendEquipmentLabel(body: unknown, now: string): { count: number } {
  const label = LabelSchema.parse(body);
  const path = labelsPath();
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify({ ...label, labeledAt: now })}\n`);
  return { count: readFileSync(path, "utf8").split("\n").filter(Boolean).length };
}

export function equipmentLabelCount(): number {
  const path = labelsPath();
  return existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).length : 0;
}
