import { countView, customerDoc, getFinance, getQuoteDefaults, openLink, orgName } from "./db/projects";
import { listProducts } from "./products/store";
import { buildQuote, deviceLineKey, type ProductPriceInfo, type QuoteSection } from "./quote";
import { CAMERA_CATEGORIES, FORM_LABEL, type ProductSummary } from "./products/types";
import { WALL_TYPES, DEFAULT_PPM } from "./space-catalog";
import type { CameraView, Point } from "./types";

/**
 * What the customer's page shows, read on the server from the link: the project's plan with the
 * planned equipment, the equipment list, and (when the link says so) the prices. Only what's listed
 * here leaves the server: no passwords, network details, serial numbers, costs or margins — and no
 * product's maker, model, picture or description unless the owner chose to show that line's model.
 */
export interface PublicQuote {
  linkId: string;
  orgName: string;
  customer: string;
  project: { name: string; address?: string };
  /** when the link was made: the quote's date */
  date: number;
  /** the quote's version and when it was last changed */
  rev: number;
  updatedAt?: number;
  showPrices: boolean;
  /** equipment and cables, line by line */
  lines: PublicLine[];
  /** the work: one list with how much of each, for one price */
  labor: { items: { name: string; amount?: string }[]; price?: number };
  totals: {
    equipment: number;
    labor: number;
    /** before the discount */
    subtotal: number;
    discount: number;
    /** the discount as the owner set it, when in percent */
    discountPct?: number;
    net: number;
    vat: number;
    total: number;
  } | null;
  validDays: number;
  terms?: string;
  floors: PublicFloor[];
}

export interface PublicLine {
  /** the number on the plan */
  n?: number;
  key: string;
  section: QuoteSection;
  name: string;
  /** what it does (megapixels, range, analytics…), never which product it is */
  features: string[];
  /** maker and model, picture and description: only when the owner chose to show them */
  model?: { detail?: string; description?: string; imageId?: string };
  /** a recorder's disk */
  included?: string;
  type?: string;
  unit: string;
  qty: number;
  price?: number;
}

/** What a product does, in words that name no product: the customer's list shows these instead of a model. */
function features(p: ProductSummary | undefined): string[] {
  if (!p) return [];
  const s = p.params;
  const out: string[] = [];
  if (CAMERA_CATEGORIES.includes(p.category)) {
    if (s.mp) out.push(`${s.mp} מגה־פיקסל`);
    const range = s.irM ?? s.dori?.detect;
    if (range) out.push(`טווח ראייה עד ${range} מ׳`);
    out.push(...(s.analytics ?? []));
  } else if (p.category === "nvr") {
    if (s.channels) out.push(`${s.channels} ערוצים`);
    if (s.maxRecordMp) out.push(`הקלטה עד ${s.maxRecordMp} מגה־פיקסל`);
  } else if (p.category === "switch") {
    const ports = (s.ports ?? 0) + (s.uplinks ?? 0);
    if (ports) out.push(`${ports} פורטים`);
    if (s.poePorts) out.push(`${s.poePorts} פורטי PoE`);
  } else if (p.category === "speaker") {
    if (s.watts) out.push(`${s.watts}W`);
  }
  return out;
}

/** A camera's kind, from its model's shape: "מצלמת טורט" rather than the map's "מצלמת כיפה". */
function cameraName(p: ProductSummary | undefined, fallback: string) {
  const form = p && CAMERA_CATEGORIES.includes(p.category) ? p.params.formFactor : undefined;
  if (!form || form === "other" || form === "box") return fallback;
  return form === "ptz" ? "מצלמת PTZ" : form === "fisheye" ? "מצלמת עין דג (360°)" : `מצלמת ${FORM_LABEL[form]}`;
}

export interface PublicFloor {
  id: string;
  name: string;
  /** drawing size in map pixels */
  W: number;
  H: number;
  ppm: number;
  plan?: { url: string };
  walls: { a: Point; b: Point; color: string; width: number }[];
  areas: { points: Point[]; color: string; name: string }[];
  cables: { points: Point[]; color: string }[];
  devices: { x: number; y: number; type: string; n?: number; camera?: CameraView }[];
}

