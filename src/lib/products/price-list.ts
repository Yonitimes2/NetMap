"use client";

import type { PriceRow } from "./pricing";

/**
 * Reads a distributor's price list (Excel, .xls or .xlsx) in the browser: every sheet with a
 * "דגם" column and a price column ("מחיר…") in its first rows. A line with words instead of a
 * price ("שאל את סוכן המכירות") keeps them as a note. SheetJS is loaded only for this.
 */
export async function readPriceList(file: File): Promise<PriceRow[]> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const rows: PriceRow[] = [];
  for (const sheet of book.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheet], { header: 1, raw: true, defval: "" });
    let modelCol = -1;
    let priceCol = -1;
    let start = -1;
    for (let r = 0; r < Math.min(grid.length, 15); r++) {
      const cells = grid[r].map((v) => String(v ?? "").trim());
      const m = cells.indexOf("דגם");
      const p = cells.findIndex((v) => v.startsWith("מחיר"));
      if (m >= 0 && p >= 0) {
        [modelCol, priceCol, start] = [m, p, r + 1];
        break;
      }
    }
    if (start < 0) continue;
    for (const line of grid.slice(start)) {
      const model = String(line[modelCol] ?? "").trim();
      if (!model) continue;
      const v = line[priceCol];
      const price = typeof v === "number" ? v : Number(String(v ?? "").replace(/[₪,\s]/g, "")) || undefined;
      const note = price === undefined && typeof v === "string" && v.trim() ? v.trim() : undefined;
      rows.push({ model, price, note, sheet });
    }
  }
  return rows;
}
