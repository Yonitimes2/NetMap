import { deviceTypeById, linkTypeById } from "./catalog";
import { linkLengthM } from "./graph";
import { DEFAULT_MARKUP, VAT, customerPrice, diskText, includedDisk } from "./products/pricing";
import { RACK_KINDS, rackItemDef } from "./rack-catalog";
import type { ProductSummary } from "./products/types";
import type { Device, Floor, Link } from "./types";

/**
 * A project's quote: its bill of quantities built from the map (the project's own equipment, its
 * cables, rack accessories and the work), priced from the account's catalog costs and defaults,
 * with the owner's changes on top. Shared by the browser (the owner's quote page) and the server
 * (the page the customer opens from a link). No Node imports here.
 */

export type QuoteSection = "equipment" | "cables" | "labor";

/** One project's quote settings, kept on the server apart from the map, for the account's owners only. */
export interface ProjectFinance {
  /** per line, by its key: what the owner changed from what the map and the catalog give */
  lines: Record<string, LineEdit>;
  /** lines added by hand */
  extras: ExtraLine[];
  /** spare cable on top of the measured length, in percent */
  cableWastePct?: number;
  discount?: { kind: "pct" | "amount"; value: number };
  /** shown to the customer under the quote: payment, warranty, what isn't included… */
  terms?: string;
  /** how many days the prices hold */
  validDays?: number;
  /** purchasing: what was bought for the project's lines (or taken from stock) */
  purchases?: Purchase[];
  /** the suppliers' receipts, each covering one or more purchases */
  receipts?: Receipt[];
}

/** Some of a quote line's quantity, bought from a supplier or taken from the account's stock. */
export interface Purchase {
  id: string;
  /** the quote line it's for (one that's gone from the quote still counts in the cost) */
  lineKey: string;
  /** what the line was called then, for when it's gone */
  name: string;
  qty: number;
  source: "bought" | "stock";
  supplier?: string;
  /** per unit, before VAT; stock may have none (cables and connectors already paid for) */
  unitCost?: number;
  /** YYYY-MM-DD (not the warranty's start: that's when it's installed) */
  date?: string;
  receiptId?: string;
}

/** A supplier's receipt or invoice: a picture or a PDF, kept privately for the account's owners. */
export interface Receipt {
  id: string;
  fileId: string;
  mime: string;
  supplier?: string;
  number?: string;
  date?: string;
  /** as printed on it, with VAT */
  totalWithVat?: number;
}

export interface LineEdit {
  qty?: number;
  cost?: number;
  price?: number;
  name?: string;
  /** left out of the quote (false: put back, for equipment that isn't usually sold) */
  hidden?: boolean;
  /** the customer sees its maker and model (otherwise only what it does) */
  showModel?: boolean;
}

export interface ExtraLine {
  id: string;
  section: "equipment" | "labor";
  /** a catalog product that isn't on the map (a disk, a spare, an accessory): its name, picture and price come from the catalog */
  productId?: string;
  name: string;
  qty: number;
  unit?: string;
  cost?: number;
  price?: number;
  /** the customer sees its maker and model */
  showModel?: boolean;
}

/** An account's starting points for new quotes. */
export interface QuoteDefaults {
  /** per line key: unit cost and price (labor, cable per meter, equipment the catalog has no cost for) */
  prices: Record<string, { cost?: number; price?: number }>;
  /** markup on cost for a customer price when nothing else gives one */
  markupPct?: number;
  cableWastePct?: number;
  terms?: string;
  validDays?: number;
  /** suppliers bought from before, to choose from */
  suppliers?: string[];
}

export const emptyFinance = (): ProjectFinance => ({ lines: {}, extras: [] });
export const emptyDefaults = (): QuoteDefaults => ({ prices: {} });

export const DEFAULT_WASTE = 10;
export const DEFAULT_VALID_DAYS = 30;

