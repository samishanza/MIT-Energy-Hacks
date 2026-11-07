import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fixtureFetch } from '@eqore/sources';
import { runDiscovery } from '../index';
import { boundsOf, boxSizeFt, buildingsByArea, makeLiveSources, offsetFt, NOT_AVAILABLE_FROM_GIS } from './live';

// Replays responses recorded from the real services. No network, same bytes every run.
const dir = (name: string) => fileURLToPath(new URL(`../../../../fixtures/${name}`, import.meta.url));
const recorded = fixtureFetch(dir('arcgis'), dir('geocoder'));
const now = () => '2026-11-07T20:00:00.000Z';

const HOLLISTON = '11 Bartzak Dr, Holliston, MA';

describe('lon/lat to feet', () => {
  it('measures a box at its own latitude', () => {
    // One degree of latitude is ~364,000 ft everywhere; a degree of longitude shrinks
    // with the cosine, so at 42 N it is about three quarters of that.
    const box = { west: -71.5, south: 42.0, east: -71.49, north: 42.01 };
    const { widthFt, depthFt } = boxSizeFt(box);
    expect(depthFt).toBeCloseTo(3640, 0);
    expect(widthFt).toBeGreaterThan(2600);
    expect(widthFt).toBeLessThan(2750);
  });

  it('offsets from the north-west corner, with y growing southward', () => {
    const outer = { west: -71.5, south: 42.0, east: -71.49, north: 42.01 };
    const inner = { west: -71.498, south: 42.004, east: -71.494, north: 42.008 };
    const { xFt, yFt } = offsetFt(outer, inner);
    expect(xFt).toBeGreaterThan(0);
    expect(yFt).toBeGreaterThan(0); // inner's top is south of outer's top
  });

  it('bounds a polygon', () => {
    const g = {
      type: 'Polygon' as const,
      coordinates: [[[-71.5, 42.0], [-71.49, 42.0], [-71.49, 42.01], [-71.5, 42.01], [-71.5, 42.0]]] as [number, number][][],
    };
    expect(boundsOf(g)).toEqual({ west: -71.5, south: 42.0, east: -71.49, north: 42.01 });
  });
});

describe('live Massachusetts sources, against recorded real responses', () => {
  it('resolves a real address to a real parcel', async () => {
    const { site, sources } = await makeLiveSources({ address: HOLLISTON, fetch: recorded, now });
    expect(site.state).toBe('MA');

    const parcel = await sources.parcel(site);
    expect(parcel).toBeTruthy();
    expect(parcel!.parcelId).toMatch(/^[A-Z]_\d+_\d+$/); // MassGIS LOC_ID
    expect(parcel!.synthetic).toBeUndefined(); // real data must never claim to be synthetic
    expect(parcel!.lotWidthFt).toBeGreaterThan(50);
    expect(parcel!.lotDepthFt).toBeGreaterThan(50);
  });

  it('refuses to supply an owner or a zoning district, because MassGIS L3 has neither', async () => {
    const { site, sources } = await makeLiveSources({ address: HOLLISTON, fetch: recorded, now });
    const parcel = await sources.parcel(site);
    expect(parcel!.owner).toBeUndefined();
    // A use code is not a zoning district, and must not be passed off as one.
    expect(parcel!.zoningDistrict).toBeUndefined();
  });

  it('returns vector extents rather than pretending to read an aerial photo', async () => {
    const { site, sources } = await makeLiveSources({ address: HOLLISTON, fetch: recorded, now });
    expect(await sources.aerial(site)).toBeNull();

    const fp = await sources.footprint!(site);
    if (fp) {
      expect(fp.building.widthFt).toBeGreaterThan(10);
      expect(fp.building.depthFt).toBeGreaterThan(10);
      expect(fp.toleranceFt).toBeGreaterThan(0);
    }
  });

  it('names what it structurally cannot answer', async () => {
    const { notAvailableLive } = await makeLiveSources({ address: HOLLISTON, fetch: recorded, now });
    expect(notAvailableLive).toContain('electrical.bus_rating_a');
    expect(notAvailableLive).toContain('site.owner');
    expect(notAvailableLive).toContain('pad_zone.width_ft');
    expect(NOT_AVAILABLE_FROM_GIS.length).toBeGreaterThan(10);
  });
});

describe('the agents run unchanged on live data', () => {
  it('passes the gatekeeper with real values and no fixture in sight', async () => {
    const { site, sources } = await makeLiveSources({ address: HOLLISTON, fetch: recorded, now });
    const { runs, known } = await runDiscovery(site, sources);

    for (const r of runs) {
      const detail = r.gate.rejected.map((x) => `${x.fieldKey}: ${x.reasons.join('; ')}`);
      expect(detail, `${r.agentId} had rejections on live data`).toEqual([]);
    }
    expect(Object.keys(known).length).toBeGreaterThan(0);
  });

  it('labels every live value as real, never synthetic', async () => {
    const { site, sources } = await makeLiveSources({ address: HOLLISTON, fetch: recorded, now });
    const { runs } = await runDiscovery(site, sources);
    const accepted = runs.flatMap((r) => r.gate.accepted);
    expect(accepted.length).toBeGreaterThan(0);
    // The fixture path sets synthetic: true on every payload. This path must not.
    expect(accepted.every((a) => a.proposal.evidence.synthetic !== true)).toBe(true);
  });

  it('still leaves the decisive electrical facts unresolved, which is the point', async () => {
    const { site, sources } = await makeLiveSources({ address: HOLLISTON, fetch: recorded, now });
    const { known, unresolved } = await runDiscovery(site, sources);

    // Public GIS gets you the lot and the building. It does not get you the switchgear.
    expect(known['electrical.bus_rating_a']).toBeUndefined();
    expect(known['electrical.main_breaker_a']).toBeUndefined();
    expect(unresolved).toContain('electrical.bus_rating_a');
  });
});

describe('a parcel with several structures', () => {
  it('names the largest roofprint as the building, not whichever came first', async () => {
    const { site, sources } = await makeLiveSources({ address: HOLLISTON, fetch: recorded, now });
    const fp = await sources.footprint!(site);
    if (!fp) return;

    const primary = fp.building.widthFt * fp.building.depthFt;
    for (const other of fp.otherBuildings) {
      expect(other.widthFt * other.depthFt).toBeLessThanOrEqual(primary);
    }
  });

  it('keeps the other structures, because clearances are measured to all of them', async () => {
    const { site, sources } = await makeLiveSources({ address: HOLLISTON, fetch: recorded, now });
    const fp = await sources.footprint!(site);
    if (!fp) return;
    expect(Array.isArray(fp.otherBuildings)).toBe(true);
    // Dropping them would understate the keep-out and overstate the usable yard.
    expect(fp.label).toMatch(/largest of \d+/);
  });

  it('sorts roofprints by area, largest first', () => {
    const feat = (w: number, h: number) => ({
      id: `b${w}`, kind: 'building_outline' as const, field: 'building_outline',
      geometry: {
        type: 'Polygon' as const,
        coordinates: [[[-71.5, 42.0], [-71.5 + w, 42.0], [-71.5 + w, 42.0 + h], [-71.5, 42.0 + h], [-71.5, 42.0]]] as [number, number][][],
      },
    });
    const sorted = buildingsByArea([feat(0.0001, 0.0001), feat(0.001, 0.001), feat(0.0005, 0.0005)]);
    expect(sorted).toHaveLength(3);
    expect(sorted[0]!.areaFt2).toBeGreaterThan(sorted[1]!.areaFt2);
    expect(sorted[1]!.areaFt2).toBeGreaterThan(sorted[2]!.areaFt2);
  });
});
