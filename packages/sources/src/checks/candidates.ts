// Candidate pad areas, computed once, in the pipeline.
//
// The contract has carried a `candidate_area` feature kind for a while and nothing
// emitted one, so the site-plan sheet was deriving pad zones client-side from the
// geometry it was handed. Two derivations of the same thing is how a drawing and a
// record start disagreeing without anyone noticing. This moves the derivation here, so
// the sheet draws what the record says rather than second-guessing it.
//
// What it computes is OPEN GROUND: the lot, less a keep-out around every structure, less
// the strip inside the lot line. That is a different claim from paved, level and
// unobstructed, and the observation says so in its reason rather than leaving a reader to
// assume. Surface type, drainage, easements and parked trailers are all invisible to a
// vector layer.

import type { MapFeature, Observation } from "@eqore/contract";
import {
  derivePadCandidates,
  frameFor,
  polygonAreaSqft,
  toLocalPolygon,
  toLonLat,
  type LocalFrame,
  type LocalPolygon,
} from "@eqore/geom";
import { observe, type CollectContext, type ObservationOrigin, type PolygonGeometry } from "../arcgis.ts";

export type CandidateInputs = {
  parcel: PolygonGeometry;
  outlines: PolygonGeometry[];
  origin: ObservationOrigin;
};

export type CandidateOptions = {
  /** Keep-out around every structure. The NFPA 855 outdoor default is 10 ft. */
  buildingBufferFt?: number;
  /** Keep-out inside the lot line. */
  lotSetbackFt?: number;
  /** Ignore slivers below this. */
  minAreaSqft?: number;
  /** Grid step for the inscribed-rectangle search. This IS the precision of the answer. */
  stepFt?: number;
  /** How many to report. The rest are summarised in the count. */
  limit?: number;
};

export type CandidateResult = { observations: Observation[]; features: MapFeature[] };

const DEFAULTS = { buildingBufferFt: 10, lotSetbackFt: 10, minAreaSqft: 600, stepFt: 5, limit: 4 };

function ringToLonLat(frame: LocalFrame, poly: LocalPolygon): [number, number][][] {
  const ring = (points: { x: number; y: number }[]) => {
    const coords = points.map((point) => toLonLat(frame, point) as [number, number]);
    return coords.length && coords[0] ? [...coords, coords[0]] : coords;
  };
  return [ring(poly.outer), ...(poly.holes ?? []).map(ring)];
}

/**
 * Derive candidate pad areas and emit them as map features plus one observation.
 *
 * Returns nothing when the keep-outs consume the lot, which is a real and useful answer:
 * it means this site has no open ground that clears the setbacks, and nobody needs to
 * drive there to find that out.
 */
export function padCandidates(input: CandidateInputs, ctx: CollectContext, options: CandidateOptions = {}): CandidateResult {
  const settings = { ...DEFAULTS, ...options };

  const outerRing =
    input.parcel.type === "Polygon" ? input.parcel.coordinates.flat() : input.parcel.coordinates.flat(2);
  const frame = frameFor(outerRing);

  const lot = toLocalPolygon(input.parcel, frame)[0];
  if (!lot) return { observations: [], features: [] };

  const buildings = input.outlines.flatMap((outline) => toLocalPolygon(outline, frame));
  const candidates = derivePadCandidates(lot, buildings, frame, settings).slice(0, settings.limit);

  const reason =
    `Open ground on the lot, less ${settings.buildingBufferFt} ft around each of ${buildings.length} ` +
    `structure(s) and the ${settings.lotSetbackFt} ft strip inside the lot line, fitted on a ` +
    `${settings.stepFt} ft grid. Geometry only — this does not say the ground is paved, level or ` +
    `unobstructed, which no vector layer can tell you.`;

  if (candidates.length === 0) {
    return {
      observations: [
        observe(input.origin, ctx, {
          field: "candidate_areas",
          kind: "no_value",
          value: null,
          reason: `No open area of at least ${settings.minAreaSqft} sq ft survives the keep-outs. ${reason}`,
        }),
      ],
      features: [],
    };
  }

  const largest = candidates[0]!;

  const features: MapFeature[] = candidates.map((candidate, index) => ({
    id: `candidate-area-${index + 1}`,
    kind: "candidate_area",
    field: "candidate_areas",
    geometry: { type: "Polygon", coordinates: ringToLonLat(frame, candidate.polygon) },
    label:
      `P${index + 1}: ${Math.round(candidate.areaSqft).toLocaleString("en-US")} sq ft open, ` +
      `largest box ${candidate.rect.w.toFixed(0)} x ${candidate.rect.h.toFixed(0)} ft`,
  }));

  return {
    observations: [
      observe(input.origin, ctx, {
        field: "candidate_areas",
        kind: "reading",
        value: { type: "quantity", value: Math.round(largest.areaSqft), unit: "sqft" },
        attribute: "largest open area clear of the structures and the lot-line setback",
        reason,
      }),
      observe(input.origin, ctx, {
        field: "pad_zone_width_ft",
        kind: "reading",
        value: { type: "quantity", value: largest.rect.w, unit: "ft" },
        attribute: `largest axis-aligned box inside the open area, on a ${settings.stepFt} ft grid`,
        reason,
      }),
      observe(input.origin, ctx, {
        field: "pad_zone_depth_ft",
        kind: "reading",
        value: { type: "quantity", value: largest.rect.h, unit: "ft" },
        attribute: `largest axis-aligned box inside the open area, on a ${settings.stepFt} ft grid`,
        reason,
      }),
    ],
    features,
  };
}

export { polygonAreaSqft };
