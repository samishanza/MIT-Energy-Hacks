// Tier 0. Lot geometry, ownership, zoning district. Nothing electrical, ever.

import type { Agent, AgentContext } from './base.ts';
import { Emit, rangeFrom } from './base.ts';

export const parcelAgent: Agent = {
  id: 'parcel',
  tier: 0,
  purpose: 'Lot lines, parcel id, owner of record, zoning district and flood zone from public GIS.',
  tools: ['massgis.parcel', 'massgis.assessor', 'fema.flood', 'gis.geometry'],

  async run(ctx: AgentContext) {
    const e = new Emit('parcel');

    e.tool('massgis.parcel', { address: ctx.site.address, city: ctx.site.city });
    const parcel = await ctx.sources.parcel(ctx.site);

    if (!parcel) {
      e.miss('site.parcel_id', 'site.owner', 'lot.width_ft', 'lot.depth_ft', 'zoning.district', 'site.road_side');
      e.note('no parcel polygon matched this address; the address may need normalising first');
      return e.result();
    }

    e.propose('site.address', parcel.address, parcel, 'parcel', {
      confidence: 0.95,
      rationale: 'Address of record on the matched parcel polygon.',
    });
    e.propose('site.parcel_id', parcel.parcelId, parcel, 'parcel', {
      confidence: 0.97,
      rationale: 'Assessor parcel identifier from the matched polygon.',
    });
    if (parcel.zoningDistrict) {
      e.propose('zoning.district', parcel.zoningDistrict, parcel, 'parcel', {
        confidence: 0.85,
        rationale: 'Zoning district from the municipal zoning layer at the parcel centroid.',
      });
    } else {
      e.miss('zoning.district');
      e.note('parcel layer carries no zoning district; a use code is not a substitute for one');
    }
    if (parcel.roadSide) {
      e.propose('site.road_side', parcel.roadSide, parcel, 'parcel', {
        confidence: 0.8,
        rationale: 'Parcel edge coincident with the public right-of-way.',
      });
    } else {
      e.miss('site.road_side');
    }

    // Lot dimensions come with a tolerance: parcel polygons are not survey grade.
    e.propose('lot.width_ft', parcel.lotWidthFt, parcel, 'parcel', {
      unit: 'ft',
      range: rangeFrom(parcel.lotWidthFt, parcel.toleranceFt),
      confidence: 0.75,
      rationale: `Parcel polygon width, +/-${parcel.toleranceFt} ft. Not a survey; if the pad lands near a lot line this needs a laser shot.`,
    });
    e.propose('lot.depth_ft', parcel.lotDepthFt, parcel, 'parcel', {
      unit: 'ft',
      range: rangeFrom(parcel.lotDepthFt, parcel.toleranceFt),
      confidence: 0.75,
      rationale: `Parcel polygon depth, +/-${parcel.toleranceFt} ft.`,
    });

    if (parcel.abutterOwner) {
      e.propose('site.abutter_owner', parcel.abutterOwner, parcel, 'parcel', {
        confidence: 0.8,
        rationale:
          'Owner of the parcel across the nearest property line. Named on the site plan, and the party who gets abutter notice if a variance is needed.',
      });
    } else {
      e.miss('site.abutter_owner');
    }

    if (parcel.floodZone) {
      e.propose('site.flood_zone', parcel.floodZone, parcel, 'flood_map', {
        confidence: 0.9,
        rationale: 'FEMA NFHL flood zone at the parcel centroid.',
      });
    } else {
      e.miss('site.flood_zone');
    }

    e.tool('massgis.assessor', { parcelId: parcel.parcelId });
    const assessor = await ctx.sources.assessor(ctx.site);

    if (assessor) {
      // Proposed from both sources on purpose. If they disagree, reconciliation raises a
      // conflict with both crops side by side rather than silently picking one.
      if (assessor.owner) {
        e.propose('site.owner', assessor.owner, assessor, 'assessor', {
          confidence: 0.9,
          rationale: 'Owner of record on the assessor card.',
        });
      } else {
        e.miss('site.owner');
      }
      e.propose('site.year_built', assessor.yearBuilt, assessor, 'assessor', {
        confidence: 0.8,
        rationale: 'Year built from the assessor card; a proxy for the code edition the service was built to.',
      });
      if (parcel.owner && assessor.owner && parcel.owner !== assessor.owner) {
        e.propose('site.owner', parcel.owner, parcel, 'parcel', {
          confidence: 0.7,
          rationale: 'Owner name carried on the parcel layer, which disagrees with the assessor card.',
        });
        e.note(`owner disagrees between parcel ("${parcel.owner}") and assessor ("${assessor.owner}")`);
      }
      if (assessor.buildingAreaSqft) {
        e.note(
          `assessor building area ${assessor.buildingAreaSqft} sqft — compare against the measured footprint`,
        );
      }
    } else if (parcel.owner) {
      e.propose('site.owner', parcel.owner, parcel, 'parcel', {
        confidence: 0.7,
        rationale: 'Owner name from the parcel layer; no assessor card available.',
      });
      e.miss('site.year_built');
    } else {
      e.miss('site.owner', 'site.year_built');
    }

    return e.result();
  },
};
