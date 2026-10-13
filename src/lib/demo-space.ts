import { DEFAULT_PPM } from "./space-catalog";
import type { Area, Floor, Obstacle, Opening, Wall, WallType } from "./types";

/** A floor that was planned without a drawing: walls, openings and rooms with their properties. */
export function demoPlanningFloor(siteId: string) {
  const floorId = "fl-cohen-4";
  const P = DEFAULT_PPM;
  const pt = (x: number, y: number) => ({ x: x * P, y: y * P });
  const base = { siteId, floorId };
  const walls: Wall[] = [];
  const wall = (id: string, x1: number, y1: number, x2: number, y2: number, type: WallType, more: Partial<Wall> = {}) =>
    walls.push({ ...base, id, a: pt(x1, y1), b: pt(x2, y2), type, ...more });

  const ext = { exterior: true, thicknessCm: 25, heightM: 3.2, cablePass: "no" as const, drilling: "restricted" as const };
  const mamad = { thicknessCm: 30, heightM: 2.6, cablePass: "no" as const, drilling: "forbidden" as const, notes: "אין לקדוח. מעבר כבלים רק דרך צינור האוורור הקיים" };
  const gypsum = { thicknessCm: 10, heightM: 2.7, cablePass: "yes" as const, drilling: "allowed" as const };

  // exterior
  wall("w4-n1", 1, 1, 19, 1, "concrete", ext);
  wall("w4-n2", 19, 1, 25, 1, "mamad", { ...mamad, exterior: true });
  wall("w4-e1", 25, 1, 25, 7, "mamad", { ...mamad, exterior: true });
  wall("w4-e2", 25, 7, 25, 15, "concrete", ext);
  wall("w4-s", 25, 15, 1, 15, "concrete", ext);
  wall("w4-w", 1, 15, 1, 1, "concrete", ext);
  // corridor (north side)
  wall("w4-c1", 1, 7, 13, 7, "drywall", { ...gypsum, conduit: "צינור 25 מ״מ מהתקרה לכל משרד", pullString: true });
  wall("w4-c2", 13, 7, 19, 7, "glass", { thicknessCm: 4, heightM: 2.7, cablePass: "no", drilling: "forbidden" });
  wall("w4-c3", 19, 7, 25, 7, "mamad", mamad);
  // corridor (south side)
  wall("w4-c4", 1, 9, 15, 9, "drywall", gypsum);
  wall("w4-c5", 15, 9, 19, 9, "block", { thicknessCm: 15, heightM: 2.7, cablePass: "partial", drilling: "allowed" });
  wall("w4-c6", 19, 9, 25, 9, "block", { thicknessCm: 15, heightM: 2.7, cablePass: "unknown", drilling: "allowed" });
  // room dividers
  wall("w4-d1", 7, 1, 7, 7, "drywall", gypsum);
  wall("w4-d2", 13, 1, 13, 7, "drywall", gypsum);
  wall("w4-d3", 19, 1, 19, 7, "mamad", mamad);
  wall("w4-d4", 15, 9, 15, 15, "block", { thicknessCm: 15, heightM: 2.7, cablePass: "partial" });
  wall("w4-d5", 19, 9, 19, 15, "block", { thicknessCm: 15, heightM: 2.7, cablePass: "no" });

  const openings: Opening[] = [];
  const open = (id: string, wallId: string, kind: Opening["kind"], offsetM: number, widthM: number, notes?: string) =>
    openings.push({ ...base, id, wallId, kind, offsetM, widthM, notes });
  open("o4-1", "w4-w", "door", 7, 1.4, "כניסה ראשית");
  open("o4-2", "w4-c1", "door", 4, 0.9);
  open("o4-3", "w4-c1", "door", 10, 0.9);
  open("o4-4", "w4-c2", "door", 3, 1);
  open("o4-5", "w4-c3", "door", 1.5, 0.8, "דלת ממ״ד");
  open("o4-6", "w4-c4", "passage", 5, 2.5);
  open("o4-7", "w4-c5", "door", 2, 0.9);
  open("o4-8", "w4-c6", "door", 2, 0.9);
  open("o4-9", "w4-n1", "window", 3, 1.5);
  open("o4-10", "w4-n1", "window", 9, 1.5);
  open("o4-11", "w4-n1", "window", 15, 1.5);
  open("o4-12", "w4-s", "vitrine", 17, 5, "ויטרינה לרחוב: שמש אחר הצהריים");

  const rect = (x1: number, y1: number, x2: number, y2: number) => [pt(x1, y1), pt(x2, y1), pt(x2, y2), pt(x1, y2)];
  const areas: Area[] = [
    { ...base, id: "r4-1", name: "משרד 1", color: "#60a5fa", points: rect(1, 1, 7, 7), usage: "משרד", ceilingType: "acoustic", ceilingHeightM: 2.7, plenumM: 0.6, plenumAccess: true, lighting: "good", power: "available" },
    { ...base, id: "r4-2", name: "משרד 2", color: "#60a5fa", points: rect(7, 1, 13, 7), usage: "משרד", ceilingType: "acoustic", ceilingHeightM: 2.7, plenumM: 0.6, plenumAccess: true, lighting: "good", power: "available" },
    { ...base, id: "r4-3", name: "חדר ישיבות", color: "#a78bfa", points: rect(13, 1, 19, 7), usage: "חדר ישיבות", ceilingType: "acoustic", ceilingHeightM: 2.7, plenumM: 0.6, plenumAccess: true, lighting: "backlight", notes: "קיר זכוכית למסדרון וחלון גדול" },
    { ...base, id: "r4-4", name: "ממ״ד", color: "#94a3b8", points: rect(19, 1, 25, 7), usage: "ממ״ד", ceilingType: "concrete", ceilingHeightM: 2.5, lighting: "low", notes: "משמש גם כחדר תקשורת. כבלים נכנסים דרך צינור האוורור בלבד" },
    { ...base, id: "r4-5", name: "מסדרון", color: "#fbbf24", points: rect(1, 7, 25, 9), usage: "מסדרון", ceilingType: "acoustic", ceilingHeightM: 2.6, plenumM: 0.8, plenumAccess: true, lighting: "low", notes: "תוואי כבלים ראשי מעל התקרה" },
    { ...base, id: "r4-6", name: "אופן ספייס", color: "#34d399", points: rect(1, 9, 15, 15), usage: "אופן ספייס", ceilingType: "open", ceilingHeightM: 3.2, lighting: "sun", power: "available" },
    { ...base, id: "r4-7", name: "מטבחון", color: "#f87171", points: rect(15, 9, 19, 15), usage: "מטבח", ceilingType: "drywall", ceilingHeightM: 2.6, env: ["hot", "humid"] },
    { ...base, id: "r4-8", name: "שירותים", color: "#94a3b8", points: rect(19, 9, 25, 15), usage: "שירותים", ceilingType: "drywall", ceilingHeightM: 2.6, env: ["humid"], noCameras: true },
  ];

  const obstacles: Obstacle[] = [
    { ...base, id: "ob4-1", kind: "column", x: 7 * P, y: 12 * P, w: 0.4 * P, h: 0.4 * P },
    { ...base, id: "ob4-2", kind: "column", x: 11 * P, y: 12 * P, w: 0.4 * P, h: 0.4 * P },
    { ...base, id: "ob4-3", kind: "shaft", x: 24.3 * P, y: 8 * P, w: 0.8 * P, h: 0.8 * P, notes: "פיר תקשורת לקומה 3" },
  ];

  const floor: Floor = { id: floorId, siteId, name: "קומה 4 — שטח חדש (בלי תוכנית)", order: 2, pxPerMeter: P };
  return { floor, walls, openings, areas, obstacles };
}