export type ProductPriceInfo = Pick<ProductSummary, "id" | "model" | "name" | "brandName" | "imageId" | "deviceType" | "cost" | "costNote" | "msrp" | "markupPct">;

export interface QuoteLine {
  key: string;
  section: QuoteSection;
  name: string;
  /** maker and model, or what the line is made of */
  detail?: string;
  /** the catalog's description of the product */
  description?: string;
  /** what it comes with that the customer should know (a recorder's disk) */
  included?: string;
  /** a description that names no product (a cabinet's size, "בארון התקשורת"): the customer always sees it */
  generic?: string;
  /** the catalog product it is */
  productId?: string;
  /** the customer sees its maker, model, picture and description */
  showModel?: boolean;
  imageId?: string;
  /** equipment type, for its icon */
  type?: string;
  unit: "יח׳" | "מ׳" | string;
  /** how many the map has (before the owner's change) */
  autoQty?: number;
  qty: number;
  cost?: number;
  costFrom?: "catalog" | "default" | "project";
  /** the price list's note: "שאל את סוכן המכירות", "כולל דיסק 2TB" */
  costNote?: string;
  /** unit price to the customer, before VAT */
  price?: number;
  priceFrom?: "site" | "markup" | "default" | "project";
  /** added by hand */
  extra?: boolean;
  hidden?: boolean;
  /** equipment that isn't usually sold (a network point, the customer's router): out of the quote unless put back */
  notSold?: boolean;
  /** cables drawn without a length */
  unmeasured?: number;
}

export interface QuoteTotals {
  equipmentCost: number;
  equipmentPrice: number;
  laborCost: number;
  laborPrice: number;
  subtotal: number;
  discount: number;
  /** before VAT */
  net: number;
  vat: number;
  total: number;
  cost: number;
  profit: number;
  /** profit out of the net price, in percent */
  marginPct: number;
  /** lines with no customer price / no cost yet (labor without a cost counts as no cost) */
  noPrice: number;
  noCost: number;
}

export interface Quote {
  lines: QuoteLine[];
  totals: QuoteTotals;
  wastePct: number;
  validDays: number;
  terms?: string;
}

const modelText = (d: Device) => [d.manufacturer, d.model].filter((x) => x?.trim()).join(" ").trim();

/** The quote line a piece of equipment on the map counts in. */
export function deviceLineKey(d: Device): string {
  if (d.product) return `p:${d.product.id}`;
  if (d.type === "rack" && d.rack) return `t:rack|${d.rack.spec.kind}|${d.rack.spec.units}|${d.rack.spec.depthMm}`;
  return `t:${d.type}|${modelText(d).toUpperCase()}`;
}

/** labor lines the map gives */
const LABOR = {
  cams: { name: "התקנת מצלמה", unit: "יח׳" },
  jacks: { name: "התקנת נקודת רשת", unit: "יח׳" },
  points: { name: "התקנה וחיבור של ציוד", unit: "יח׳" },
  rack: { name: "הקמת ארון תקשורת וסידור", unit: "יח׳" },
  cable: { name: "השחלה ופריסה של כבלים", unit: "מ׳" },
  setup: { name: "הגדרות, תכנות והדרכה", unit: "קומפלט" },
} as const;

