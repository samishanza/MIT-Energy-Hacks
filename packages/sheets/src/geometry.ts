// Pull drawable geometry out of a contract RecordVersion.
//
// The sheet draws what the record actually holds — nothing is invented here. If the
// record has no lot polygon, the sheet says so rather than drawing a plausible rectangle.

import type { MapFeature, RecordVersion } from '@eqore/contract';
import {
  boundingRect,
  derivePadCandidates,
  frameFor,
  largestInscribedRect,
  polygonAreaSqft,
  toLocalPolygon,
  type LocalFrame,
  type LocalPolygon,
  type PadCandidate,
  // The geometry leaf package, not @eqore/drc, whose index reaches server-only collection code.
} from '@eqore/geom';

export interface SheetGeometry {
  frame: LocalFrame;
  lot: LocalPolygon | null;
  buildings: LocalPolygon[];
  pads: PadCandidate[];
  /** Extent of everything drawable, in local feet. */
  extent: { x: number; y: number; w: number; h: number };
  lotAreaSqft: number | null;
  /** Why there is nothing to draw, when that is the case. */
  reason?: string;
  /**
   * True when the pad zones came from the record's own candidate_area features rather
   * than being recomputed here. Shown on the sheet, because a drawing that agrees with
   * the record and a drawing that merely resembles it are different things.
   */
  padsFromRecord: boolean;
}

export interface PadOptions {
  /** Keep-out around every structure. NFPA 855 outdoor default is 10 ft. */
  buildingBufferFt?: number;
  /** Keep-out inside the lot line. */
  lotSetbackFt?: number;
  minAreaSqft?: number;
  stepFt?: number;
}

const polygonsOf = (features: MapFeature[], kind: MapFeature['kind'], frame: LocalFrame) =>
  features
    .filter((f) => f.kind === kind && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
    .flatMap((f) => toLocalPolygon(f.geometry as Parameters<typeof toLocalPolygon>[0], frame));

export function sheetGeometry(record: RecordVersion, opts: PadOptions = {}): SheetGeometry {
  const lotFeature = record.features.find((f) => f.kind === 'property_line');

  if (!lotFeature || (lotFeature.geometry.type !== 'Polygon' && lotFeature.geometry.type !== 'MultiPolygon')) {
    const empty = { originLon: 0, originLat: 0, ftPerLon: 1 };
    return {
      frame: empty,
      lot: null,
      buildings: [],
      pads: [],
      extent: { x: 0, y: 0, w: 1, h: 1 },
      lotAreaSqft: null,
      reason: 'This record has no parcel polygon, so there is no lot to draw.',
      padsFromRecord: false,
    };
  }

  // The frame is anchored on the lot, so x and y read as feet from its north-west corner.
  const ring =
    lotFeature.geometry.type === 'Polygon'
      ? lotFeature.geometry.coordinates.flat()
      : lotFeature.geometry.coordinates.flat(2);
  const frame = frameFor(ring);

  const lot = toLocalPolygon(lotFeature.geometry, frame)[0] ?? null;
  const buildings = polygonsOf(record.features, 'building_outline', frame);

  // Prefer what the pipeline computed. Recomputing here would be a second derivation of
  // the same thing, and two derivations are how a drawing and a record quietly diverge.
  const recorded = polygonsOf(record.features, 'candidate_area', frame);
  const padsFromRecord = recorded.length > 0;

  const pads: PadCandidate[] = padsFromRecord
    ? recorded
        .map((polygon) => ({
          polygon,
          areaSqft: polygonAreaSqft(polygon),
          rect: largestInscribedRect(polygon, opts.stepFt ?? 5),
          basis: 'Candidate area from the site record, derived during collection.',
        }))
        .sort((a, b) => b.areaSqft - a.areaSqft)
    : lot
      ? derivePadCandidates(lot, buildings, frame, {
          buildingBufferFt: opts.buildingBufferFt ?? 10,
          lotSetbackFt: opts.lotSetbackFt ?? 10,
          minAreaSqft: opts.minAreaSqft ?? 600,
          stepFt: opts.stepFt ?? 5,
        })
      : [];

  const extent = lot ? boundingRect(lot) : { x: 0, y: 0, w: 1, h: 1 };

  return {
    frame,
    lot,
    buildings,
    pads,
    extent,
    lotAreaSqft: lot ? polygonAreaSqft(lot) : null,
    reason: lot ? undefined : 'The parcel geometry could not be read.',
    padsFromRecord,
  };
}

export const ringPath = (ring: { x: number; y: number }[]) =>
  ring.length ? `M ${ring.map((p) => `${p.x} ${p.y}`).join(' L ')} Z` : '';

export function polygonPath(poly: LocalPolygon): string {
  return [ringPath(poly.outer), ...(poly.holes ?? []).map(ringPath)].filter(Boolean).join(' ');
}
