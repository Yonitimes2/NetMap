import { uid } from "./ids";
import type { Area, Device, Obstacle, Opening, Point, Wall } from "./types";
import type { SpaceModelM } from "./space-schema";

export function wallLength(w: Pick<Wall, "a" | "b">) {
  return Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
}

/** Closest point on a wall to p: t in [0,1], distance in px. */
export function projectOnWall(p: Point, w: Pick<Wall, "a" | "b">) {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / l2));
  const q = { x: w.a.x + t * dx, y: w.a.y + t * dy };
  return { t, point: q, dist: Math.hypot(p.x - q.x, p.y - q.y) };
}

/** Endpoints of an opening along its wall, in px. */
export function openingSegment(w: Pick<Wall, "a" | "b">, o: Pick<Opening, "offsetM" | "widthM">, ppm: number) {
  const len = wallLength(w) || 1;
  const ux = (w.b.x - w.a.x) / len;
  const uy = (w.b.y - w.a.y) / len;
  const c = Math.max(0, Math.min(len, o.offsetM * ppm));
  const half = Math.min((o.widthM * ppm) / 2, len / 2);
  const cc = Math.max(half, Math.min(len - half, c));
  return {
    p1: { x: w.a.x + ux * (cc - half), y: w.a.y + uy * (cc - half) },
    p2: { x: w.a.x + ux * (cc + half), y: w.a.y + uy * (cc + half) },
    center: { x: w.a.x + ux * cc, y: w.a.y + uy * cc },
    ux,
    uy,
  };
}

/**
 * Snap a wall endpoint: to an existing endpoint nearby; else to 0/45/90° from the previous point;
 * then to a grid (map px) so lengths come out round. `free` (Shift) skips the angle snap.
 */
export function snapWallPoint(
  p: Point,
  prev: Point | undefined,
  endpoints: Point[],
  snapDist: number,
  free: boolean,
  grid?: number,
): Point {
  for (const e of endpoints) if (Math.hypot(e.x - p.x, e.y - p.y) < snapDist) return e;
  const g = (v: number) => (grid ? Math.round(v / grid) * grid : v);
  if (!prev || free) return { x: g(p.x), y: g(p.y) };
  const dx = p.x - prev.x;
  const dy = p.y - prev.y;
  const ang = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(ang / step) * step;
  if (Math.abs(snapped - ang) < (7 * Math.PI) / 180) {
    const cos = Math.round(Math.cos(snapped) * 1e6) / 1e6;
    const sin = Math.round(Math.sin(snapped) * 1e6) / 1e6;
    if (sin === 0) return { x: g(p.x), y: prev.y };
    if (cos === 0) return { x: prev.x, y: g(p.y) };
    // diagonal: round the length along the diagonal
    const len = g(Math.hypot(dx, dy) / Math.SQRT2) * Math.SQRT2;
    return { x: prev.x + cos * len, y: prev.y + sin * len };
  }
  return { x: g(p.x), y: g(p.y) };
}