/** The quote for one project. `products`: the catalog with the account's prices (for its owners). */
export function buildQuote(input: {
  siteId: string;
  devices: Device[];
  links: Link[];
  floors: Floor[];
  products: Map<string, ProductPriceInfo>;
  finance: ProjectFinance;
  defaults: QuoteDefaults;
}): Quote {
  const { siteId, products, finance, defaults } = input;
  const markup = defaults.markupPct ?? DEFAULT_MARKUP;
  const wastePct = finance.cableWastePct ?? defaults.cableWastePct ?? DEFAULT_WASTE;
  const devices = input.devices.filter((d) => d.siteId === siteId);
  const fresh = devices.filter((d) => !d.existing);
  const freshIds = new Set(fresh.map((d) => d.id));

  // ---- what the map holds, grouped into lines ----
  type Auto = Omit<QuoteLine, "qty" | "cost" | "price" | "costFrom" | "priceFrom" | "autoQty" | "unit"> & { n: number; unit?: string; product?: ProductPriceInfo };
  const auto = new Map<string, Auto>();
  const add = (key: string, make: () => Omit<Auto, "n">, n = 1) => {
    const cur = auto.get(key);
    if (cur) cur.n += n;
    else auto.set(key, { ...make(), n });
  };

  for (const d of fresh) {
    const def = deviceTypeById(d.type);
    const key = deviceLineKey(d);
    if (d.product) {
      const p = products.get(d.product.id);
      add(key, () => ({
        key,
        section: "equipment",
        name: def.label,
        detail: `${p?.brandName ?? d.product!.brand} ${p?.model ?? d.product!.model}`,
        description: p?.name ?? d.product!.name,
        // the disk: as the price list sells it, else as set on the device
        included: d.type === "nvr" ? diskText(includedDisk(p) ?? d.spec?.includedTb) : undefined,
        productId: d.product!.id,
        imageId: p?.imageId ?? d.product!.imageId,
        type: d.type,
        product: p,
      }));
    } else if (d.type === "rack" && d.rack) {
      const s = d.rack.spec;
      const kind = RACK_KINDS.find((k) => k.id === s.kind)?.label ?? "";
      add(key, () => ({
        key,
        section: "equipment",
        name: def.label,
        detail: `${kind} ${s.units}U · עומק ${s.depthMm / 10} ס״מ`,
        generic: `${kind} ${s.units}U · עומק ${s.depthMm / 10} ס״מ`,
        type: d.type,
      }));
    } else {
      const model = modelText(d);
      add(key, () => ({ key, section: "equipment", name: def.label, detail: model || undefined, type: d.type }));
    }
    // what's mounted in the cabinet without being equipment on the map: patch panels, shelves, PDUs…
    for (const it of d.rack?.items ?? []) {
      if (it.deviceId && devices.some((x) => x.id === it.deviceId)) continue;
      const def = rackItemDef(it.kind);
      const key = it.kind === "other" ? `r:other|${it.label.trim()}` : `r:${it.kind}`;
      add(key, () => ({ key, section: "equipment", name: it.kind === "other" ? it.label.trim() || def.label : def.label, detail: "בארון התקשורת", generic: "בארון התקשורת" }));
    }
  }

  // cables and trays, by type: measured meters (cables between two things the customer had stay out)
  const scale = new Map(input.floors.map((f) => [f.id, f.pxPerMeter]));
  const cableM = new Map<string, { m: number; unmeasured: number; kind: Link["kind"] }>();
  let laborMeters = 0;
  for (const l of input.links) {
    if (l.siteId !== siteId) continue;
    const ends = [l.a?.deviceId, l.b?.deviceId].filter(Boolean) as string[];
    if (ends.length && !ends.some((id) => freshIds.has(id)) && ends.every((id) => devices.some((d) => d.id === id))) continue;
    const len = linkLengthM(l, l.floorId ? scale.get(l.floorId) : undefined);
    const cur = cableM.get(l.cableType) ?? { m: 0, unmeasured: 0, kind: l.kind };
    if (len) cur.m += len;
    else cur.unmeasured++;
    cableM.set(l.cableType, cur);
    if (l.kind === "cable" && len) laborMeters += len;
  }
  for (const [type, v] of cableM) {
    const def = linkTypeById(type);
    const key = `${v.kind === "tray" ? "tr" : "c"}:${type}`;
    const n = Math.ceil(v.m * (1 + wastePct / 100));
    auto.set(key, {
      key,
      section: "cables",
      name: def.label,
      detail: v.kind === "tray" ? "תוואי / תעלה" : undefined,
      generic: v.kind === "tray" ? "תוואי / תעלה" : undefined,
      unit: "מ׳",
      n,
      unmeasured: v.unmeasured || undefined,
    });
  }

  // the work, from the same map
  const mounted = new Set(fresh.flatMap((d) => (d.rack?.items ?? []).map((it) => it.deviceId).filter(Boolean) as string[]));
  const cams = fresh.filter((d) => d.type.startsWith("cam-")).length;
  const racks = fresh.filter((d) => d.type === "rack").length;
  const jacks = fresh.filter((d) => d.type === "jack").length;
  // other equipment to install: not cameras, cabinets, what's mounted in them, or what isn't ours to install
  const points = fresh.filter((d) => !d.type.startsWith("cam-") && d.type !== "rack" && !mounted.has(d.id) && !deviceTypeById(d.type).notSold).length;
  const labor: [keyof typeof LABOR, number][] = [
    ["cams", cams],
    ["jacks", jacks],
    ["points", points],
    ["rack", racks],
    ["cable", Math.ceil(laborMeters)],
    ["setup", fresh.length ? 1 : 0],
  ];
  for (const [k, n] of labor) {
    if (!n) continue;
    auto.set(`l:${k}`, { key: `l:${k}`, section: "labor", name: LABOR[k].name, unit: LABOR[k].unit, n });
  }

  // ---- prices: the owner's change, then the catalog, then the account's defaults ----
  const lines: QuoteLine[] = [];
  for (const a of auto.values()) {
    const edit = finance.lines[a.key] ?? {};
    const def = defaults.prices[a.key] ?? {};
    const { product, n, unit, ...rest } = a;
    const notSold = !!a.type && !a.key.startsWith("p:") && !!deviceTypeById(a.type).notSold;
    const line: QuoteLine = { ...rest, unit: unit ?? "יח׳", autoQty: n, qty: edit.qty ?? n, name: edit.name || a.name, notSold, hidden: edit.hidden ?? notSold, showModel: edit.showModel };
    priceLine(line, edit, def, markup, product);
    lines.push(line);
  }
  for (const x of finance.extras) {
    const p = x.productId ? products.get(x.productId) : undefined;
    const line: QuoteLine = { key: `x:${x.id}`, section: x.section, name: x.name, unit: x.unit || "יח׳", qty: x.qty, extra: true, showModel: x.showModel };
    if (p) {
      // from the catalog, like the map's equipment: its name, picture and prices unless changed here
      Object.assign(line, {
        name: x.name || deviceTypeById(p.deviceType).label,
        detail: `${p.brandName} ${p.model}`,
        description: p.name,
        imageId: p.imageId,
        type: p.deviceType,
        included: p.deviceType === "nvr" ? diskText(includedDisk(p)) : undefined,
        productId: p.id,
      });
      priceLine(line, { cost: x.cost, price: x.price }, {}, markup, p);
    } else {
      if (x.cost !== undefined) Object.assign(line, { cost: x.cost, costFrom: "project" });
      if (x.price !== undefined) Object.assign(line, { price: x.price, priceFrom: "project" });
      else if (x.cost !== undefined && x.section === "equipment") Object.assign(line, { price: x.cost * (1 + markup / 100), priceFrom: "markup" });
    }
    lines.push(line);
  }
  const order: Record<QuoteSection, number> = { equipment: 0, cables: 1, labor: 2 };
  lines.sort((a, b) => order[a.section] - order[b.section] || Number(!!a.extra) - Number(!!b.extra) || (a.type ?? "~").localeCompare(b.type ?? "~"));

  return {
    lines,
    totals: totalsOf(lines, finance),
    wastePct,
    validDays: finance.validDays ?? defaults.validDays ?? DEFAULT_VALID_DAYS,
    terms: finance.terms ?? defaults.terms,
  };
}

