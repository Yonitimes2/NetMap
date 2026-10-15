import type { ProductFull, ProductSummary } from "./types";

/**
 * Prices are the account holder's (the installer's) alone: the cost from a distributor's price
 * list, the maker's retail price on its site, and a price to offer the customer.
 */

/** Israeli VAT (since January 2025). Price lists are before VAT; retail prices on sites include it. */
export const VAT = 0.18;
/** markup on cost for a customer price when the maker's site has no retail price */
export const DEFAULT_MARKUP = 40;

export const nis = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;

/** "פיקוק אוקטובר" → "מחירון פיקוק אוקטובר"; a name that already says it stays as is */
export const priceListName = (source: string) => (source.startsWith("מחירון") ? source : `מחירון ${source}`);

/**
 * What to offer the customer, before VAT: the maker's retail price where it has one, else cost
 * plus the markup. A retail price below the cost (an old or sale price on the site) isn't used.
 */
export function customerPrice(p: { cost?: number; msrp?: number }, markupPct: number): { net: number; source: "site" | "markup"; siteBelowCost?: boolean } | null {
  const site = p.msrp ? p.msrp / (1 + VAT) : undefined;
  if (site && !(p.cost && site < p.cost)) return { net: site, source: "site" };
  if (p.cost) return { net: p.cost * (1 + markupPct / 100), source: "markup", siteBelowCost: site !== undefined };
  return null;
}

const PRICE_KEYS = ["cost", "costNote", "msrp", "costSource", "costAt", "markupPct"] as const;

/** Everyone but the account holder gets products without prices (the server removes them). */
export function withoutPrices<T extends ProductSummary | ProductFull>(p: T): T {
  const out = { ...p } as Record<string, unknown>;
  for (const k of PRICE_KEYS) delete out[k];
  return out as T;
}

// ---------- reading a price list ----------

/** One line of a price list: a model and its price, or a note instead ("שאל את סוכן המכירות"). */
export interface PriceRow {
  model: string;
  price?: number;
  note?: string;
  sheet?: string;
}

export interface PriceMatch {
  productId: string;
  model: string;
  price?: number;
  note?: string;
  /** the list's own name for it, when it differs */
  listModel: string;
}

const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();
/** a lens size after the model: "-2.8-12", " 7-22", "-4mm" */
const LENS = /^-?\d+(\.\d+)?(-\d+(\.\d+)?)?(MM)?$/;
/** a recorder sold with a disk: "-2T", "-4TB" */
const DISK = /-(\d+)TB?$/;

/**
 * Which catalog product each price-list line is. The list's names can carry a lens size or a
 * disk the catalog's don't ("I6-220LPRN-MVF1-2.8-12", "NVR5-4100XN(MM)-2T"); a plain line beats
 * one with a disk for the same product.
 */
export function matchPriceRows(products: { id: string; model: string }[], rows: PriceRow[]): { matches: PriceMatch[]; unmatched: string[] } {
  const exact = new Map<string, { id: string; model: string }>();
  for (const p of products) exact.set(norm(p.model), p);
  // "Z4-25IPEN-2" in the list is "Z4-25IPEN-2(IR)" on the site
  for (const p of products) {
    const k = norm(p.model).replace(/\((IR|LS)\)$/, "");
    if (!exact.has(k)) exact.set(k, p);
  }
  const find = (key: string) =>
    exact.get(key) ??
    products.find((p) => {
      const m = norm(p.model);
      return key.length > m.length && key.startsWith(m) && LENS.test(key.slice(m.length));
    });

  const best = new Map<string, PriceMatch & { disk: boolean }>();
  const unmatched: string[] = [];
  for (const r of rows) {
    const key = norm(r.model);
    if (!key) continue;
    let product = find(key);
    let disk: string | undefined;
    const d = key.match(DISK);
    if (!product && d) {
      product = find(key.replace(DISK, ""));
      disk = d[1];
    }
    if (!product) {
      if (r.price !== undefined) unmatched.push(r.model.trim());
      continue;
    }
    const note = r.price === undefined ? r.note : disk ? `כולל דיסק ${disk}TB` : undefined;
    const m = { productId: product.id, model: product.model, price: r.price, note, listModel: r.model.trim(), disk: !!disk };
    const prev = best.get(product.id);
    // a priced line beats a note, and the one without a disk beats one with
    const better = !prev || (prev.price === undefined && m.price !== undefined) || (prev.disk && !m.disk && m.price !== undefined);
    if (better) best.set(product.id, m);
  }
  return {
    matches: [...best.values()].map((m) => ({ productId: m.productId, model: m.model, price: m.price, note: m.note, listModel: m.listModel })),
    unmatched,
  };
}
