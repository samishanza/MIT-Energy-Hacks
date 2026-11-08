// The 2023 NEC (NFPA 70) values these concept calculations use, transcribed once. Only the rows used are here,
// and the tests check a handful of each table against the book.

export type Material = "Cu" | "Al";

// Conductor sizes, smallest first. AWG sizes, then kcmil.
export const SIZES = ["14", "12", "10", "8", "6", "4", "3", "2", "1", "1/0", "2/0", "3/0", "4/0", "250", "300", "350", "400", "500", "600"] as const;
export type Size = (typeof SIZES)[number];

export const label = (size: Size) => (/^\d{3}$/.test(size) ? `${size} kcmil` : `${size} AWG`);

// 2023 NEC Table 310.16, ampacity of not more than three current-carrying conductors in raceway, 30 C ambient.
const AMPACITY: Record<`${Material}${75 | 90}`, Partial<Record<Size, number>>> = {
  Cu75: { "14": 20, "12": 25, "10": 35, "8": 50, "6": 65, "4": 85, "3": 100, "2": 115, "1": 130, "1/0": 150, "2/0": 175, "3/0": 200, "4/0": 230, "250": 255, "300": 285, "350": 310, "400": 335, "500": 380, "600": 420 },
  Cu90: { "14": 25, "12": 30, "10": 40, "8": 55, "6": 75, "4": 95, "3": 115, "2": 130, "1": 145, "1/0": 170, "2/0": 195, "3/0": 225, "4/0": 260, "250": 290, "300": 320, "350": 350, "400": 380, "500": 430, "600": 475 },
  Al75: { "12": 20, "10": 30, "8": 40, "6": 50, "4": 65, "3": 75, "2": 90, "1": 100, "1/0": 120, "2/0": 135, "3/0": 155, "4/0": 180, "250": 205, "300": 230, "350": 250, "400": 270, "500": 310, "600": 340 },
  Al90: { "12": 25, "10": 35, "8": 45, "6": 55, "4": 75, "3": 85, "2": 100, "1": 115, "1/0": 135, "2/0": 150, "3/0": 175, "4/0": 205, "250": 230, "300": 260, "350": 280, "400": 305, "500": 350, "600": 385 },
};

export function ampacity(material: Material, temperatureC: 75 | 90, size: Size): number | null {
  return AMPACITY[`${material}${temperatureC}`][size] ?? null;
}

// 2023 NEC Chapter 9, Table 8, DC resistance at 75 C, ohms per 1000 ft, uncoated copper and aluminum.
const RESISTANCE: Record<Material, Partial<Record<Size, number>>> = {
  Cu: { "6": 0.491, "4": 0.308, "3": 0.245, "2": 0.194, "1": 0.154, "1/0": 0.122, "2/0": 0.0967, "3/0": 0.0766, "4/0": 0.0608, "250": 0.0515, "300": 0.0429, "350": 0.0367, "400": 0.0321, "500": 0.0258, "600": 0.0214 },
  Al: { "6": 0.808, "4": 0.508, "3": 0.403, "2": 0.319, "1": 0.253, "1/0": 0.201, "2/0": 0.159, "3/0": 0.126, "4/0": 0.1, "250": 0.0847, "300": 0.0707, "350": 0.0605, "400": 0.0529, "500": 0.0424, "600": 0.0353 },
};

export function resistancePerKft(material: Material, size: Size): number | null {
  return RESISTANCE[material][size] ?? null;
}

// 2023 NEC 240.6(A), standard ampere ratings for fuses and inverse-time breakers.
export const STANDARD_OCPD_A = [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000, 5000, 6000];

export function nextStandardOcpd(amps: number): number | null {
  return STANDARD_OCPD_A.find((rating) => rating >= amps) ?? null;
}

// 2023 NEC Table 250.122, minimum equipment grounding conductor by the rating of the overcurrent device ahead of it.
const EGC: [number, Size, Size][] = [
  [15, "14", "12"],
  [20, "12", "10"],
  [60, "10", "8"],
  [100, "8", "6"],
  [200, "6", "4"],
  [300, "4", "2"],
  [400, "3", "1"],
  [500, "2", "1/0"],
  [600, "1", "2/0"],
  [800, "1/0", "3/0"],
  [1000, "2/0", "4/0"],
  [1200, "3/0", "250"],
];

export function groundingConductor(ocpdA: number, material: Material): Size | null {
  const row = EGC.find(([rating]) => ocpdA <= rating);
  return row ? (material === "Cu" ? row[1] : row[2]) : null;
}

// 2023 NEC 210.19(A)(1) and 215.2(A)(1): conductors carrying a continuous load are sized at 125% of it.
export const CONTINUOUS_FACTOR = 1.25;

// 2023 NEC 705.12(B)(3)(2): a power source's output current at 125% plus the main's rating may not exceed 120% of the busbar.
export const BUSBAR_FACTOR = 1.2;
