import type { RackDoor, RackItem, RackItemKind, RackKind, RackSpec } from "./types";

export interface RackItemDef {
  kind: RackItemKind;
  label: string;
  /** typical height in U */
  height: number;
  color: string;
  /** map equipment type this slot corresponds to, if any */
  deviceType?: string;
}

export const RACK_ITEMS: RackItemDef[] = [
  { kind: "patch", label: "פאץ׳ פאנל", height: 1, color: "#64748b", deviceType: "patch" },
  { kind: "switch", label: "סוויץ׳", height: 1, color: "#2563eb", deviceType: "switch" },
  { kind: "router", label: "ראוטר", height: 1, color: "#0ea5e9", deviceType: "router" },
  { kind: "firewall", label: "פיירוול", height: 1, color: "#7c3aed", deviceType: "firewall" },
  { kind: "modem", label: "מודם / ONT", height: 1, color: "#06b6d4", deviceType: "modem" },
  { kind: "nvr", label: "NVR / DVR", height: 2, color: "#dc2626", deviceType: "nvr" },
  { kind: "server", label: "שרת / NAS", height: 2, color: "#334155", deviceType: "server" },
  { kind: "ups", label: "UPS", height: 2, color: "#ca8a04", deviceType: "ups" },
  { kind: "shelf", label: "מדף", height: 1, color: "#a8a29e" },
  { kind: "cable-mgr", label: "מסדר כבלים", height: 1, color: "#94a3b8" },
  { kind: "pdu", label: "פס שקעים (PDU)", height: 1, color: "#f59e0b" },
  { kind: "fan", label: "מגש מאווררים", height: 1, color: "#22c55e" },
  { kind: "blank", label: "פנל עיוור", height: 1, color: "#cbd5e1" },
  { kind: "other", label: "אחר", height: 1, color: "#78716c" },
];

export const rackItemDef = (k: RackItemKind) => RACK_ITEMS.find((r) => r.kind === k) ?? RACK_ITEMS[RACK_ITEMS.length - 1];

/** map equipment type → rack item kind */
export const rackKindForDevice = (type: string): RackItemKind | undefined => RACK_ITEMS.find((r) => r.deviceType === type)?.kind;

export const RACK_KINDS: { id: RackKind; label: string; sizes: number[] }[] = [
  { id: "wall", label: "ארון תלוי (קיר)", sizes: [6, 9, 12, 15, 18, 22] },
  { id: "floor", label: "ארון עומד (רצפה)", sizes: [22, 27, 32, 37, 42, 47] },
  { id: "open", label: "מסגרת פתוחה", sizes: [12, 18, 24, 32, 42, 47] },
];

export const RACK_DOORS: { id: RackDoor; label: string }[] = [
  { id: "glass", label: "דלת זכוכית" },
  { id: "perforated", label: "דלת מחוררת (אוורור)" },
  { id: "solid", label: "דלת אטומה" },
  { id: "none", label: "ללא דלת" },
];

export const RACK_DEPTHS = [300, 450, 500, 600, 800, 1000];

export const defaultRackSpec = (): RackSpec => ({ kind: "wall", units: 12, widthMm: 600, depthMm: 450, door: "glass", lock: true });

export const usedUnits = (items: RackItem[]) => items.reduce((s, i) => s + i.height, 0);

/**
 * Smallest standard cabinet that fits the equipment with ~30% spare room.
 * Wall cabinets up to 22U; bigger installations need a floor cabinet.
 */
export function recommendRack(items: RackItem[]): { kind: RackKind; units: number } {
  const need = Math.max(usedUnits(items) + 2, Math.ceil(usedUnits(items) * 1.3));
  const wall = RACK_KINDS[0].sizes.find((n) => n >= need);
  if (wall) return { kind: "wall", units: wall };
  const floor = RACK_KINDS[1].sizes.find((n) => n >= need);
  return { kind: "floor", units: floor ?? 47 };
}

/** units 1..total that are taken (optionally ignoring one item) */
export function takenUnits(items: RackItem[], ignoreId?: string) {
  const taken = new Set<number>();
  for (const i of items) if (i.id !== ignoreId) for (let u = i.u; u < i.u + i.height; u++) taken.add(u);
  return taken;
}

export function fits(items: RackItem[], total: number, u: number, height: number, ignoreId?: string) {
  if (u < 1 || u + height - 1 > total) return false;
  const taken = takenUnits(items, ignoreId);
  for (let x = u; x < u + height; x++) if (taken.has(x)) return false;
  return true;
}

/** first free position from the top of the cabinet (racks are usually filled top-down) */
export function firstFreeFromTop(items: RackItem[], total: number, height: number): number | null {
  for (let u = total - height + 1; u >= 1; u--) if (fits(items, total, u, height)) return u;
  return null;
}
