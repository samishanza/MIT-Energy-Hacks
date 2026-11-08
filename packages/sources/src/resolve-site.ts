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

export type ResolveCandidate = { id: string; label: string; source: string };

export type ResolveResult = { status: "resolved"; anchor: SiteAnchor } | { status: "needs_choice"; candidates: ResolveCandidate[] };

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

const STATE_NAMES: Record<string, string> = {
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA", COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE",
  FLORIDA: "FL", GEORGIA: "GA", HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL", INDIANA: "IN", IOWA: "IA", KANSAS: "KS", KENTUCKY: "KY",
  LOUISIANA: "LA", MAINE: "ME", MARYLAND: "MD", MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN", MISSISSIPPI: "MS", MISSOURI: "MO",
  MONTANA: "MT", NEBRASKA: "NE", NEVADA: "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
  "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK", OREGON: "OR", PENNSYLVANIA: "PA", "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT", VERMONT: "VT", VIRGINIA: "VA", WASHINGTON: "WA",
  "WEST VIRGINIA": "WV", WISCONSIN: "WI", WYOMING: "WY", "DISTRICT OF COLUMBIA": "DC",
};
const STATE_CODES = new Set(Object.values(STATE_NAMES));

export type ParsedAddress = { street: string; city: string; state?: string };