function priceLine(line: QuoteLine, edit: LineEdit, def: { cost?: number; price?: number }, markup: number, product?: ProductPriceInfo) {
  if (edit.cost !== undefined) Object.assign(line, { cost: edit.cost, costFrom: "project" });
  else if (product?.cost !== undefined) Object.assign(line, { cost: product.cost, costFrom: "catalog" });
  else if (def.cost !== undefined) Object.assign(line, { cost: def.cost, costFrom: "default" });
  if (product?.costNote) line.costNote = product.costNote;

  if (edit.price !== undefined) return Object.assign(line, { price: edit.price, priceFrom: "project" });
  if (product) {
    // the maker's retail price, or the (possibly changed) cost plus the brand's markup
    const offer = customerPrice({ cost: line.cost, msrp: product.msrp }, product.markupPct ?? DEFAULT_MARKUP);
    if (offer) return Object.assign(line, { price: offer.net, priceFrom: offer.source === "site" ? "site" : "markup" });
  }
  if (def.price !== undefined) return Object.assign(line, { price: def.price, priceFrom: "default" });
  // equipment with a cost gets the markup; the work's price is never guessed from its cost
  if (line.cost !== undefined && line.section !== "labor") Object.assign(line, { price: line.cost * (1 + markup / 100), priceFrom: "markup" });
}

