import { queryArcgis, type ArcgisFeature, type ArcgisResult, type CollectContext } from "./arcgis.ts";
import { CENSUS_SOURCE, geocodeAddress, type GeocodeResult } from "./geocode.ts";
import type { ParcelLookup, RegionConfig } from "./registry.ts";

export type SiteChoice =
  | { kind: "candidate"; candidateId: string }
  | { kind: "pin"; latitude: number; longitude: number };

export type SiteAnchor =
  // The site is anchored on the parcel found by address, and later queries use its geometry.
  | { kind: "parcel"; parcel: ArcgisFeature; lookup: ArcgisResult; pin?: { longitude: number; latitude: number } }
  | {
      kind: "point";
      longitude: number;
      latitude: number;
      method: "geocoded_interpolated" | "hand_placed";
      geocode?: GeocodeResult;
      // Why no parcel anchors this site, when a parcel source was asked.
      parcelLookup?: ArcgisResult;
    };

export type ResolveResult =
  | { status: "resolved"; anchor: SiteAnchor }
  | { status: "needs_choice"; candidates: { id: string; label: string; source: string }[] };

const STREET_WORDS: Record<string, string> = {
  STREET: "ST",
  AVENUE: "AVE",
  ROAD: "RD",
  DRIVE: "DR",
  BOULEVARD: "BLVD",
  LANE: "LN",
  COURT: "CT",
  PLACE: "PL",
  PARKWAY: "PKWY",
  HIGHWAY: "HWY",
  CIRCLE: "CIR",
  TERRACE: "TER",
};

export type ParsedAddress = { street: string; city: string };

// Written the way assessors write it: 100 Research Drive, Worcester becomes 100 RESEARCH DR, WORCESTER.
export function parseAddress(address: string): ParsedAddress | null {
  const [street, city] = address.split(",").map((part) => part.trim());
  if (!street || !city) return null;
  // Only the last word is a street type, so 12 Court St and 167 West Boylston Dr keep their names.
  const words = street.toUpperCase().replace(/[.#]/g, "").split(/\s+/);
  const last = words.at(-1)!;
  words[words.length - 1] = STREET_WORDS[last] ?? last;
  return { street: words.join(" "), city: city.toUpperCase() };
}

function quoted(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

function distinctParcels(features: ArcgisFeature[], lookup: ParcelLookup): ArcgisFeature[] {
  const byId = new Map<string, ArcgisFeature>();
  for (const feature of features) byId.set(String(feature.attributes[lookup.idAttribute]), feature);
  return [...byId.values()];
}

function parcelCandidate(feature: ArcgisFeature, lookup: ParcelLookup) {
  const a = feature.attributes;
  const details = [a[lookup.useAttribute], a[lookup.lotSizeAttribute] ? `${a[lookup.lotSizeAttribute]} ${a[lookup.lotUnitsAttribute] ?? ""}`.trim() : null]
    .filter(Boolean)
    .join(", ");
  return {
    id: String(a[lookup.idAttribute]),
    label: `${a[lookup.addressAttribute]}, ${a[lookup.cityAttribute]}${details ? ` (${details})` : ""}`,
    source: lookup.entry.name,
  };
}

function hasPolygon(parcel: ArcgisFeature): boolean {
  return parcel.geometry?.type === "Polygon" || parcel.geometry?.type === "MultiPolygon";
}

// A parcel with no shape can't anchor queries, so it's handled like a failed lookup.
function withoutUsableParcel(lookup: ArcgisResult): ArcgisResult {
  const failure = "The parcel came back with no polygon";
  return { ...lookup, features: [], failure, run: { ...lookup.run, status: "missing", reason: failure } };
}

async function resolveFromGeocoder(address: string, ctx: CollectContext, choice?: SiteChoice, parcelLookup?: ArcgisResult): Promise<ResolveResult> {
  const geocode = await geocodeAddress(address, ctx);
  const candidates = geocode.matches.map((match) => ({
    id: `geocoder:${match.longitude},${match.latitude}`,
    label: match.matchedAddress,
    source: CENSUS_SOURCE.name,
  }));
  const chosen = choice?.kind === "candidate" ? geocode.matches.find((match) => `geocoder:${match.longitude},${match.latitude}` === choice.candidateId) : undefined;
  const match = chosen ?? (geocode.matches.length === 1 ? geocode.matches[0] : undefined);
  if (!match) return { status: "needs_choice", candidates };
  return {
    status: "resolved",
    anchor: { kind: "point", longitude: match.longitude, latitude: match.latitude, method: "geocoded_interpolated", geocode, parcelLookup },
  };
}

export async function resolveSite(address: string, region: RegionConfig, ctx: CollectContext, choice?: SiteChoice): Promise<ResolveResult> {
  const lookup = region.parcels;

  if (choice?.kind === "pin") {
    const pin = { longitude: choice.longitude, latitude: choice.latitude };
    if (lookup) {
      const atPin = await queryArcgis(lookup.entry, { kind: "point", ...pin }, ctx);
      const parcels = distinctParcels(atPin.features, lookup);
      if (parcels.length === 1 && hasPolygon(parcels[0]!)) return { status: "resolved", anchor: { kind: "parcel", parcel: parcels[0]!, lookup: atPin, pin } };
      return { status: "resolved", anchor: { kind: "point", ...pin, method: "hand_placed", parcelLookup: atPin } };
    }
    return { status: "resolved", anchor: { kind: "point", ...pin, method: "hand_placed" } };
  }

  if (!lookup) return resolveFromGeocoder(address, ctx, choice);

  if (choice?.kind === "candidate" && !choice.candidateId.startsWith("geocoder:")) {
    const byId = await queryArcgis(lookup.entry, { kind: "attribute", where: `${lookup.idAttribute}=${quoted(choice.candidateId)}` }, ctx);
    const parcels = distinctParcels(byId.features, lookup);
    if (parcels.length === 1 && !hasPolygon(parcels[0]!)) return resolveFromGeocoder(address, ctx, undefined, withoutUsableParcel(byId));
    if (parcels.length === 1) return { status: "resolved", anchor: { kind: "parcel", parcel: parcels[0]!, lookup: byId } };
    return { status: "needs_choice", candidates: parcels.map((parcel) => parcelCandidate(parcel, lookup)) };
  }
  if (choice?.kind === "candidate") return resolveFromGeocoder(address, ctx, choice);

  const parsed = parseAddress(address);
  if (!parsed) return { status: "needs_choice", candidates: [] };

  const where = `${lookup.addressAttribute}=${quoted(parsed.street)} AND ${lookup.cityAttribute}=${quoted(parsed.city)}`;
  const result = await queryArcgis(lookup.entry, { kind: "attribute", where }, ctx);

  // With the parcel service down, a labeled Census point still lets the other sources run.
  if (result.failure) return resolveFromGeocoder(address, ctx, undefined, result);

  const parcels = distinctParcels(result.features, lookup);
  if (parcels.length === 1 && !hasPolygon(parcels[0]!)) return resolveFromGeocoder(address, ctx, undefined, withoutUsableParcel(result));
  if (parcels.length === 1) return { status: "resolved", anchor: { kind: "parcel", parcel: parcels[0]!, lookup: result } };
  return { status: "needs_choice", candidates: parcels.map((parcel) => parcelCandidate(parcel, lookup)) };
}
