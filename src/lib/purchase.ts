import { VAT } from "./products/pricing";
import type { ProjectFinance, Purchase, Quote, QuoteLine, Receipt } from "./quote";

/**
 * Purchasing for a project: for each line of its quote (the equipment and the cables), how much was
 * bought or taken from stock, at what cost; whether everything is in hand before going on site; and
 * the profit with the real costs where they're known (the quote's estimate for the rest).
 * Shared by the browser and the server (no Node imports here).
 */

export type LineState = "todo" | "partial" | "done";

export interface PurchaseLine {
  line: QuoteLine;
  purchases: Purchase[];
  /** how much is covered, bought or from stock */
  covered: number;
  /** what the covered part actually cost, before VAT (stock without a cost counts as nothing) */
  actual: number;
  /** what the rest is expected to cost, by the quote */
  remaining: number;
  state: LineState;
}

export interface PurchaseSummary {
  lines: PurchaseLine[];
  /** bought for lines that are no longer in the quote (their cost still counts) */
  orphans: Purchase[];
  done: number;
  total: number;
  /** everything the quote needs is in hand */
  ready: boolean;
  /** before VAT */
  actualCost: number;
  remainingCost: number;
  laborCost: number;
  /** what the project costs: actual where bought, estimated for the rest, plus the work */
  cost: number;
  /** the quote's price to the customer, before VAT */
  net: number;
  profit: number;
  marginPct: number;
  /** the quote's estimate, to compare */
  quotedCost: number;
  quotedProfit: number;
}

/** Lines that need buying: the equipment and the cables in the quote. The work isn't bought. */
export const toBuy = (quote: Quote) => quote.lines.filter((l) => !l.hidden && l.qty > 0 && l.section !== "labor");

const costOf = (p: Purchase) => p.qty * (p.unitCost ?? 0);

export function purchaseSummary(quote: Quote, finance: ProjectFinance): PurchaseSummary {
  const all = finance.purchases ?? [];
  const lines: PurchaseLine[] = toBuy(quote).map((line) => {
    const purchases = all.filter((p) => p.lineKey === line.key);
    const covered = purchases.reduce((s, p) => s + p.qty, 0);
    const actual = purchases.reduce((s, p) => s + costOf(p), 0);
    const left = Math.max(0, line.qty - covered);
    return {
      line,
      purchases,
      covered,
      actual,
      remaining: left * (line.cost ?? 0),
      state: covered >= line.qty ? "done" : covered > 0 ? "partial" : "todo",
    };
  });
  const keys = new Set(lines.map((l) => l.line.key));
  const orphans = all.filter((p) => !keys.has(p.lineKey));
  const actualCost = lines.reduce((s, l) => s + l.actual, 0) + orphans.reduce((s, p) => s + costOf(p), 0);
  const remainingCost = lines.reduce((s, l) => s + l.remaining, 0);
  const t = quote.totals;
  const cost = actualCost + remainingCost + t.laborCost;
  const profit = t.net - cost;
  const done = lines.filter((l) => l.state === "done").length;
  return {
    lines,
    orphans,
    done,
    total: lines.length,
    ready: lines.length > 0 && done === lines.length,
    actualCost,
    remainingCost,
    laborCost: t.laborCost,
    cost,
    net: t.net,
    profit,
    marginPct: t.net ? (profit / t.net) * 100 : 0,
    quotedCost: t.cost,
    quotedProfit: t.profit,
  };
}

/** A receipt against what it's linked to: the purchases on it, their sum with VAT, and whether that matches its total. */
export function receiptCheck(r: Receipt, finance: ProjectFinance) {
  const on = (finance.purchases ?? []).filter((p) => p.receiptId === r.id);
  const sum = on.reduce((s, p) => s + costOf(p), 0) * (1 + VAT);
  // a shekel either way is rounding on the receipt
  const matches = r.totalWithVat === undefined || !on.length ? undefined : Math.abs(sum - r.totalWithVat) <= 1;
  return { purchases: on, sumWithVat: sum, matches };
}

/** Suppliers to offer: this project's first, then the account's. */
export function supplierOptions(finance: ProjectFinance, known: string[] = []) {
  const here = (finance.purchases ?? []).map((p) => p.supplier).filter((s): s is string => !!s);
  return [...new Set([...here.reverse(), ...known])];
}
