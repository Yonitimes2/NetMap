"use client";

import { create } from "zustand";
import { diskText, includedDisk } from "./pricing";
import { CAMERA_CATEGORIES, type CatalogCategory, type ProductParams, type ProductSummary } from "./types";
import type { Device, DeviceProduct } from "../types";

/** The product catalog in the browser: loaded once per visit, when the map first needs it. */
export const useCatalog = create<{ products: ProductSummary[] | null; error: string; loading: boolean; load: () => Promise<void> }>((set, get) => ({
  products: null,
  error: "",
  loading: false,
  load: async () => {
    if (get().products || get().loading) return;
    set({ loading: true, error: "" });
    try {
      const res = await fetch("/api/catalog/products", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 401 ? "צריך להתחבר מחדש" : "לא הצלחנו לטעון את מאגר המוצרים");
      set({ products: ((await res.json()) as { products: ProductSummary[] }).products, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof TypeError ? "אין חיבור לשרת. מאגר המוצרים זמין כשיש חיבור." : (e as Error).message });
    }
  },
}));

/** Catalog categories that fit an equipment type on the map (null: the catalog has nothing for it yet). */
export function categoriesFor(deviceType: string): CatalogCategory[] | null {
  if (deviceType.startsWith("cam-")) return CAMERA_CATEGORIES;
  if (deviceType === "nvr") return ["nvr"];
  if (deviceType === "switch") return ["switch"];
  if (deviceType === "speaker" || deviceType === "horn") return ["speaker"];
  if (deviceType === "intercom" || deviceType === "doorbell") return ["intercom"];
  return null;
}

export const FAMILY_LABEL = (deviceType: string) =>
  deviceType.startsWith("cam-") ? "מצלמה" : deviceType === "nvr" ? "מקליט" : deviceType === "switch" ? "מתג" : deviceType === "speaker" || deviceType === "horn" ? "רמקול" : "מוצר";

/**
 * The device changes when a catalog model is chosen: its type, maker and model, its parameters
 * (as defaults it can change), the camera's viewing angle and range on the map, and the matching
 * general fields.
 */
export function productPatch(d: Device, p: ProductSummary): Partial<Device> {
  // a recorder also gets the disk it comes with, as the account's price list sells it
  const disk = p.category === "nvr" ? includedDisk(p) : undefined;
  const s = disk === undefined ? p.params : { ...p.params, includedTb: disk };
  const product: DeviceProduct = {
    id: p.id,
    brandId: p.brandId,
    brand: p.brandName,
    model: p.model,
    name: p.name,
    category: p.category,
    imageId: p.imageId,
    boxIcons: p.boxIcons,
    defaults: s,
  };
  const extra = { ...d.extra };
  const patch: Partial<Device> = { product, spec: { ...s }, manufacturer: p.brandName, model: p.model, type: p.deviceType || d.type };
  if (CAMERA_CATEGORIES.includes(p.category)) {
    if (s.mp) extra.resolution = s.mp === 8 ? "8MP (4K)" : `${s.mp}MP`;
    if (s.lensMm) extra.lens = s.lensMm[0] === s.lensMm[1] ? `${s.lensMm[0]}` : `${s.lensMm[0]}-${s.lensMm[1]}`;
    if (s.poe !== undefined) extra.poe = s.poe ? "PoE" : "12V";
    patch.camera = {
      dir: d.camera?.dir ?? 0,
      fov: s.fovDeg ? Math.round(s.fovDeg) : (d.camera?.fov ?? 90),
      range: s.irM ?? d.camera?.range ?? 10,
    };
  } else if (p.category === "nvr") {
    if (s.channels) extra.channels = String(s.channels);
    if (s.hddBays || disk !== undefined) {
      extra.hdd = [diskText(disk), s.hddBays && `${s.hddBays} ${s.hddBays === 1 ? "מקום לדיסק" : "מקומות לדיסקים"}${s.maxHddTb ? ` עד ${s.maxHddTb}TB` : ""}`].filter(Boolean).join(" · ");
    }
  } else if (p.category === "switch") {
    extra.managed = s.managed ? "כן" : "לא";
    if (s.poePorts) extra.poe = "PoE";
    if (s.poeBudgetW) extra.poeBudget = String(s.poeBudgetW);
    if (s.ports) patch.ports = s.ports + (s.uplinks ?? 0);
  }
  patch.extra = extra;
  return patch;
}

