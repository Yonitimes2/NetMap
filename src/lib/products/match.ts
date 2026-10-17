import { DEFAULT_PPM } from "../space-catalog";
import type { Area, Device, Floor, Link } from "../types";
import { brandKey, systemBrand } from "./client";
import { DEFAULT_MARKUP, customerPrice, includedDisk } from "./pricing";
import { evaluateCamera, fmtM, placeFacts, type CameraNeeds, type Night, type Purpose, type Suggestion } from "./suggest";
import { CAMERA_CATEGORIES, type ProductSummary } from "./types";

/**
 * Choosing a model for equipment already on the map, from what the map knows about it: cameras by
 * where they are and what they're aimed at, a recorder by the site's cameras, a switch by what's
 * connected to it. Each match comes with its reasons, the way the camera suggestions do.
 */

export type MatchKind = "camera" | "nvr" | "switch";

export const matchKindOf = (type?: string): MatchKind | null =>
  type?.startsWith("cam-") ? "camera" : type === "nvr" ? "nvr" : type === "switch" ? "switch" : null;

export interface MatchContext {
  /** every piece of equipment at the site (the customer's own too) */
  siteDevices: Device[];
  links: Link[];
  areas: Area[];
  floors: Floor[];
}

export interface Match {
  p: ProductSummary;
  /** good: does it all; ok: with notes; weak: misses something that matters */
  level: "good" | "ok" | "weak";
  pros: string[];
  notes: string[];
  misses: string[];
  /** cameras: the angle each one's cone gets with this model */
  fovs?: Record<string, number>;
  /** cameras: how many of them it does well, and the hardest one's name (the reasons are about it) */
  fit?: number;
  hardest?: string;
}

export interface MatchResult {
  /** what the map says, in short */
  facts: string[];
  list: Match[];
}

const priceOf = (p: ProductSummary) => customerPrice(p, p.markupPct ?? DEFAULT_MARKUP)?.net ?? p.cost;
const byPrice = (a: ProductSummary, b: ProductSummary) => {
  const pa = priceOf(a);
  const pb = priceOf(b);
  if (pa === undefined || pb === undefined) return Number(pa === undefined) - Number(pb === undefined);
  return pa - pb;
};
const levelOf = (misses: string[], notes: string[]): Match["level"] => (misses.length ? "weak" : notes.length ? "ok" : "good");
/** those that do the job first; a few close ones when fewer than three do */
const pick = (all: Match[]) => {
  const fit = all.filter((m) => m.level !== "weak");
  return fit.length >= 3 ? fit.slice(0, 5) : [...fit, ...all.filter((m) => m.level === "weak").slice(0, 3 - fit.length)];
};
const ppmOf = (floors: Floor[], floorId: string) => {
  const f = floors.find((x) => x.id === floorId);
  return f?.pxPerMeter ?? (f?.plan ? 40 : DEFAULT_PPM);
};
const sameBrand = (p: ProductSummary, brand: { key: string; name: string } | null, pros: string[], notes: string[], what: string) => {
  if (!brand) return;
  if (brandKey(p.brandName) === brand.key) pros.push(`${p.brandName}, כמו ${what}`);
  else notes.push(`לא תואם למערך הקיים (${what} של ${brand.name})`);
};

// ---------------------------------------------------------------- cameras

/** What one camera on the map has to do: its cone (distance and width), its room, and the answers. */
export function cameraNeeds(d: Device, ctx: MatchContext, purpose: Purpose, night: Night): CameraNeeds {
  const cam = d.camera ?? { dir: 0, fov: 90, range: 10 };
  const f = placeFacts(d, ctx.areas, ppmOf(ctx.floors, d.floorId));
  return {
    distanceM: cam.range,
    angleDeg: cam.fov,
    purpose,
    night,
    outdoor: !!f.outdoor,
    wet: f.wet,
    vandal: f.vandal,
    backlight: f.backlight,
    noPower: f.noPower,
    ceiling: f.ceiling,
    brand: systemBrand(ctx.siteDevices) ?? undefined,
  };
}

