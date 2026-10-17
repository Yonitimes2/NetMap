import { openingSegment } from "./space";
import { DEFAULT_PPM } from "./space-catalog";
import type { Area, CameraView, Device, Floor, Link, Obstacle, ObstacleKind, Opening, OpeningKind, Point, Wall } from "./types";

/**
 * One floor as the customer's page draws it: cropped to what's drawn there (or the whole plan
 * picture), with the planned equipment, rooms, walls, doors and windows. No Node imports here.
 */
export interface PublicFloor {
  id: string;
  name: string;
  /** the drawing's window, in map pixels */
  box: { x: number; y: number; w: number; h: number };
  /** map pixels per meter */
  ppm: number;
  /** a marker's size, in map pixels (so it reads the same on any plan) */
  s: number;
  plan?: { url: string; width: number; height: number };
  walls: { a: Point; b: Point; color: string; width: number }[];
  openings: { p1: Point; p2: Point; ux: number; uy: number; kind: OpeningKind; gap: number }[];
  obstacles: { x: number; y: number; w: number; h: number; kind: ObstacleKind }[];
  /** `size`: the name's font size, fitted into the room (0: too small a room to name) */
  areas: { points: Point[]; color: string; name: string; label: Point; size: number }[];
  cables: { points: Point[] }[];
  /** `mx, my`: where its marker is drawn, moved off its neighbors (a thin line leads back to x, y) */
  devices: { x: number; y: number; mx: number; my: number; type: string; n?: number; camera?: CameraView }[];
}

/** Walls in a few plain shades: solid ones dark, light ones lighter, glass blue. */
function wallColor(type: Wall["type"]) {
  if (type === "glass") return "#7dd3fc";
  if (type === "fence") return "#94a3b8";
  if (type === "drywall" || type === "partition" || type === "wood" || type === "sandwich") return "#64748b";
  return "#334155";
}

/** Where a room's name goes: its middle (by area), or the average of its corners for an odd shape. */
function labelPoint(pts: Point[]): Point {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-6) return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/**
 * A room's name as big as fits across it (on a plan picture a little smaller: the picture often has
 * its own names); 0 when the room is too small to name.
 */
function nameSize(a: Area, s: number, onPicture: boolean) {
  const xs = a.points.map((p) => p.x);
  const ys = a.points.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const base = s * (onPicture ? 0.36 : 0.46);
  // a Hebrew letter is about half as wide as the font is tall
  const size = Math.min(base, (0.85 * w) / (Math.max(1, a.name.length) * 0.52), 0.55 * h);
  return size < base * 0.45 ? 0 : size;
}

/** Markers closer than `min` are pushed apart (a few rounds), and kept inside the drawing. */
function spread(points: Point[], min: number, box: PublicFloor["box"]): Point[] {
  const pos = points.map((p) => ({ ...p }));
  for (let round = 0; round < 40; round++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        let dx = pos[j].x - pos[i].x;
        let dy = pos[j].y - pos[i].y;
        let d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d < 1e-6) {
          // on the very same spot: side by side
          dx = 1;
          dy = 0;
          d = 1;
        }
        const push = (min - d) / 2;
        pos[i].x -= (dx / d) * push;
        pos[i].y -= (dy / d) * push;
        pos[j].x += (dx / d) * push;
        pos[j].y += (dy / d) * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  const pad = min / 2;
  return pos.map((p) => ({ x: Math.min(box.x + box.w - pad, Math.max(box.x + pad, p.x)), y: Math.min(box.y + box.h - pad, Math.max(box.y + pad, p.y)) }));
}

export function publicFloor(input: {
  floor: Floor;
  planUrl?: string;
  devices: (Device & { n?: number })[];
  walls: Wall[];
  openings: Opening[];
  obstacles: Obstacle[];
  areas: Area[];
  links: Link[];
}): PublicFloor {
  const { floor: f, planUrl, devices, walls, areas, obstacles } = input;
  // as the map draws it: a plan's scale, else the default
  const ppm = f.pxPerMeter ?? (f.plan ? 40 : DEFAULT_PPM);

  let box: PublicFloor["box"];
  if (planUrl && f.plan) box = { x: 0, y: 0, w: f.plan.width, h: f.plan.height };
  else {
    // what's drawn, and a margin around it
    const pts = [
      ...walls.flatMap((w) => [w.a, w.b]),
      ...areas.flatMap((a) => a.points),
      ...obstacles.flatMap((o) => [
        { x: o.x - o.w / 2, y: o.y - o.h / 2 },
        { x: o.x + o.w / 2, y: o.y + o.h / 2 },
      ]),
      ...devices,
    ];
    if (!pts.length) pts.push({ x: 0, y: 0 }, { x: 12 * ppm, y: 8 * ppm });
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const m = Math.max(1.2 * ppm, 0.06 * Math.max(maxX - minX, maxY - minY));
    // not smaller than a small room
    const w = Math.max(maxX - minX + 2 * m, 6 * ppm);
    const h = Math.max(maxY - minY + 2 * m, 4 * ppm);
    box = { x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h };
  }
  const s = Math.max(box.w, box.h) / 20;

  const wallWidth = (w: Wall) => Math.min(s / 2.5, Math.max(s / 7, ((w.thicknessCm ?? 15) / 100) * ppm));
  const byId = new Map(walls.map((w) => [w.id, w]));
  const spots = spread(
    devices.map((d) => ({ x: d.x, y: d.y })),
    s * 1.08,
    box,
  );

  return {
    id: f.id,
    name: f.name,
    box,
    ppm,
    s,
    plan: planUrl && f.plan ? { url: planUrl, width: f.plan.width, height: f.plan.height } : undefined,
    walls: walls.map((w) => ({ a: w.a, b: w.b, color: wallColor(w.type), width: wallWidth(w) })),
    openings: input.openings.flatMap((o) => {
      const w = byId.get(o.wallId);
      if (!w) return [];
      const seg = openingSegment(w, o, ppm);
      return [{ p1: seg.p1, p2: seg.p2, ux: seg.ux, uy: seg.uy, kind: o.kind, gap: wallWidth(w) + 2 }];
    }),
    obstacles: obstacles.map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h, kind: o.kind })),
    areas: areas.filter((a) => a.points.length >= 3).map((a) => ({ points: a.points, color: a.color, name: a.name, label: labelPoint(a.points), size: nameSize(a, s, !!planUrl) })),
    cables: input.links.filter((l) => l.kind === "cable" && l.points.length > 1).map((l) => ({ points: l.points })),
    devices: devices.map((d, i) => ({ x: d.x, y: d.y, mx: spots[i].x, my: spots[i].y, type: d.type, n: d.n, camera: d.camera })),
  };
}
