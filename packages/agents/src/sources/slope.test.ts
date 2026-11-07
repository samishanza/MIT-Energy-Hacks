import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fixtureFetch } from '@eqore/sources';
import { DEM_VERTICAL_UNIT, firstBand, fitSlope, measureSlope, sampleElevations } from './slope';

const dir = (name: string) => fileURLToPath(new URL(`../../../../fixtures/${name}`, import.meta.url));
const recorded = fixtureFetch(dir('elevation'));

// The real envelope that was recorded, over the Holliston demo parcel.
const BOX = { west: -71.428, south: 42.229, east: -71.4266, north: 42.2301 };

describe('reading the DEM', () => {
  it('takes only the first band from a multi-band pixel string', () => {
    // getSamples returns "<elevation> <mask>". Taking the whole string, or the last
    // number, would silently hand back 1.
    expect(firstBand('104.584 1')).toBeCloseTo(104.584, 3);
    expect(firstBand('98.228027344 1.000000000')).toBeCloseTo(98.228, 3);
    expect(firstBand(undefined)).toBeNull();
    expect(firstBand('NoData')).toBeNull();
  });

  it('converts metres to feet, because the service reports metres', () => {
    expect(DEM_VERTICAL_UNIT).toBe('meters');
  });

  it('samples a real envelope and drops NoData', async () => {
    const samples = await sampleElevations(BOX, recorded, 36);
    expect(samples.length).toBeGreaterThan(20);
    for (const s of samples) {
      expect(Number.isFinite(s.elevationFt)).toBe(true);
      // Holliston sits a few hundred feet up. In metres these would read ~100.
      expect(s.elevationFt).toBeGreaterThan(200);
      expect(s.elevationFt).toBeLessThan(600);
    }
  });
});

describe('fitting a slope', () => {
  it('reads zero on flat ground', () => {
    const flat = [
      { lon: -71.43, lat: 42.23, elevationFt: 300 },
      { lon: -71.429, lat: 42.23, elevationFt: 300 },
      { lon: -71.43, lat: 42.231, elevationFt: 300 },
      { lon: -71.429, lat: 42.231, elevationFt: 300 },
    ];
    const fit = fitSlope(flat)!;
    expect(fit.slopePercent).toBeCloseTo(0, 2);
    expect(fit.reliefFt).toBe(0);
  });

  it('measures a known grade', () => {
    // 10 ft of rise over ~100 ft east = 10%.
    const ftPerDegLon = 364_000 * Math.cos((42.23 * Math.PI) / 180);
    const dLon = 100 / ftPerDegLon;
    const ramp = [
      { lon: -71.43, lat: 42.23, elevationFt: 300 },
      { lon: -71.43 + dLon, lat: 42.23, elevationFt: 310 },
      { lon: -71.43, lat: 42.2305, elevationFt: 300 },
      { lon: -71.43 + dLon, lat: 42.2305, elevationFt: 310 },
    ];
    const fit = fitSlope(ramp)!;
    expect(fit.slopePercent).toBeCloseTo(10, 0);
    // Ground rises to the east, so it falls to the west: bearing 270.
    expect(fit.aspectDegrees).toBeCloseTo(270, 0);
  });

  it('is not thrown by one bad return', () => {
    // A single spike — a parked trailer or a fence post in the bare-earth model.
    const mostlyFlat = [
      { lon: -71.43, lat: 42.23, elevationFt: 300 },
      { lon: -71.4295, lat: 42.23, elevationFt: 300 },
      { lon: -71.43, lat: 42.2305, elevationFt: 300 },
      { lon: -71.4295, lat: 42.2305, elevationFt: 300 },
      { lon: -71.42975, lat: 42.23025, elevationFt: 340 },
    ];
    const fit = fitSlope(mostlyFlat)!;
    // A max-pairwise-difference reading would call this a 40 ft drop. A plane fit
    // through five points barely moves, which is the point of fitting a plane.
    expect(fit.slopePercent).toBeLessThan(5);
  });

  it('refuses to fit fewer than three points, or collinear ones', () => {
    expect(fitSlope([{ lon: -71.43, lat: 42.23, elevationFt: 300 }])).toBeNull();
    const collinear = [
      { lon: -71.43, lat: 42.23, elevationFt: 300 },
      { lon: -71.429, lat: 42.23, elevationFt: 301 },
      { lon: -71.428, lat: 42.23, elevationFt: 302 },
    ];
    expect(fitSlope(collinear)).toBeNull();
  });
});

describe('measureSlope on real recorded ground', () => {
  it('returns a plausible slope for the Holliston parcel', async () => {
    const result = await measureSlope(BOX, recorded, 36);
    expect(result).toBeTruthy();
    expect(result!.slopePercent).toBeGreaterThan(0);
    expect(result!.slopePercent).toBeLessThan(60);
    expect(result!.sampleCount).toBeGreaterThan(20);
    expect(result!.aspectDegrees).toBeGreaterThanOrEqual(0);
    expect(result!.aspectDegrees).toBeLessThan(360);
  });

  it('reports the DEM resolution, which is the floor on what it can resolve', async () => {
    const result = await measureSlope(BOX, recorded, 36);
    // 1.38 m pixels, about 4.5 ft.
    expect(result!.demResolutionFt).toBeGreaterThan(4);
    expect(result!.demResolutionFt).toBeLessThan(5);
  });

  it('is labelled real, not synthetic', async () => {
    const result = await measureSlope(BOX, recorded, 36);
    expect(result!.synthetic).toBeUndefined();
    expect(result!.label).toMatch(/MassGIS LiDAR/);
  });
});