/** A model of another shape than the camera placed on the map (a bullet for a dome, a fixed one for a PTZ). */
function shapeNote(type: string, p: ProductSummary): string | undefined {
  const form = p.params.formFactor;
  const ptz = p.category === "ptz" || form === "ptz";
  if (type === "cam-ptz") return ptz ? undefined : "מצלמה קבועה, ובמפה סומנה PTZ";
  if (ptz) return undefined; // a PTZ already comes last as a fallback
  if (type === "cam-dome" && form === "bullet") return "מצלמת צינור, ובמפה סומנה מצלמת כיפה";
  if (type === "cam-bullet" && (form === "dome" || form === "turret")) return "מצלמת כיפה, ובמפה סומנה מצלמת צינור";
}

/** One model for all the line's cameras: judged by the camera it suits least. */
export function matchCameras(products: ProductSummary[], cams: Device[], ctx: MatchContext, purpose: Purpose, night: Night): MatchResult {
  const needs = cams.map((d) => ({ d, n: cameraNeeds(d, ctx, purpose, night) }));
  const all: (Match & { tier: number; rank: number })[] = [];
  for (const p of products) {
    if (!CAMERA_CATEGORIES.includes(p.category) || p.status === "discontinued") continue;
    if (p.category === "solar" && !needs.some((x) => x.n.noPower)) continue;
    const evals: { d: Device; e: Suggestion }[] = [];
    for (const { d, n } of needs) {
      const e = evaluateCamera(p, n);
      if (!e) break;
      const other = shapeNote(d.type, p);
      if (other) {
        e.notes = [...e.notes, other];
        e.tier += 10;
        if (e.level === "good") e.level = "ok";
      }
      evals.push({ d, e });
    }
    if (evals.length < needs.length || !evals.length) continue;
    const worst = evals.reduce((a, b) => (b.e.tier > a.e.tier ? b : a));
    const levels = evals.map((x) => x.e.level);
    all.push({
      p,
      level: levels.includes("weak") ? "weak" : levels.includes("ok") ? "ok" : "good",
      pros: worst.e.pros,
      notes: worst.e.notes,
      misses: worst.e.misses,
      fovs: Object.fromEntries(evals.map((x) => [x.d.id, x.e.fov])),
      fit: levels.filter((l) => l !== "weak").length,
      hardest: cams.length > 1 ? worst.d.label : undefined,
      tier: worst.e.tier,
      rank: evals.reduce((s, x) => s + x.e.rank, 0),
    });
  }
  // equally good: the one that suits more of them, then the cheaper (by the account's prices), then the simpler
  all.sort((a, b) => a.tier - b.tier || (b.fit ?? 0) - (a.fit ?? 0) || byPrice(a.p, b.p) || a.rank - b.rank);

  const facts: string[] = [`${cams.length === 1 ? "מצלמה אחת" : `${cams.length} מצלמות`}`];
  const far = Math.max(...needs.map((x) => x.n.distanceM));
  const wide = Math.max(...needs.map((x) => x.n.angleDeg));
  facts.push(`עד ${fmtM(far)} מ׳`, `זווית עד ${Math.round(wide)}°`);
  const count = (f: (n: CameraNeeds) => boolean, label: string) => {
    const k = needs.filter((x) => f(x.n)).length;
    if (k) facts.push(cams.length === 1 ? label : `${label}: ${k}`);
  };
  count((n) => n.outdoor, "בחוץ");
  count((n) => n.wet, "גשם / לחות");
  count((n) => n.backlight, "אור נגדי");
  count((n) => n.vandal, "חשוף לוונדליזם");
  count((n) => n.noPower, "בלי חשמל");
  const brand = needs[0]?.n.brand;
  if (brand) facts.push(`המותג באתר: ${brand.name}`);
  return { facts, list: pick(all) };
}

/** Each camera its own best model (the site's cameras often stand in very different spots), ranked as above. */
export function bestPerCamera(products: ProductSummary[], cams: Device[], ctx: MatchContext, purpose: Purpose, night: Night) {
  return cams.map((d) => {
    const m = matchCameras(products, [d], ctx, purpose, night).list[0];
    return { d, m: m && m.level !== "weak" ? m : undefined, fov: m?.fovs?.[d.id] };
  });
}