// Only the last word is a street type, so 12 Court St and 167 West Boylston Dr keep their names.
export function normalizeStreet(street: string): string {
  const words = street.trim().toUpperCase().replace(/[.#]/g, "").split(/\s+/);
  const last = words.at(-1)!;
  words[words.length - 1] = STREET_WORDS[last] ?? last;
  return words.join(" ");
}

// The street without its house number: 100 Research Drive, Worcester becomes RESEARCH DR.
export function streetNameOf(address: string): string | null {
  return parseAddress(address)?.street.replace(/^\S+\s+/, "") ?? null;
}

// Takes a state off the end of the text, as a code or a name, with any ZIP code after it.
function splitState(text: string): { rest: string; state?: string } {
  const withoutZip = text.trim().replace(/[\s,]+\d{5}(?:-\d{4})?$/, "").replace(/[\s,]+(?:USA?|UNITED STATES)$/i, "");
  const upper = withoutZip.toUpperCase();
  for (const name of Object.keys(STATE_NAMES)) {
    if (upper.endsWith(` ${name}`) || upper.endsWith(`,${name}`)) return { rest: withoutZip.slice(0, -name.length).replace(/[\s,]+$/, ""), state: STATE_NAMES[name] };
  }
  const code = /[\s,]([A-Za-z]{2})$/.exec(withoutZip)?.[1]?.toUpperCase();
  if (code && STATE_CODES.has(code)) return { rest: withoutZip.slice(0, -2).replace(/[\s,]+$/, ""), state: code };
  return { rest: withoutZip };
}

// Written the way assessors write it: 100 Research Drive, Worcester becomes 100 RESEARCH DR, WORCESTER.
// Text with no comma between street and city doesn't parse, and canonicalAddress sends it to the geocoder.
export function parseAddress(address: string): ParsedAddress | null {
  const { rest, state } = splitState(address);
  const [street, city] = rest.split(",").map((part) => part.trim());
  if (!street || !city) return null;
  return { street: normalizeStreet(street), city: city.toUpperCase(), ...(state ? { state } : {}) };
}

export type CanonicalAddress =
  | { status: "ok"; address: string }
  | { status: "failed"; reason: string }
  | { status: "choose"; candidates: ResolveCandidate[] }
  | { status: "unknown" };

// A choice of spelling carries the address itself, so the next request can use it.
export const ADDRESS_CANDIDATE = "address:";

// Any common spelling becomes one the rest of the pipeline reads.
export async function canonicalAddress(address: string, ctx: CollectContext): Promise<CanonicalAddress> {
  if (parseAddress(address)?.state) return { status: "ok", address };
  const { matches, failure } = await geocodeAddress(address, ctx);
  if (failure) return { status: "failed", reason: failure };
  const usable = matches.filter((match) => parseAddress(match.matchedAddress)?.state);
  if (usable.length === 1) return { status: "ok", address: usable[0]!.matchedAddress };
  if (usable.length > 1) {
    return { status: "choose", candidates: usable.map((match) => ({ id: `${ADDRESS_CANDIDATE}${match.matchedAddress}`, label: match.matchedAddress, source: CENSUS_SOURCE.name })) };
  }
  return { status: "unknown" };
}

function quoted(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

// An assessor's address as a street: 367 MAIN STREET (HYANNIS), HYANNIS becomes 367 MAIN ST.
function streetOf(siteAddress: unknown): string {
  return normalizeStreet(String(siteAddress ?? "").split(/[(,]/)[0]!);
}

const NEARBY_METERS = 30;

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
    if (!lookup) return { status: "resolved", anchor: { kind: "point", ...pin, method: "hand_placed" } };
    const atPin = await queryArcgis(lookup.entry, { kind: "point", ...pin }, ctx);
    const parcels = distinctParcels(atPin.features, lookup);
    if (parcels.length === 1 && hasPolygon(parcels[0]!)) return { status: "resolved", anchor: { kind: "parcel", parcel: parcels[0]!, lookup: atPin, pin } };
    return { status: "resolved", anchor: { kind: "point", ...pin, method: "hand_placed", parcelLookup: atPin } };
  }

  if (!lookup) return resolveFromGeocoder(address, ctx, choice);

  if (choice?.kind === "candidate" && !choice.candidateId.startsWith("geocoder:")) {
    const byId = await queryArcgis(lookup.entry, { kind: "attribute", where: `${lookup.idAttribute}=${quoted(choice.candidateId)}` }, ctx);
    const parcels = distinctParcels(byId.features, lookup);
    if (parcels.length === 1 && !hasPolygon(parcels[0]!)) return resolveFromGeocoder(address, ctx, undefined, withoutUsableParcel(byId));
    if (parcels.length === 1) return { status: "resolved", anchor: { kind: "parcel", parcel: parcels[0]!, lookup: byId } };
    return { status: "needs_choice", candidates: parcels.map((parcel) => parcelCandidate(parcel, lookup)) };
  }
  if (choice?.kind === "candidate") {
    const geocode = await geocodeAddress(address, ctx);
    const match = geocode.matches.find((candidate) => `geocoder:${candidate.longitude},${candidate.latitude}` === choice.candidateId);
    if (!match) return resolveFromGeocoder(address, ctx);
    const atPoint = await queryArcgis(lookup.entry, { kind: "point", longitude: match.longitude, latitude: match.latitude }, ctx);
    const parcels = distinctParcels(atPoint.features, lookup);
    if (parcels.length === 1 && hasPolygon(parcels[0]!)) return { status: "resolved", anchor: { kind: "parcel", parcel: parcels[0]!, lookup: atPoint } };
    return { status: "resolved", anchor: { kind: "point", longitude: match.longitude, latitude: match.latitude, method: "geocoded_interpolated", geocode, parcelLookup: atPoint } };
  }

  const parsed = parseAddress(address);
  if (!parsed) return { status: "needs_choice", candidates: [] };

  // Fast path. The statewide parcel layer answers a search by location in well under a second but
  // takes about a minute to search by address, so the parcels around the geocoded point are read
  // first and one whose assessor address matches is taken. Only otherwise does the address search run.
  const near = await parcelNearGeocode(address, parsed, region, lookup, ctx);
  if (near) return near;

  const where = `${lookup.addressAttribute}=${quoted(parsed.street)} AND ${lookup.cityAttribute}=${quoted(parsed.city)}`;
  const result = await queryArcgis(lookup.entry, { kind: "attribute", where }, ctx);

  // With the parcel service down, a labeled Census point still lets the other sources run.
  if (result.failure) return resolveFromGeocoder(address, ctx, undefined, result);

  const parcels = distinctParcels(result.features, lookup);
  if (parcels.length === 0) return resolveNearby(address, parsed, region, lookup, ctx);
  if (parcels.length === 1 && !hasPolygon(parcels[0]!)) return resolveFromGeocoder(address, ctx, undefined, withoutUsableParcel(result));
  if (parcels.length === 1) return { status: "resolved", anchor: { kind: "parcel", parcel: parcels[0]!, lookup: result } };
  return { status: "needs_choice", candidates: parcels.map((parcel) => parcelCandidate(parcel, lookup)) };
}

async function parcelNearGeocode(address: string, parsed: ParsedAddress, region: RegionConfig, lookup: ParcelLookup, ctx: CollectContext): Promise<ResolveResult | null> {
  const geocode = await geocodeAddress(address, ctx);
  if (geocode.failure || geocode.matches.length !== 1) return null;
  const match = geocode.matches[0]!;
  const nearby = await queryArcgis(lookup.entry, { kind: "point", longitude: match.longitude, latitude: match.latitude, bufferMeters: lookup.nearbyMeters ?? NEARBY_METERS }, ctx);
  if (nearby.failure) return null;
  const town = (region.villages?.[parsed.city] ?? parsed.city).toUpperCase();
  const matching = distinctParcels(nearby.features, lookup).filter(
    (parcel) => hasPolygon(parcel) && streetOf(parcel.attributes[lookup.addressAttribute]) === parsed.street && String(parcel.attributes[lookup.cityAttribute] ?? "").toUpperCase() === town,
  );
  return matching.length === 1 ? { status: "resolved", anchor: { kind: "parcel", parcel: matching[0]!, lookup: nearby } } : null;
}

// When the address isn't written the way the assessor wrote it: the town for a village, the street
// spelled out, a number missing. Parcels near the geocoded point and by house number and street are
// searched. One that matches the address anchors the site, and otherwise each is offered as a choice.
async function resolveNearby(address: string, parsed: ParsedAddress, region: RegionConfig, lookup: ParcelLookup, ctx: CollectContext): Promise<ResolveResult> {
  const town = region.villages?.[parsed.city] ?? parsed.city;
  const [number, firstWord] = parsed.street.split(" ");
  const plain = (text: string) => text.replace(/[%_'\\[\]]/g, "");
  const byNumber =
    number && /^\d/.test(number) && firstWord
      ? queryArcgis(lookup.entry, { kind: "attribute", where: `${lookup.addressAttribute} LIKE '${plain(number)} ${plain(firstWord)}%' AND ${lookup.cityAttribute}=${quoted(town)}` }, ctx)
      : null;
  const geocode = await geocodeAddress(address, ctx);
  const nearby = geocode.matches
    .slice(0, 3)
    .map((match) => queryArcgis(lookup.entry, { kind: "point", longitude: match.longitude, latitude: match.latitude, bufferMeters: lookup.nearbyMeters ?? NEARBY_METERS }, ctx));
  const results = (await Promise.all([byNumber, ...nearby])).filter((result): result is ArcgisResult => Boolean(result));

  const found = distinctParcels(results.flatMap((result) => result.features), lookup);
  const matching = found.filter((parcel) => hasPolygon(parcel) && streetOf(parcel.attributes[lookup.addressAttribute]) === parsed.street);
  if (matching.length === 1) {
    const parcel = matching[0]!;
    const lookupResult = results.find((result) => result.features.some((feature) => feature.objectId === parcel.objectId))!;
    return { status: "resolved", anchor: { kind: "parcel", parcel, lookup: lookupResult } };
  }
  // With the parcel service failing, the point carries the failure, so a parcel-anchored record is kept.
  const failed = results.find((result) => result.failure);
  if (failed && found.length === 0) return resolveFromGeocoder(address, ctx, undefined, failed);
  return {
    status: "needs_choice",
    candidates: [
      ...found.map((parcel) => parcelCandidate(parcel, lookup)),
      ...geocode.matches.map((match) => ({ id: `geocoder:${match.longitude},${match.latitude}`, label: `${match.matchedAddress} (a point on the street, where no parcel matched the address)`, source: CENSUS_SOURCE.name })),
    ],
  };
}