export async function loadPublicQuote(token: string): Promise<PublicQuote | null> {
  const link = await openLink(token);
  if (!link) return null;
  const c = await customerDoc(link.accountId);
  const doc = c?.doc;
  const site = doc?.sites.find((s) => s.id === link.siteId);
  if (!c || !doc || !site) return null;

  const devices = doc.devices.filter((d) => d.siteId === site.id);
  const links = doc.links.filter((l) => l.siteId === site.id);
  const floors = doc.floors.filter((f) => f.siteId === site.id).sort((a, b) => a.order - b.order);
  const [{ finance, rev, updatedAt }, defaults, catalog] = await Promise.all([getFinance(site.id), getQuoteDefaults(c.orgId), listProducts({ includeInactive: true }, c.orgId)]);
  const products = new Map<string, ProductPriceInfo>(catalog.map((p) => [p.id, p]));
  const full = new Map(catalog.map((p) => [p.id, p]));
  const quote = buildQuote({ siteId: site.id, devices, links, floors, products, finance, defaults });

  // equipment lines get numbers, which the plan shows on each piece of equipment
  const lines: PublicLine[] = [];
  const number = new Map<string, number>();
  const labor: PublicQuote["labor"]["items"] = [];
  for (const l of quote.lines) {
    if (l.hidden || !l.qty) continue;
    if (l.section === "labor") {
      // how much work it is, so the price makes sense (not for a single job done as a whole)
      labor.push({ name: l.name, amount: l.unit === "קומפלט" ? undefined : `${l.qty.toLocaleString("he-IL")} ${l.unit}` });
      continue;
    }
    const n = l.section === "equipment" && !l.extra ? number.size + 1 : undefined;
    if (n) number.set(l.key, n);
    const p = l.productId ? full.get(l.productId) : undefined;
    // a line named by hand keeps its name; else a camera is called by its kind
    const named = l.extra ? !!finance.extras.find((x) => `x:${x.id}` === l.key)?.name : !!finance.lines[l.key]?.name;
    lines.push({
      n,
      key: l.key,
      section: l.section,
      name: named ? l.name : cameraName(p, l.name),
      features: [...(l.generic ? [l.generic] : []), ...features(p)],
      model: l.showModel ? { detail: l.detail, description: l.description, imageId: l.imageId } : undefined,
      included: l.included,
      type: l.type,
      unit: l.unit,
      qty: l.qty,
      price: link.showPrices ? l.price : undefined,
    });
  }
  const t = quote.totals;
  const discountPct = finance.discount?.kind === "pct" && t.discount > 0 ? finance.discount.value : undefined;

  const wallStyle = new Map(WALL_TYPES.map((w) => [w.id, w]));
  const mounted = new Set(devices.flatMap((d) => (d.rack?.items ?? []).map((it) => it.deviceId).filter(Boolean) as string[]));
  const publicFloors: PublicFloor[] = [];
  for (const f of floors) {
    const ppm = f.pxPerMeter ?? DEFAULT_PPM;
    // what's mounted in a cabinet is shown by the cabinet (it's in the list)
    const mine = devices.filter((d) => d.floorId === f.id && !d.existing && !mounted.has(d.id));
    const walls = doc.walls.filter((w) => w.floorId === f.id);
    const areas = doc.areas.filter((a) => a.floorId === f.id);
    if (!mine.length && !f.plan && !walls.length) continue;
    const plan = f.plan && planUrl(token, f.plan.src);
    // the drawing: the plan's size, or what's drawn on the floor (plus a margin)
    let W = f.plan?.width ?? 0;
    let H = f.plan?.height ?? 0;
    if (!plan) {
      const pts = [...walls.flatMap((w) => [w.a, w.b]), ...areas.flatMap((a) => a.points), ...mine];
      W = Math.max(12 * ppm, ...pts.map((p) => p.x + 2 * ppm));
      H = Math.max(8 * ppm, ...pts.map((p) => p.y + 2 * ppm));
    }
    publicFloors.push({
      id: f.id,
      name: f.name,
      W,
      H,
      ppm,
      plan: plan ? { url: plan } : undefined,
      walls: walls.map((w) => {
        const st = wallStyle.get(w.type);
        return { a: w.a, b: w.b, color: st?.color ?? "#334155", width: (((w.thicknessCm ?? st?.thickness ?? 15) / 100) * ppm) | 0 || 4 };
      }),
      areas: areas.map((a) => ({ points: a.points, color: a.color, name: a.name })),
      cables: links.filter((l) => l.floorId === f.id && l.kind === "cable" && l.points.length > 1).map((l) => ({ points: l.points, color: l.color || "#94a3b8" })),
      devices: mine.map((d) => ({ x: d.x, y: d.y, type: d.type, n: number.get(deviceLineKey(d)), camera: d.camera })),
    });
  }

  await countView(link.id);
  return {
    linkId: link.id,
    orgName: await orgName(c.orgId),
    customer: doc.account.name,
    project: { name: site.name, address: site.address },
    date: link.createdAt,
    rev,
    updatedAt,
    showPrices: link.showPrices,
    lines,
    labor: { items: labor, price: link.showPrices && t.laborPrice > 0 ? t.laborPrice : undefined },
    totals: link.showPrices
      ? { equipment: t.equipmentPrice, labor: t.laborPrice, subtotal: t.subtotal, discount: t.discount, discountPct, net: t.net, vat: t.vat, total: t.total }
      : null,
    validDays: quote.validDays,
    terms: quote.terms,
    floors: publicFloors,
  };
}

/** A plan image the customer's browser can load through the link (images only in this browser aren't on the server yet). */
function planUrl(token: string, src: string): string | undefined {
  if (src.startsWith("file:")) return `/api/q/${token}/file/${src.slice(5)}`;
  if (src.startsWith("data:image/") || src.startsWith("https://")) return src;
  return undefined;
}
