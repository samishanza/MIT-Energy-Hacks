import { CONCEPT_GRADE_NOTE, SiteMapExportSchema } from "@eqore/contract";
import type { RecordVersion, SiteMapExport } from "@eqore/contract";

export function toSiteMap(record: RecordVersion, generatedAt: string): SiteMapExport {
  const values = new Map(record.values.map((value) => [value.field, value]));
  return SiteMapExportSchema.parse({
    contractVersion: record.contractVersion,
    recordVersionId: record.id,
    version: record.version,
    generatedAt,
    note: CONCEPT_GRADE_NOTE,
    snapshot: record.snapshot,
    synthetic: record.synthetic,
    site: record.site,
    baseMap: record.baseMap,
    features: {
      type: "FeatureCollection",
      features: record.features.map((feature) => {
        const value = values.get(feature.field);
        if (!value) throw new Error(`Map feature ${feature.id} names ${feature.field}, which has no value`);
        return {
          type: "Feature",
          id: feature.id,
          geometry: feature.geometry,
          properties: {
            kind: feature.kind,
            field: feature.field,
            label: feature.label,
            placedByHand: feature.placedByHand,
            state: value.state,
            grade: value.grade,
            owner: value.owner,
            synthetic: value.synthetic,
          },
        };
      }),
    },
    values: record.values,
  });
}
