import type { RecordVersion } from "@eqore/contract";

// Who has jurisdiction over a site and which codes apply, for the title block. Code adoptions are per state and
// were checked on the date given; the engineer of record confirms them for the permit date.

// short is how the sheet's notes cite it.
export type AppliedCode = { code: string; basis: string; short: string };
export type Jurisdiction = { ahj: string | null; codes: AppliedCode[]; checked: string | null; calculationNote: string | null };

// The edition the concept calculations' tables come from, in nec.ts.
export const CALCULATION_EDITION = "NFPA 70, 2023 edition";

type RegionCodes = { ahj: (municipality: string) => string; codes: AppliedCode[]; checked: string; electricalEdition: string };

const REGION_CODES: Record<string, RegionCodes> = {
  massachusetts: {
    ahj: (town) => `${town}, MA: building department, wiring inspector, and fire department`,
    codes: [
      { code: "527 CMR 12.00, Massachusetts Electrical Code", basis: "NFPA 70, 2026 edition, with Massachusetts amendments, for permits granted after April 24, 2026", short: "527 CMR 12.00 (NFPA 70, 2026)" },
      { code: "527 CMR 1.00, Massachusetts Comprehensive Fire Safety Code", basis: "NFPA 1, 2021 edition, with Massachusetts amendments; Chapter 52 energy storage draws on NFPA 855, 2020 edition", short: "527 CMR 1.00 (NFPA 1, 2021; ch. 52 from NFPA 855, 2020)" },
      { code: "780 CMR, Massachusetts State Building Code, 10th edition", basis: "2021 International Building Code, with Massachusetts amendments", short: "780 CMR, 10th edition (IBC 2021)" },
    ],
    checked: "2026-11-07",
    electricalEdition: "NFPA 70, 2026 edition",
  },
};

export function jurisdictionFor(record: RecordVersion): Jurisdiction {
  const region = REGION_CODES[record.site.region];
  if (!region) return { ahj: null, codes: [], checked: null, calculationNote: null };
  const town = record.values.find((value) => value.field === "municipality")?.current;
  const name = town?.type === "text" ? town.value.replace(/\b\w+/g, (word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase()) : null;
  return {
    ahj: name ? region.ahj(name) : null,
    codes: region.codes,
    checked: region.checked,
    calculationNote: region.electricalEdition === CALCULATION_EDITION ? null : `Concept calculations use ${CALCULATION_EDITION} tables; the adopted code is ${region.electricalEdition}.`,
  };
}
