import { FileText, HardHat, ShoppingCart, Wrench, type LucideIcon } from "lucide-react";
import { deviceTypeById, layerById, linkTypeById } from "./catalog";
import { linkLengthM } from "./graph";
import type { Device, Floor, Link, ProjectStage, Site } from "./types";

/** The four stages every project goes through, in order. */
export const STAGES: { id: ProjectStage; label: string; short: string; icon: LucideIcon; about: string }[] = [
  {
    id: "quote",
    label: "הצעת מחיר",
    short: "הצעה",
    icon: FileText,
    about: "תכנון המיקומים והציוד במפה, כתב כמויות, תמחור העבודה, והצעה ללקוח עם או בלי מחירים.",
  },
  {
    id: "purchase",
    label: "רכש",
    short: "רכש",
    icon: ShoppingCart,
    about: "מעקב שכל הציוד נרכש לפני היציאה לשטח: ספק, עלות וקבלה לכל פריט, וציוד שכבר היה במלאי.",
  },
  {
    id: "install",
    label: "ביצוע",
    short: "ביצוע",
    icon: HardHat,
    about: "סדר העבודה למתקין (הגדרה והתקנה), מעקב מה כבר בוצע, והדפסת מדבקות לכל ציוד וכבל.",
  },
  {
    id: "service",
    label: "תחזוקה ושירות",
    short: "שירות",
    icon: Wrench,
    about: "מה עובד ומה לא בכל רגע, הגעה מהירה לציוד תקול במפה, קריאות שירות ואחריות.",
  },
];

export const stageOf = (site: Pick<Site, "stage">): ProjectStage => site.stage ?? "quote";
export const stageDef = (id: ProjectStage) => STAGES.find((s) => s.id === id)!;
export const stageIndex = (id: ProjectStage) => STAGES.findIndex((s) => s.id === id);

/** What the project's map holds: its new equipment by type, what the customer already had, and cable meters by type. */
export function equipmentSummary(siteId: string, devices: Device[], links: Link[], floors: Floor[]) {
  const mine = devices.filter((d) => d.siteId === siteId);
  const fresh = mine.filter((d) => !d.existing);
  const byType = new Map<string, number>();
  for (const d of fresh) byType.set(d.type, (byType.get(d.type) ?? 0) + 1);
  const types = [...byType.entries()]
    .map(([type, n]) => ({ def: deviceTypeById(type), n }))
    .sort((a, b) => a.def.layer.localeCompare(b.def.layer) || b.n - a.n)
    .map((t) => ({ ...t, color: layerById(t.def.layer).color }));

  const scale = new Map(floors.map((f) => [f.id, f.pxPerMeter]));
  const meters = new Map<string, { m: number; unmeasured: number }>();
  for (const l of links) {
    if (l.siteId !== siteId || l.kind !== "cable") continue;
    const len = linkLengthM(l, l.floorId ? scale.get(l.floorId) : undefined);
    const cur = meters.get(l.cableType) ?? { m: 0, unmeasured: 0 };
    if (len) cur.m += len;
    else cur.unmeasured++;
    meters.set(l.cableType, cur);
  }
  const cables = [...meters.entries()].map(([type, v]) => ({ def: linkTypeById(type), ...v })).sort((a, b) => b.m - a.m);

  return { total: mine.length, fresh: fresh.length, existing: mine.length - fresh.length, types, cables };
}