/** Changing one parameter on a device; the camera's angle and range on the map follow it. */
export function specPatch(d: Device, key: keyof ProductParams, value: unknown): Partial<Device> {
  const spec = { ...(d.spec ?? {}) } as Record<string, unknown>;
  if (value === undefined || value === null || value === "") delete spec[key];
  else spec[key] = value;
  const patch: Partial<Device> = { spec: spec as ProductParams };
  if (d.camera && key === "fovDeg" && typeof value === "number") patch.camera = { ...d.camera, fov: Math.round(value) };
  if (d.camera && key === "irM" && typeof value === "number") patch.camera = { ...d.camera, range: value };
  return patch;
}

/**
 * The angles a camera's lens can show, from its model's parameters: a zoom or varifocal lens from
 * its narrowest to its widest, a fixed lens just its own. Null without a model (any angle).
 */
export function fovLimits(d: Device): { min: number; max: number } | null {
  const wide = d.spec?.fovDeg;
  if (!d.product || !wide) return null;
  const tele = d.spec?.fovTeleDeg;
  const max = Math.round(wide);
  return { min: tele && tele < wide ? Math.round(tele) : max, max };
}

// ---------- one brand across the system ----------

const BRAND_ALIASES: [RegExp, string][] = [
  [/provision/, "provision"],
  [/hik/, "hikvision"],
  [/dahua/, "dahua"],
  [/uniview|unv/, "uniview"],
  [/axis/, "axis"],
  [/hanwha|wisenet|samsung/, "hanwha"],
];

/** The maker as a comparable key ("Provision ISR" and "provision-isr" are the same). */
export function brandKey(name?: string): string | undefined {
  const n = name?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!n) return undefined;
  for (const [re, key] of BRAND_ALIASES) if (re.test(n)) return key;
  return n;
}

const deviceBrand = (d: Device) => d.product?.brand ?? d.manufacturer;
const isCamera = (d: Device) => d.type.startsWith("cam-");
/** recorders and switches should be the same brand as the cameras */
const followsCameras = (d: Device) => d.type === "nvr" || d.type === "switch";

/** The cameras' brand at a site (the most common one), with its display name. */
export function systemBrand(siteDevices: Device[]): { key: string; name: string } | null {
  const count = new Map<string, { n: number; name: string }>();
  for (const d of siteDevices) {
    if (!isCamera(d)) continue;
    const name = deviceBrand(d);
    const key = brandKey(name);
    if (!key || !name) continue;
    const c = count.get(key) ?? { n: 0, name };
    c.n++;
    count.set(key, c);
  }
  let best: { key: string; name: string; n: number } | null = null;
  for (const [key, c] of count) if (!best || c.n > best.n) best = { key, name: c.name, n: c.n };
  return best && { key: best.key, name: best.name };
}

/** A note when a device's brand doesn't fit the system (it's never blocked). */
export function brandWarning(d: Device, siteDevices: Device[]): string | null {
  const key = brandKey(deviceBrand(d));
  if (!key) return null;
  const sys = systemBrand(siteDevices);
  if (!sys || sys.key === key) return null;
  if (followsCameras(d)) return `${deviceBrand(d)} לא תואם למערך הקיים: המצלמות באתר הן של ${sys.name}. כדאי שגם המקליט והמתגים יהיו של ${sys.name}.`;
  if (isCamera(d)) return `${deviceBrand(d)} לא תואם למערך הקיים: רוב המצלמות באתר הן של ${sys.name}.`;
  return null;
}

/** Same brand as the site's cameras: shown first in the picker. */
export const fitsSystem = (brandName: string, siteDevices: Device[]) => {
  const sys = systemBrand(siteDevices);
  return !sys || sys.key === brandKey(brandName);
};