function totalsOf(lines: QuoteLine[], finance: ProjectFinance): QuoteTotals {
  const t = { equipmentCost: 0, equipmentPrice: 0, laborCost: 0, laborPrice: 0, noPrice: 0, noCost: 0 };
  for (const l of lines) {
    if (l.hidden || !l.qty) continue;
    const labor = l.section === "labor";
    if (l.price === undefined) t.noPrice++;
    else if (labor) t.laborPrice += l.price * l.qty;
    else t.equipmentPrice += l.price * l.qty;
    if (l.cost === undefined) {
      if (!labor) t.noCost++;
    } else if (labor) t.laborCost += l.cost * l.qty;
    else t.equipmentCost += l.cost * l.qty;
  }
  const subtotal = t.equipmentPrice + t.laborPrice;
  const d = finance.discount;
  const discount = !d || !(d.value > 0) ? 0 : d.kind === "pct" ? (subtotal * Math.min(d.value, 100)) / 100 : Math.min(d.value, subtotal);
  const net = subtotal - discount;
  const cost = t.equipmentCost + t.laborCost;
  const profit = net - cost;
  return { ...t, subtotal, discount, net, vat: net * VAT, total: net * (1 + VAT), cost, profit, marginPct: net ? (profit / net) * 100 : 0 };
}

export const SECTION_LABEL: Record<QuoteSection, string> = {
  equipment: "ציוד",
  cables: "כבלים ותשתית",
  labor: "עבודה",
};

/** A line's key without the owner's numbers: for defaults that carry to other projects (not catalog products, whose cost is the price list's). */
export const carriesDefault = (key: string) => !key.startsWith("p:") && !key.startsWith("x:");

// ---------- checking what the browser sends ----------

const num = (v: unknown, max = 10_000_000) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 100) / 100 : undefined);
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.slice(0, max) : undefined);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const KEY = /^[a-z]{1,2}:[^\n]{1,200}$/;