// ---------------------------------------------------------------- recorder

const isCamera = (d: Device) => d.type.startsWith("cam-");
/** megapixels of a camera on the map: its model's, or the resolution typed in */
const cameraMp = (d: Device) => d.spec?.mp ?? (Number(d.extra?.resolution?.match(/(\d+)\s*MP/i)?.[1]) || undefined);

export function matchNvr(products: ProductSummary[], nvrs: Device[], ctx: MatchContext): MatchResult {
  const cams = ctx.siteDevices.filter(isCamera);
  const mps = cams.map(cameraMp).filter((x): x is number => !!x);
  const maxMp = mps.length ? Math.max(...mps) : undefined;
  const camIds = new Set(cams.map((d) => d.id));
  // cameras cabled straight to a recorder take its PoE ports
  const direct = Math.max(
    0,
    ...nvrs.map(
      (n) => ctx.links.filter((l) => l.kind === "cable" && ((l.a?.deviceId === n.id && camIds.has(l.b?.deviceId ?? "")) || (l.b?.deviceId === n.id && camIds.has(l.a?.deviceId ?? "")))).length,
    ),
  );
  const brand = systemBrand(ctx.siteDevices);
  const all: (Match & { tier: number; ch: number })[] = [];
  for (const p of products) {
    if (p.category !== "nvr" || p.status === "discontinued") continue;
    const s = p.params;
    const ch = s.channels;
    if (!ch) continue;
    const pros: string[] = [];
    const notes: string[] = [];
    const misses: string[] = [];
    if (ch >= cams.length) pros.push(`${ch} ערוצים ל-${cams.length} מצלמות (${ch > cams.length ? `${ch - cams.length} פנויים להרחבה` : "בלי ערוצים פנויים להרחבה"})`);
    else misses.push(`${ch} ערוצים בלבד: יש ${cams.length} מצלמות`);
    if (maxMp && s.maxRecordMp) {
      if (s.maxRecordMp >= maxMp) pros.push(`מקליט עד ${s.maxRecordMp}MP (המצלמות עד ${maxMp}MP)`);
      else misses.push(`מקליט עד ${s.maxRecordMp}MP: יש מצלמות של ${maxMp}MP`);
    }
    if (direct) {
      if ((s.poePorts ?? 0) >= direct) pros.push(`${s.poePorts} פורטי PoE ל-${direct} המצלמות שמחוברות אליו`);
      else if (s.poePorts) notes.push(`רק ${s.poePorts} פורטי PoE: ${direct} מצלמות מחוברות אליו ישירות`);
      else notes.push(`בלי PoE: ${direct} המצלמות שמחוברות אליו יצטרכו סוויץ' PoE`);
    }
    // what it comes with, and what it takes
    const disk = includedDisk(p);
    const room = s.hddBays ? `${s.hddBays === 1 ? "מקום לדיסק אחד" : `${s.hddBays} מקומות לדיסקים`}${s.maxHddTb ? ` עד ${s.maxHddTb}TB` : ""}` : "";
    if (disk) pros.push(`כולל דיסק ${disk}TB${room ? ` · ${room}` : ""}`);
    else if (disk === 0) notes.push(`בלי דיסק: צריך להוסיף דיסק להצעה${room ? ` (${room})` : ""}`);
    else if (room) pros.push(room);
    sameBrand(p, brand, pros, notes, "המצלמות באתר");
    all.push({ p, level: levelOf(misses, notes), pros, notes, misses, tier: misses.length * 100 + notes.length * 10, ch });
  }
  // the smallest that does it (with its spare channels), then the cheaper
  all.sort((a, b) => a.tier - b.tier || a.ch - b.ch || byPrice(a.p, b.p));
  const facts = [`${cams.length} מצלמות באתר`];
  if (maxMp) facts.push(`עד ${maxMp}MP`);
  facts.push(direct ? `${direct} מחוברות ישירות למקליט` : "אין מצלמות שמחוברות ישירות למקליט במפה");
  if (brand) facts.push(`המותג באתר: ${brand.name}`);
  return { facts, list: pick(all) };
}

