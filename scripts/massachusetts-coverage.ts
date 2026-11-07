// Runs a fixed list of public Massachusetts addresses through live collection and reports how many
// reach a map, get a parcel, name a utility, and get grid data. City and town halls only, so no
// customer's site is ever queried. Makes live requests, so run it by hand:
//   node --disable-warning=ExperimentalWarning scripts/massachusetts-coverage.ts
import type { Value } from "@eqore/contract";
import { REGIONS, canonicalAddress, collectSite, deriveValues, resolveSite, selectRegion, siteIdFor, type CollectContext } from "@eqore/sources";

const ADDRESSES = [
  "100 Research Dr, Worcester, MA",
  "455 Main St, Worcester, MA",
  "1 City Hall Sq, Boston, MA",
  "375 Merrimack St, Lowell, MA",
  "36 Court St, Springfield, MA",
  "1 Government Ctr, Fall River, MA",
  "367 Main St, Hyannis, MA",
  "70 Allen St, Pittsfield, MA",
  "703 Washington St, Holliston, MA",
  "11 Bartzak Dr, Holliston, MA",
  "133 William St, New Bedford, MA",
  "93 Highland Ave, Somerville, MA",
  "795 Massachusetts Ave, Cambridge, MA",
  "200 Common St, Lawrence, MA",
  "536 Dwight St, Holyoke, MA",
  "210 Main St, Northampton, MA",
  "718 Main St, Fitchburg, MA",
  "1305 Hancock St, Quincy, MA",
  "45 School St, Brockton, MA",
  "93 Washington St, Salem, MA",
  "60 Pleasant St, Newburyport, MA",
  "16 Broad St, Nantucket, MA",
  "78 Main St, Hudson, MA",
  "100 Maple Ave, Shrewsbury, MA",
  "17 Springfield St, Chicopee, MA",
  "26 Court St, Plymouth, MA",
  "150 Concord St, Framingham, MA",
];

type Row = { address: string; reached: string; parcel: boolean; utility: string; named: boolean; grid: boolean; seconds: number };

const text = (value: Value | undefined) => (value?.current?.type === "text" ? value.current.value : "");

async function check(address: string): Promise<Row> {
  const started = Date.now();
  const row: Row = { address, reached: "", parcel: false, utility: "", named: false, grid: false, seconds: 0 };
  const done = () => ({ ...row, seconds: Math.round((Date.now() - started) / 1000) });
  const ctx: CollectContext = { siteId: "", fetch, now: () => new Date().toISOString() };
  const canonical = await canonicalAddress(address, ctx);
  const region = canonical ? selectRegion(canonical, REGIONS) : null;
  if (!canonical || !region) return { ...done(), reached: "no region" };
  ctx.siteId = siteIdFor(canonical);
  const resolved = await resolveSite(canonical, region, ctx);
  if (resolved.status === "needs_choice") {
    return { ...done(), reached: resolved.candidates.length ? `choice of ${resolved.candidates.length}, or a pin` : "a pin only" };
  }
  const collection = await collectSite(canonical, region, resolved.anchor, ctx);
  const values = new Map(deriveValues(collection.observations).map((value) => [value.field, value]));
  const utility = values.get("serving_utility");
  row.reached = "map";
  row.parcel = resolved.anchor.kind === "parcel";
  row.named = utility?.state === "inferred" || utility?.state === "verified";
  row.utility = row.named ? text(utility) : utility?.state === "conflicting" ? `one of ${utility.candidates?.map((candidate) => (candidate.value?.type === "text" ? candidate.value.value : "")).join(", ")}` : "none";
  const feeder = values.get("feeder");
  row.grid = feeder?.state === "inferred" || feeder?.state === "conflicting";
  return done();
}

const rows: Row[] = [];
for (let index = 0; index < ADDRESSES.length; index += 3) {
  rows.push(...(await Promise.all(ADDRESSES.slice(index, index + 3).map((address) => check(address).catch((error: Error) => ({ address, reached: `error: ${error.message}`, parcel: false, utility: "", named: false, grid: false, seconds: 0 }))))));
}

const yes = (flag: boolean) => (flag ? "yes" : "no");
console.log(`Run ${new Date().toISOString()}, ${rows.length} addresses\n`);
console.log("| Address | Reached | Parcel | Utility | Grid data | Seconds |\n|---|---|---|---|---|---|");
for (const row of rows) console.log(`| ${row.address} | ${row.reached} | ${yes(row.parcel)} | ${row.utility} | ${yes(row.grid)} | ${row.seconds} |`);
const count = (test: (row: Row) => boolean) => `${rows.filter(test).length} of ${rows.length}`;
console.log(`
- Reached a map: ${count((row) => row.reached === "map")}
- Reached a map or offered a choice: ${count((row) => row.reached === "map" || row.reached.startsWith("choice"))}
- Got a parcel: ${count((row) => row.parcel)}
- Named one utility: ${count((row) => row.named)}
- Named the utility or its candidates: ${count((row) => row.named || row.utility.startsWith("one of"))}
- Got grid data: ${count((row) => row.grid)}`);