/** A project's quote settings as stored: unknown fields dropped, numbers and texts within bounds. */
export function cleanFinance(raw: unknown): ProjectFinance {
  const r = isObj(raw) ? raw : {};
  const lines: Record<string, LineEdit> = {};
  for (const [k, v] of Object.entries(isObj(r.lines) ? r.lines : {}).slice(0, 3000)) {
    if (!KEY.test(k) || !isObj(v)) continue;
    const e: LineEdit = {
      qty: num(v.qty, 1_000_000),
      cost: num(v.cost),
      price: num(v.price),
      name: text(v.name, 200),
      hidden: typeof v.hidden === "boolean" ? v.hidden : undefined,
      showModel: v.showModel === true || undefined,
    };
    const kept = Object.fromEntries(Object.entries(e).filter(([, x]) => x !== undefined)) as LineEdit;
    if (Object.keys(kept).length) lines[k] = kept;
  }
  const extras: ExtraLine[] = [];
  for (const x of Array.isArray(r.extras) ? r.extras.slice(0, 500) : []) {
    if (!isObj(x) || typeof x.id !== "string" || !/^[A-Za-z0-9_-]{4,40}$/.test(x.id)) continue;
    extras.push({
      id: x.id,
      section: x.section === "labor" ? "labor" : "equipment",
      productId: typeof x.productId === "string" && /^[A-Za-z0-9_-]{16}$/.test(x.productId) ? x.productId : undefined,
      name: text(x.name, 200) ?? "",
      qty: num(x.qty, 1_000_000) ?? 1,
      unit: text(x.unit, 20),
      cost: num(x.cost),
      price: num(x.price),
      showModel: x.showModel === true || undefined,
    });
  }
  const d = isObj(r.discount) ? r.discount : null;
  const discount = d && num(d.value) ? { kind: d.kind === "amount" ? ("amount" as const) : ("pct" as const), value: num(d.value)! } : undefined;
  const id = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{4,40}$/.test(v);
  const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const purchases: Purchase[] = [];
  for (const x of Array.isArray(r.purchases) ? r.purchases.slice(0, 2000) : []) {
    if (!isObj(x) || !id(x.id) || typeof x.lineKey !== "string" || !KEY.test(x.lineKey)) continue;
    purchases.push({
      id: x.id as string,
      lineKey: x.lineKey,
      name: text(x.name, 200) ?? "",
      qty: num(x.qty, 1_000_000) ?? 1,
      source: x.source === "stock" ? "stock" : "bought",
      supplier: text(x.supplier, 120),
      unitCost: num(x.unitCost),
      date: day(x.date),
      receiptId: id(x.receiptId) ? (x.receiptId as string) : undefined,
    });
  }
  const receipts: Receipt[] = [];
  for (const x of Array.isArray(r.receipts) ? r.receipts.slice(0, 500) : []) {
    if (!isObj(x) || !id(x.id) || typeof x.fileId !== "string" || !/^[A-Za-z0-9_-]{24}$/.test(x.fileId)) continue;
    receipts.push({
      id: x.id as string,
      fileId: x.fileId,
      mime: typeof x.mime === "string" && /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(x.mime) ? x.mime : "image/jpeg",
      supplier: text(x.supplier, 120),
      number: text(x.number, 60),
      date: day(x.date),
      totalWithVat: num(x.totalWithVat),
    });
  }
  return {
    lines,
    extras,
    cableWastePct: num(r.cableWastePct, 200),
    discount,
    terms: text(r.terms, 4000),
    validDays: num(r.validDays, 365),
    purchases,
    receipts,
  };
}

export function cleanDefaults(raw: unknown): QuoteDefaults {
  const r = isObj(raw) ? raw : {};
  const prices: QuoteDefaults["prices"] = {};
  for (const [k, v] of Object.entries(isObj(r.prices) ? r.prices : {}).slice(0, 3000)) {
    if (!KEY.test(k) || !carriesDefault(k) || !isObj(v)) continue;
    const cost = num(v.cost);
    const price = num(v.price);
    if (cost !== undefined || price !== undefined) prices[k] = { ...(cost !== undefined && { cost }), ...(price !== undefined && { price }) };
  }
  return {
    prices,
    markupPct: num(r.markupPct, 1000),
    cableWastePct: num(r.cableWastePct, 200),
    terms: text(r.terms, 4000),
    validDays: num(r.validDays, 365),
    suppliers: Array.isArray(r.suppliers) ? [...new Set(r.suppliers.map((x) => text(x, 120)).filter((x): x is string => !!x))].slice(0, 100) : undefined,
  };
}