// ---------------------------------------------------------------- switch

/** equipment a switch powers over the cable */
const takesPoe = (d: Device) => isCamera(d) || ["ap", "intercom", "doorbell"].includes(d.type) || d.extra?.poe === "PoE" || d.spec?.poe === true;
/** watts it draws: its model's, or a typical figure */
const watts = (d: Device) => d.spec?.powerW ?? (d.type === "cam-ptz" ? 25 : isCamera(d) ? 7 : d.type === "ap" ? 12 : 8);

export function matchSwitch(products: ProductSummary[], switches: Device[], ctx: MatchContext): MatchResult {
  const byId = new Map(ctx.siteDevices.map((d) => [d.id, d]));
  let ports = 0;
  let poe = 0;
  let budget = 0;
  let drawn = false;
  for (const sw of switches) {
    const others = ctx.links
      .filter((l) => l.kind === "cable" && (l.a?.deviceId === sw.id || l.b?.deviceId === sw.id))
      .map((l) => byId.get((l.a?.deviceId === sw.id ? l.b?.deviceId : l.a?.deviceId) ?? ""))
      .filter((d): d is Device => !!d);
    if (others.length) drawn = true;
    const powered = others.filter(takesPoe);
    ports = Math.max(ports, others.length);
    poe = Math.max(poe, powered.length);
    budget = Math.max(budget, powered.reduce((s, d) => s + watts(d), 0));
  }
  if (!drawn) {
    // no cables drawn to it yet: the site's powered equipment shared between the switches, plus an uplink
    const powered = ctx.siteDevices.filter((d) => takesPoe(d) && !d.existing);
    poe = Math.ceil(powered.length / Math.max(1, switches.length));
    ports = poe + 1;
    budget = Math.ceil(powered.reduce((s, d) => s + watts(d), 0) / Math.max(1, switches.length));
  }
  const brand = systemBrand(ctx.siteDevices);
  const all: (Match & { tier: number; total: number })[] = [];
  for (const p of products) {
    if (p.category !== "switch" || p.status === "discontinued") continue;
    const s = p.params;
    const total = (s.ports ?? 0) + (s.uplinks ?? 0);
    if (!total) continue;
    const pros: string[] = [];
    const notes: string[] = [];
    const misses: string[] = [];
    if (total >= ports) pros.push(`${total} פורטים (צריך ${ports})`);
    else misses.push(`${total} פורטים בלבד (צריך ${ports})`);
    if (poe) {
      if ((s.poePorts ?? 0) >= poe) pros.push(`${s.poePorts} פורטי PoE (צריך ${poe})`);
      else misses.push(s.poePorts ? `רק ${s.poePorts} פורטי PoE (צריך ${poe})` : "בלי PoE");
      if (s.poeBudgetW === undefined) notes.push("תקציב ה-PoE לא ידוע");
      else if (s.poeBudgetW >= budget) pros.push(`תקציב PoE ${s.poeBudgetW}W (צריך כ-${Math.round(budget)}W)`);
      else misses.push(`תקציב PoE ${s.poeBudgetW}W בלבד (צריך כ-${Math.round(budget)}W)`);
    }
    if (s.managed) pros.push("מנוהל");
    sameBrand(p, brand, pros, notes, "המצלמות באתר");
    all.push({ p, level: levelOf(misses, notes), pros, notes, misses, tier: misses.length * 100 + notes.length * 10, total });
  }
  all.sort((a, b) => a.tier - b.tier || a.total - b.total || byPrice(a.p, b.p));
  const facts = drawn
    ? [`${ports} חיבורים במפה`, poe ? `${poe} עם PoE` : "בלי ציוד PoE", ...(poe ? [`כ-${Math.round(budget)}W`] : [])]
    : [`אין עדיין כבלים לסוויץ' במפה: לפי הציוד באתר`, `${poe} עם PoE`, `כ-${Math.round(budget)}W`];
  if (brand) facts.push(`המותג באתר: ${brand.name}`);
  return { facts, list: pick(all) };
}