/** Size of the drawing area for a floor without an uploaded plan. */
export function vectorBounds(
  walls: Wall[],
  areas: Area[],
  obstacles: Obstacle[],
  devices: Device[],
  ppm: number,
): { W: number; H: number } {
  let mx = 0;
  let my = 0;
  const add = (p: Point) => {
    mx = Math.max(mx, p.x);
    my = Math.max(my, p.y);
  };
  walls.forEach((w) => (add(w.a), add(w.b)));
  areas.forEach((a) => a.points.forEach(add));
  obstacles.forEach((o) => add({ x: o.x + o.w / 2, y: o.y + o.h / 2 }));
  devices.forEach(add);
  // an empty floor gets 30m x 20m to draw in; otherwise hug the content (plus a margin)
  if (mx === 0 && my === 0) return { W: 30 * ppm, H: 20 * ppm };
  const margin = 2 * ppm;
  return { W: Math.max(mx + margin, 12 * ppm), H: Math.max(my + margin, 8 * ppm) };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Floor elements (px) → assistant model (meters). */
export function toMeters(
  data: { walls: Wall[]; openings: Opening[]; areas: Area[]; obstacles: Obstacle[] },
  ppm: number,
): SpaceModelM {
  const m = (v: number) => r2(v / ppm);
  return {
    walls: data.walls.map((w) => ({
      id: w.id,
      x1: m(w.a.x),
      y1: m(w.a.y),
      x2: m(w.b.x),
      y2: m(w.b.y),
      type: w.type,
      exterior: w.exterior,
      thicknessCm: w.thicknessCm,
      heightM: w.heightM,
      cablePass: w.cablePass,
      conduit: w.conduit,
      pullString: w.pullString,
      drilling: w.drilling,
      finish: w.finish,
      notes: w.notes,
    })),
    openings: data.openings.map((o) => ({
      id: o.id,
      wallId: o.wallId,
      kind: o.kind,
      offsetM: r2(o.offsetM),
      widthM: o.widthM,
      heightM: o.heightM,
      notes: o.notes,
    })),
    rooms: data.areas.map((a) => ({
      id: a.id,
      name: a.name,
      polygon: a.points.map((p) => ({ x: m(p.x), y: m(p.y) })),
      usage: a.usage,
      outdoor: a.outdoor,
      ceilingType: a.ceilingType,
      ceilingHeightM: a.ceilingHeightM,
      plenumM: a.plenumM,
      plenumAccess: a.plenumAccess,
      floorKind: a.floorKind,
      lighting: a.lighting,
      env: a.env,
      noCameras: a.noCameras,
      power: a.power,
      notes: a.notes,
    })),
    obstacles: data.obstacles.map((o) => ({
      id: o.id,
      kind: o.kind,
      x: m(o.x),
      y: m(o.y),
      w: m(o.w),
      h: m(o.h),
      notes: o.notes,
    })),
  };
}

const ROOM_COLORS = ["#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#94a3b8"];

/**
 * Assistant model (meters) → floor elements (px). Ids the floor already has are kept;
 * any other id is replaced by a fresh unique one (ids are global across the app).
 */
export function fromMeters(
  model: SpaceModelM,
  ppm: number,
  ctx: { siteId: string; floorId: string; existingIds: Set<string>; existingColors: Map<string, string> },
) {
  const px = (v: number) => Math.round(v * ppm * 10) / 10;
  const idMap = new Map<string, string>();
  const keep = (id: string) => {
    if (!idMap.has(id)) idMap.set(id, ctx.existingIds.has(id) ? id : uid());
    return idMap.get(id)!;
  };
  const base = { siteId: ctx.siteId, floorId: ctx.floorId };

  const walls: Wall[] = model.walls.map((w) => ({
    ...base,
    id: keep(w.id),
    a: { x: px(w.x1), y: px(w.y1) },
    b: { x: px(w.x2), y: px(w.y2) },
    type: w.type,
    exterior: w.exterior,
    thicknessCm: w.thicknessCm,
    heightM: w.heightM,
    cablePass: w.cablePass,
    conduit: w.conduit,
    pullString: w.pullString,
    drilling: w.drilling,
    finish: w.finish,
    notes: w.notes,
  }));
  const wallIds = new Set(walls.map((w) => w.id));
  const openings: Opening[] = model.openings
    .map((o) => ({
      ...base,
      id: keep(o.id),
      wallId: idMap.get(o.wallId) ?? o.wallId,
      kind: o.kind,
      offsetM: o.offsetM,
      widthM: o.widthM,
      heightM: o.heightM,
      notes: o.notes,
    }))
    .filter((o) => wallIds.has(o.wallId));
  const areas: Area[] = model.rooms.map((r, i) => {
    const id = keep(r.id);
    return {
      ...base,
      id,
      name: r.name,
      color: ctx.existingColors.get(id) ?? ROOM_COLORS[i % ROOM_COLORS.length],
      points: r.polygon.map((p) => ({ x: px(p.x), y: px(p.y) })),
      usage: r.usage,
      outdoor: r.outdoor,
      ceilingType: r.ceilingType,
      ceilingHeightM: r.ceilingHeightM,
      plenumM: r.plenumM,
      plenumAccess: r.plenumAccess,
      floorKind: r.floorKind,
      lighting: r.lighting,
      env: r.env,
      noCameras: r.noCameras,
      power: r.power,
      notes: r.notes,
    };
  });
  const obstacles: Obstacle[] = model.obstacles.map((o) => ({
    ...base,
    id: keep(o.id),
    kind: o.kind,
    x: px(o.x),
    y: px(o.y),
    w: px(o.w),
    h: px(o.h),
    notes: o.notes,
  }));
  return { walls, openings, areas, obstacles };
}

export function pointInPolygon(p: Point, poly: Point[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Privacy zones (noCameras rooms) that a camera's field of view reaches. Walls are not taken into account. */
export function camerasPrivacyHits(d: Device, areas: Area[], ppm: number): Area[] {
  if (!d.camera) return [];
  const zones = areas.filter((a) => a.noCameras && a.floorId === d.floorId && a.points.length >= 3);
  if (!zones.length) return [];
  const { dir, fov, range } = d.camera;
  const hits = new Set<Area>();
  for (let ang = dir - fov / 2; ang <= dir + fov / 2; ang += 4) {
    const rad = (ang * Math.PI) / 180;
    for (let r = 0.5; r <= range; r += 0.5) {
      const p = { x: d.x + Math.cos(rad) * r * ppm, y: d.y + Math.sin(rad) * r * ppm };
      for (const z of zones) if (pointInPolygon(p, z.points)) hits.add(z);
    }
  }
  return [...hits];
}
