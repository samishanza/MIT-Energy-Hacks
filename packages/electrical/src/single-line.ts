import { CONCEPT_GRADE_NOTE } from "@eqore/contract";
import type { ElectricalDesign, LineItem, ServiceDesign } from "./design.ts";

// Drafting conventions shared with the site plan sheet: Arial capitals, (E) and (N), dashed where inferred or unknown.
const FONT = "Arial, Helvetica, sans-serif";
const INK = "#111";
const UTILITY = "#b5121b";
const MUTED = "#555";
const WIDTH = 1700;
const HEIGHT = 1150;

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && (line + " " + word).length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function text(x: number, y: number, content: string, size = 14, weight: "normal" | "bold" = "normal", fill = INK, anchor: "start" | "middle" = "start"): string {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escape(content)}</text>`;
}

const BOX = { x: 70, width: 500, gap: 22 };
// Tall enough for the title and every line under it.
const heightOf = (item: LineItem) => 36 + item.lines.length * 15 + 8;
const ORDER = ["utility", "service-transformer", "meter", "main-switchgear", "breaker", "disconnect", "isolation-transformer", "inverters", "bess"];

function itemBox(item: LineItem, y: number): string {
  const dashed = !item.known || item.inferred;
  const stroke = item.status === "E" ? UTILITY : INK;
  const parts = [`<rect x="${BOX.x}" y="${y}" width="${BOX.width}" height="${heightOf(item)}" fill="#fff" stroke="${stroke}" stroke-width="2.5"${dashed ? ' stroke-dasharray="10 6"' : ""}/>`];
  parts.push(text(BOX.x + 14, y + 24, `(${item.status}) ${item.title}`, 15, "bold", stroke));
  item.lines.forEach((line, index) => parts.push(text(BOX.x + 14, y + 42 + index * 15, line, 12.5, "normal", item.known ? INK : MUTED)));
  return parts.join("");
}

// Conductor tags between boxes, numbered as the schedule numbers them.
const TAG_BELOW: Record<string, number> = { breaker: 4, disconnect: 3, "isolation-transformer": 2, inverters: 1 };

function chain(design: ServiceDesign, top: number): string {
  const items = ORDER.map((id) => design.items.find((item) => item.id === id)!).filter(Boolean);
  const parts: string[] = [];
  let y = top;
  items.forEach((item, index) => {
    const height = heightOf(item);
    parts.push(itemBox(item, y));
    if (index < items.length - 1) {
      const x = BOX.x + BOX.width / 2;
      const utilitySide = item.status === "E" && items[index + 1]!.status === "E";
      parts.push(`<line x1="${x}" y1="${y + height}" x2="${x}" y2="${y + height + BOX.gap}" stroke="${utilitySide ? UTILITY : INK}" stroke-width="3"${utilitySide ? ' stroke-dasharray="8 6"' : ""}/>`);
      const tag = TAG_BELOW[item.id];
      if (tag) {
        const cy = y + height + BOX.gap / 2;
        parts.push(`<circle cx="${x + 34}" cy="${cy}" r="10" fill="#fff" stroke="${INK}" stroke-width="1.5"/>`, text(x + 34, cy + 4, String(tag), 11, "bold", INK, "middle"));
      }
      y += height + BOX.gap;
    }
  });
  // The auxiliary disconnect feeds the battery's own systems, beside the main path.
  const aux = design.items.find((item) => item.id === "aux");
  const bess = items.at(-1)!;
  if (aux) {
    const auxHeight = heightOf(bess);
    parts.push(`<rect x="${BOX.x + BOX.width + 30}" y="${y}" width="300" height="${auxHeight}" fill="#fff" stroke="${INK}" stroke-width="2"/>`);
    wrap(`(N) ${aux.title}`, 38).slice(0, 2).forEach((line, index) => parts.push(text(BOX.x + BOX.width + 42, y + 20 + index * 15, line, 11.5, "bold")));
    parts.push(text(BOX.x + BOX.width + 42, y + auxHeight - 10, aux.lines[0] ?? "", 11.5));
    parts.push(`<line x1="${BOX.x + BOX.width}" y1="${y + auxHeight / 2}" x2="${BOX.x + BOX.width + 30}" y2="${y + auxHeight / 2}" stroke="${INK}" stroke-width="2"/>`);
  }
  return parts.join("");
}

function schedule(design: ServiceDesign, x: number, y: number): { svg: string; height: number } {
  const columns = [{ label: "TAG", width: 50 }, { label: "FROM / TO", width: 150 }, { label: "CONDUCTORS", width: 370 }, { label: "GROUND", width: 200 }, { label: "CONDUIT", width: 220 }];
  const parts = [text(x, y, "CONDUCTOR SCHEDULE", 16, "bold")];
  let row = y + 14;
  let cx = x;
  parts.push(`<rect x="${x}" y="${row}" width="990" height="24" fill="#eee" stroke="${INK}" stroke-width="1"/>`);
  for (const column of columns) {
    parts.push(text(cx + 6, row + 17, column.label, 11.5, "bold"));
    cx += column.width;
  }
  row += 24;
  for (const entry of design.schedule) {
    const cells = [String(entry.tag), `${entry.from} → ${entry.to}`, entry.conductors, entry.ground, entry.conduit];
    const wrapped = cells.map((cell, index) => wrap(cell, Math.floor(columns[index]!.width / 7)));
    const height = Math.max(...wrapped.map((lines) => lines.length)) * 15 + 10;
    parts.push(`<rect x="${x}" y="${row}" width="990" height="${height}" fill="none" stroke="${INK}" stroke-width="1"/>`);
    cx = x;
    wrapped.forEach((lines, index) => {
      lines.forEach((line, lineIndex) => parts.push(text(cx + 6, row + 17 + lineIndex * 15, line, 11.5)));
      cx += columns[index]!.width;
    });
    row += height;
  }
  return { svg: parts.join(""), height: row - y };
}

const STATUS_WORDS = { passes: "PASSES (CONCEPT)", fails: "DOES NOT PASS", needs_input: "NEEDS INPUT", over_recommendation: "OVER 3% RECOMMENDATION" };
const STATUS_COLOR = { passes: "#1d6b2c", fails: UTILITY, needs_input: "#9a6700", over_recommendation: "#9a6700" };

function calculations(design: ServiceDesign, x: number, y: number, bottom: number): string {
  const parts = [text(x, y, "CONCEPT CALCULATIONS", 16, "bold")];
  let row = y + 24;
  for (const calc of design.calculations) {
    if (row > bottom - 40) break;
    parts.push(text(x, row, calc.title, 12.5, "bold"), text(x + 830, row, STATUS_WORDS[calc.status], 12, "bold", STATUS_COLOR[calc.status]));
    row += 15;
    for (const line of wrap(`${calc.result}. ${calc.citation}.${calc.note ? ` ${calc.note}` : ""}`, 120).slice(0, 2)) {
      parts.push(text(x + 12, row, line, 11, "normal", MUTED));
      row += 14;
    }
    row += 6;
  }
  return parts.join("");
}

// The single-line for one service voltage, drawn like the engineering sheets, with a title block.
export function singleLineSvg(design: ElectricalDesign, index = 0): string {
  const variant = design.designs[index]!;
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="#fff"/>`, `<rect x="20" y="20" width="${WIDTH - 40}" height="${HEIGHT - 40}" fill="none" stroke="${INK}" stroke-width="3"/>`);
  parts.push(text(70, 62, "SINGLE-LINE DIAGRAM (CONCEPT)", 22, "bold"));
  parts.push(text(70, 84, variant.serviceState === "missing" ? `SERVICE VOLTAGE NOT CONFIRMED: THIS SHEET ASSUMES ${variant.serviceLabel}` : `SERVICE ${variant.serviceLabel}`, 13, "bold", variant.serviceState === "missing" ? UTILITY : INK));
  parts.push(chain(variant, 110));

  const right = 660;
  const table = schedule(variant, right, 70);
  parts.push(table.svg);
  parts.push(calculations(variant, right, 70 + table.height + 40, 900));

  // Notes and the title block.
  const notes = [
    design.note,
    "(E) EXISTING, (N) NEW. DASHED: INFERRED OR UNKNOWN, NOT FIELD VERIFIED.",
    `CONFIGURATION: ${design.configuration.name.toUpperCase()}. ${design.configuration.provenance.toUpperCase()}`,
    `EQUIPMENT RATINGS ARE THE MANUFACTURERS' PUBLISHED VALUES. ${(design.jurisdiction.calculationNote ?? "NEC references are to the 2023 edition.").toUpperCase()}`,
    ...(design.jurisdiction.ahj ? [`AHJ: ${design.jurisdiction.ahj.toUpperCase()}. CODES: ${design.jurisdiction.codes.map((entry) => entry.short).join("; ").toUpperCase()}.`] : []),
  ];
  let y = 930;
  parts.push(`<line x1="20" y1="${y - 22}" x2="${WIDTH - 20}" y2="${y - 22}" stroke="${INK}" stroke-width="2"/>`, text(70, y, "NOTES", 13, "bold"));
  for (const note of notes) {
    for (const line of wrap(note, 120)) {
      y += 17;
      parts.push(text(70, y, line, 11.5));
    }
  }
  const blockX = WIDTH - 470;
  parts.push(`<rect x="${blockX}" y="${HEIGHT - 190}" width="450" height="170" fill="#fff" stroke="${INK}" stroke-width="2"/>`);
  wrap(design.site.address.toUpperCase(), 52).slice(0, 2).forEach((line, lineIndex) => parts.push(text(blockX + 14, HEIGHT - 164 + lineIndex * 18, line, 13, "bold")));
  parts.push(text(blockX + 14, HEIGHT - 122, `RECORD ${design.site.recordVersionId}, VERSION ${design.site.version}`, 11.5));
  parts.push(text(blockX + 14, HEIGHT - 102, CONCEPT_GRADE_NOTE.toUpperCase(), 11, "normal", MUTED));
  parts.push(text(blockX + 14, HEIGHT - 72, "SHEET E-002, SINGLE-LINE (CONCEPT)", 13, "bold"));
  parts.push(text(blockX + 14, HEIGHT - 40, "NOT FOR CONSTRUCTION", 16, "bold", UTILITY));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="${FONT}" role="img" aria-label="Single-line diagram, concept">${parts.join("")}</svg>`;
}
