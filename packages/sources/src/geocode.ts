import type { Source } from "@eqore/contract";
import { RECORDED_AT_HEADER, type CollectContext } from "./arcgis.ts";

export const CENSUS_SOURCE: Source = {
  id: "census-geocoder",
  name: "US Census geocoder",
  kind: "geocoder",
  dataOrigin: "real",
  url: "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
  licenseNote: "Terms not yet read for production use. A point interpolated along the street, not a located building.",
};

export type GeocodeMatch = { longitude: number; latitude: number; matchedAddress: string };

export type GeocodeResult = {
  query: string;
  retrievedAt: string;
  matches: GeocodeMatch[];
  failure?: string;
};

export async function geocodeAddress(address: string, ctx: CollectContext): Promise<GeocodeResult> {
  const params = new URLSearchParams({ address, benchmark: "Public_AR_Current", format: "json" });
  const query = `address ${address}`;
  const url = `${CENSUS_SOURCE.url}?${params}`;
  try {
    const response = await ctx.fetch(url, { signal: AbortSignal.timeout(30_000) });
    const retrievedAt = response.headers.get(RECORDED_AT_HEADER) ?? ctx.now();
    if (!response.ok) return { query, retrievedAt, matches: [], failure: `The geocoder returned HTTP ${response.status}` };
    const body = (await response.json()) as {
      result?: { addressMatches?: { matchedAddress: string; coordinates: { x: number; y: number } }[] };
    };
    return {
      query,
      retrievedAt,
      matches: (body.result?.addressMatches ?? []).map((match) => ({
        longitude: match.coordinates.x,
        latitude: match.coordinates.y,
        matchedAddress: match.matchedAddress,
      })),
    };
  } catch (error) {
    return { query, retrievedAt: ctx.now(), matches: [], failure: `The geocoder could not be reached: ${(error as Error).message}` };
  }
}
