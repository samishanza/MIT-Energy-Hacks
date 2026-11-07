// Tier 0. Everything you can see from above or from the street.
//
// Scope boundary that matters: this agent may not read electrical ratings. The one
// exception is a transformer kVA stencilled on a pad-mount, and even then it may only
// be *inferred* with a range — the gatekeeper rejects it as a point value.

import type { Agent, AgentContext } from './base.ts';
import { Emit, rangeFrom, round2 } from './base.ts';

/** Pad-mount transformers ship in standard sizes; a stencil read sits between neighbours. */
const STANDARD_KVA = [75, 100, 150, 167, 225, 300, 500, 750, 1000, 1500, 2000, 2500, 3000];

export const imageryAgent: Agent = {
  id: 'imagery',
  tier: 0,
  purpose:
    'Building footprint and height, openings on the yard-facing wall, candidate pad zones, access, cable route, visible transformer and existing generation.',
  tools: [
    'imagery.aerial_tiles',
    'overture.footprints',
    'segment_geospatial.measure',
    'py3dep.elevation',
    'mapillary.street_level',
    'osm.hydrants',
  ],

  async run(ctx: AgentContext) {
    const e = new Emit('imagery');

    e.tool('imagery.aerial_tiles', { address: ctx.site.address });
    e.tool('overture.footprints', { address: ctx.site.address });
    const aerial = await ctx.sources.aerial(ctx.site);

    if (!aerial) {
      // No image to read. A GIS footprint layer can still give the extents — different
      // evidence, different confidence, and no crop, because there is no picture.
      e.tool('gis.building_structures', { address: ctx.site.address });
      const fp = await ctx.sources.footprint?.(ctx.site);

      if (fp) {
        const b = fp.building;
        const range = (v: number) => rangeFrom(v, fp.toleranceFt);
        const why =
          `Bounding box of the ${fp.label} polygon. Vector geometry at reference grade, ` +
          `not measured off a photo and not a survey, so it is carried +/-${fp.toleranceFt} ft.`;
        e.propose('building.offset_x_ft', b.offsetXFt, fp, 'gis_footprint', {
          unit: 'ft', range: range(b.offsetXFt), confidence: 0.7, rationale: why,
        });
        e.propose('building.offset_y_ft', b.offsetYFt, fp, 'gis_footprint', {
          unit: 'ft', range: range(b.offsetYFt), confidence: 0.7, rationale: why,
        });
        e.propose('building.width_ft', b.widthFt, fp, 'gis_footprint', {
          unit: 'ft', range: range(b.widthFt), confidence: 0.75, rationale: why,
        });
        e.propose('building.depth_ft', b.depthFt, fp, 'gis_footprint', {
          unit: 'ft', range: range(b.depthFt), confidence: 0.75, rationale: why,
        });
        if (fp.buildingAreaSqft) {
          const measured = Math.round(b.widthFt * b.depthFt);
          const published = fp.buildingAreaSqft;
          const off = Math.abs(measured - published) / Math.max(published, 1);
          if (off > 0.25) {
            e.note(
              `footprint bbox implies ~${measured} sqft but the layer publishes ${published} sqft ` +
                `(${Math.round(off * 100)}% apart) — the building is not rectangular, or the layers disagree`,
            );
          }
        }
        // Everything below needs an image or a visit. None of it is in a vector layer.
        e.miss('pad_zone.width_ft', 'pad_zone.depth_ft', 'cable.route_length_ft', 'site.surface_type');
        e.note('no aerial image for this parcel; extents came from GIS vectors, pad zone and openings did not');
      } else {
        e.miss(
          'building.width_ft',
          'building.depth_ft',
          'building.offset_x_ft',
          'building.offset_y_ft',
          'pad_zone.width_ft',
          'pad_zone.depth_ft',
          'cable.route_length_ft',
        );
        e.note('no usable aerial tile or footprint for this parcel');
      }
    } else {
      const { crop, gsdFtPerPx: gsd } = aerial;
      const b = aerial.building;
      const mRange = (v: number) => rangeFrom(v, b.toleranceFt, gsd);
      const measured = (what: string) =>
        `Measured off orthoimagery at ${gsd} ft/px; ${what}. Precision is floored at two ground samples (+/-${round2(2 * gsd)} ft).`;

      e.propose('building.offset_x_ft', b.offsetXFt, aerial, 'aerial', {
        unit: 'ft',
        range: mRange(b.offsetXFt),
        confidence: 0.7,
        rationale: measured('west wall to the west lot line'),
        crop,
      });
      e.propose('building.offset_y_ft', b.offsetYFt, aerial, 'aerial', {
        unit: 'ft',
        range: mRange(b.offsetYFt),
        confidence: 0.7,
        rationale: measured('north wall to the north lot line'),
        crop,
      });
      e.propose('building.width_ft', b.widthFt, aerial, 'aerial', {
        unit: 'ft',
        range: mRange(b.widthFt),
        confidence: 0.75,
        rationale: measured('footprint width from the Overture polygon, checked against the tile'),
        crop,
      });
      e.propose('building.depth_ft', b.depthFt, aerial, 'aerial', {
        unit: 'ft',
        range: mRange(b.depthFt),
        confidence: 0.75,
        rationale: measured('footprint depth from the Overture polygon'),
        crop,
      });

      // A candidate zone, not an approved one. The owner approves the pad area.
      const p = aerial.padZone;
      const padNote = 'Candidate open area adjacent to the service side. The owner, not this agent, approves the pad zone.';
      e.propose('pad_zone.x_ft', p.xFt, aerial, 'aerial', {
        unit: 'ft', range: mRange(p.xFt), confidence: 0.6, rationale: padNote, crop,
      });
      e.propose('pad_zone.y_ft', p.yFt, aerial, 'aerial', {
        unit: 'ft', range: mRange(p.yFt), confidence: 0.6, rationale: padNote, crop,
      });
      e.propose('pad_zone.width_ft', p.widthFt, aerial, 'aerial', {
        unit: 'ft', range: mRange(p.widthFt), confidence: 0.6, rationale: padNote, crop,
      });
      e.propose('pad_zone.depth_ft', p.depthFt, aerial, 'aerial', {
        unit: 'ft', range: mRange(p.depthFt), confidence: 0.6, rationale: padNote, crop,
      });

      e.propose('site.surface_type', aerial.surface, aerial, 'aerial', {
        confidence: 0.7,
        rationale: 'Surface classified from the tile; decides whether the pad needs new subbase.',
        crop,
      });
      e.propose('cable.route_length_ft', aerial.cableRouteFt, aerial, 'aerial', {
        unit: 'ft',
        range: rangeFrom(aerial.cableRouteFt, b.toleranceFt * 2, gsd),
        confidence: 0.55,
        rationale:
          'Shortest plausible route from the candidate pad to the service entrance, traced on the tile. We supply length only; conductor sizing is a design decision.',
        crop,
      });
      e.propose('access.fire_apparatus_clear_ft', aerial.accessClearFt, aerial, 'aerial', {
        unit: 'ft',
        range: mRange(aerial.accessClearFt),
        confidence: 0.6,
        rationale: 'Narrowest clear width along the drive aisle serving the pad.',
        crop,
      });
      e.propose('fire.distance_to_exposure_ft', aerial.exposureFt, aerial, 'aerial', {
        unit: 'ft',
        range: mRange(aerial.exposureFt),
        confidence: 0.65,
        rationale: 'Candidate pad to the nearest exposure (adjacent structure or stored combustibles).',
        crop,
      });

      if (aerial.existingPvKw !== undefined) {
        e.propose('site.existing_pv_kw', aerial.existingPvKw, aerial, 'aerial', {
          unit: 'kW',
          range: [round2(aerial.existingPvKw * 0.7), round2(aerial.existingPvKw * 1.3)],
          confidence: 0.4,
          inferred: true,
          rationale:
            'Estimated from visible array area at an assumed 17 W/sqft. Existing generation reduces the 705.12 allowance, so confirm against the interconnection agreement.',
          crop,
        });
      }

      aerial.openings.forEach((o, i) => {
        e.propose(`openings.${i}.wall`, o.wall, aerial, 'aerial', {
          confidence: o.confidence,
          rationale: `Opening ${i + 1} detected on the ${o.wall} wall facing the candidate pad.`,
          crop,
        });
        e.propose(`openings.${i}.kind`, o.kind, aerial, 'aerial', {
          confidence: round2(o.confidence * 0.8),
          rationale:
            `Classified as ${o.kind} from the tile. NFPA 855 treats an air intake like an opening, so a misclassification here moves a keep-out zone — worth a staff photo if it is near the pad.`,
          crop,
        });
        e.propose(`openings.${i}.at_ft`, o.atFt, aerial, 'aerial', {
          unit: 'ft',
          range: rangeFrom(o.atFt, o.toleranceFt, gsd),
          confidence: o.confidence,
          rationale: `Offset along the ${o.wall} wall from its west/north end.`,
          crop,
        });
        e.propose(`openings.${i}.width_ft`, o.widthFt, aerial, 'aerial', {
          unit: 'ft',
          range: rangeFrom(o.widthFt, o.toleranceFt, gsd),
          confidence: round2(o.confidence * 0.9),
          rationale: `Clear width of opening ${i + 1}.`,
          crop,
        });
      });
    }

    // --- height from aerial LiDAR
    e.tool('py3dep.elevation', { address: ctx.site.address });
    const elev = await ctx.sources.elevation(ctx.site);
    if (elev) {
      e.propose('building.height_ft', elev.buildingHeightFt, elev, 'lidar_3dep', {
        unit: 'ft',
        range: rangeFrom(elev.buildingHeightFt, elev.toleranceFt),
        confidence: 0.8,
        rationale: 'USGS 3DEP first-return minus bare-earth over the footprint.',
      });
    } else {
      e.miss('building.height_ft');
    }

    // --- street level
    e.tool('mapillary.street_level', { address: ctx.site.address });
    const street = await ctx.sources.streetLevel(ctx.site);
    if (street?.transformer) {
      const t = street.transformer;
      e.propose('site.transformer_distance_ft', t.distanceFt, street, 'street_level', {
        unit: 'ft',
        range: rangeFrom(t.distanceFt, t.toleranceFt),
        confidence: 0.55,
        rationale: 'Pad-mount transformer located in street-level imagery; distance estimated to the candidate pad.',
        crop: street.crop,
      });

      if (t.stenciledKva && t.legible) {
        // Inference only. A stencil read is bracketed by the standard sizes either side.
        const i = STANDARD_KVA.indexOf(t.stenciledKva);
        const lo = i > 0 ? STANDARD_KVA[i - 1]! : t.stenciledKva;
        const hi = i >= 0 && i < STANDARD_KVA.length - 1 ? STANDARD_KVA[i + 1]! : t.stenciledKva;
        e.propose('electrical.transformer_kva', t.stenciledKva, street, 'street_level', {
          unit: 'kVA',
          range: [lo, hi],
          confidence: 0.45,
          inferred: true,
          rationale:
            `Stencil on the pad-mount reads ${t.stenciledKva} kVA. Street-level imagery cannot confirm this, so it is bracketed by the adjacent standard sizes and must be verified before it is relied on.`,
          crop: street.crop,
        });
      } else {
        e.miss('electrical.transformer_kva');
        e.note('transformer visible but the rating stencil is not legible');
      }
    } else {
      e.miss('site.transformer_distance_ft', 'electrical.transformer_kva');
    }

    if (street?.knoxBox !== undefined) {
      e.propose('fire.knox_box', street.knoxBox, street, 'street_level', {
        confidence: 0.6,
        rationale: 'Knox box presence at the main entrance from street-level imagery.',
        crop: street.crop,
      });
    }

    // --- hydrants
    e.tool('osm.hydrants', { address: ctx.site.address });
    const hyd = await ctx.sources.hydrants(ctx.site);
    if (hyd) {
      e.propose('fire.hydrant_distance_ft', hyd.distanceFt, hyd, 'hydrant_gis', {
        unit: 'ft',
        range: rangeFrom(hyd.distanceFt, 15),
        confidence: 0.7,
        rationale: 'Nearest hydrant from the municipal hydrant layer, straight-line to the candidate pad.',
      });
    } else {
      e.miss('fire.hydrant_distance_ft');
    }

    return e.result();
  },
};
