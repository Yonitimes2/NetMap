import { countView, customerDoc, getFinance, getQuoteDefaults, openLink, orgName } from "./db/projects";
import { listProducts } from "./products/store";
import { buildQuote, deviceLineKey, type ProductPriceInfo, type QuoteSection } from "./quote";
import { CAMERA_CATEGORIES, FORM_LABEL, type ProductSummary } from "./products/types";
import { publicFloor, type PublicFloor } from "./public-plan";

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

  const mounted = new Set(devices.flatMap((d) => (d.rack?.items ?? []).map((it) => it.deviceId).filter(Boolean) as string[]));
  const publicFloors: PublicFloor[] = [];
  for (const f of floors) {
    // the work: what the quote sells (numbered as in its list) and the network points to install. Not what's
    // mounted in a cabinet (the cabinet stands for it), nor the customer's own (their router, computers, screens)
    const mine = devices.filter((d) => d.floorId === f.id && !d.existing && !mounted.has(d.id) && (number.has(deviceLineKey(d)) || d.type === "jack"));
    const walls = doc.walls.filter((w) => w.floorId === f.id);
    const plan = f.plan && planUrl(token, f.plan.src);
    // a floor with nothing planned on it says nothing to the customer
    if (!mine.length) continue;
    publicFloors.push(
      publicFloor({
        floor: f,
        planUrl: plan,
        devices: mine.map((d) => ({ ...d, n: number.get(deviceLineKey(d)) })),
        walls,
        openings: doc.openings.filter((o) => o.floorId === f.id),
        obstacles: doc.obstacles.filter((o) => o.floorId === f.id),
        areas: doc.areas.filter((a) => a.floorId === f.id),
        links: links.filter((l) => l.floorId === f.id),
      }),
    );
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
