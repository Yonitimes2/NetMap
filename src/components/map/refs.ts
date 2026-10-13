"use client";

import { useApp } from "@/lib/store";
import { deviceTypeById } from "@/lib/catalog";
import { DEFAULT_PPM, obstacleKindById, openingKindById, wallTypeById } from "@/lib/space-catalog";
import { openingSegment, vectorBounds, wallLength } from "@/lib/space";
import type { Floor, Point } from "@/lib/types";
import type { ChatRef, Selection } from "./editor-store";

/** Rough compass side of a point inside the floor bounds, for readable labels ("בצד הצפוני"). */
function side(p: Point, W: number, H: number) {
  const dx = p.x / W - 0.5;
  const dy = p.y / H - 0.5;
  if (Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) return "במרכז";
  const ns = dy < -0.15 ? "צפון" : dy > 0.15 ? "דרום" : "";
  const ew = dx > 0.15 ? "מזרח" : dx < -0.15 ? "מערב" : "";
  return `ב${[ns, ew].filter(Boolean).join("-")}`;
}

/** Turns a map selection into a reference the assistant can understand. */
export function refFromSelection(sel: Selection, floorId: string, ppm: number, bounds: { W: number; H: number }): ChatRef | null {
  if (!sel) return null;
  const st = useApp.getState();
  switch (sel.kind) {
    case "wall": {
      const w = st.walls.find((x) => x.id === sel.id && x.floorId === floorId);
      if (!w) return null;
      const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
      return { kind: "wall", id: w.id, label: `קיר ${wallTypeById(w.type).label} ${(wallLength(w) / ppm).toFixed(1)} מ׳ ${side(mid, bounds.W, bounds.H)}` };
    }
    case "area": {
      const a = st.areas.find((x) => x.id === sel.id && x.floorId === floorId);
      return a ? { kind: "area", id: a.id, label: `חדר "${a.name}"` } : null;
    }
    case "opening": {
      const o = st.openings.find((x) => x.id === sel.id && x.floorId === floorId);
      const w = o && st.walls.find((x) => x.id === o.wallId);
      if (!o || !w) return null;
      const c = openingSegment(w, o, ppm).center;
      return { kind: "opening", id: o.id, label: `${openingKindById(o.kind).label} ${side(c, bounds.W, bounds.H)}` };
    }
    case "obstacle": {
      const o = st.obstacles.find((x) => x.id === sel.id && x.floorId === floorId);
      return o ? { kind: "obstacle", id: o.id, label: `${obstacleKindById(o.kind).label} ${side(o, bounds.W, bounds.H)}` } : null;
    }
    case "device": {
      const d = st.devices.find((x) => x.id === sel.id && x.floorId === floorId);
      return d ? { kind: "device", id: d.id, label: `${d.label} (${deviceTypeById(d.type).label})` } : null;
    }
    default:
      return null;
  }
}

/** Where to draw a reference's number badge, in map px. */
export function refAnchor(r: ChatRef, ppm: number): Point | null {
  if (r.rect) return { x: (r.rect.x1 + r.rect.x2) / 2, y: (r.rect.y1 + r.rect.y2) / 2 };
  const st = useApp.getState();
  switch (r.kind) {
    case "wall": {
      const w = st.walls.find((x) => x.id === r.id);
      return w ? { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 } : null;
    }
    case "area": {
      const a = st.areas.find((x) => x.id === r.id);
      if (!a?.points.length) return null;
      return { x: a.points.reduce((s, p) => s + p.x, 0) / a.points.length, y: a.points.reduce((s, p) => s + p.y, 0) / a.points.length };
    }
    case "opening": {
      const o = st.openings.find((x) => x.id === r.id);
      const w = o && st.walls.find((x) => x.id === o.wallId);
      return o && w ? openingSegment(w, o, ppm).center : null;
    }
    case "obstacle": {
      const o = st.obstacles.find((x) => x.id === r.id);
      return o ? { x: o.x, y: o.y } : null;
    }
    case "device": {
      const d = st.devices.find((x) => x.id === r.id);
      return d ? { x: d.x, y: d.y } : null;
    }
    default:
      return null;
  }
}

/** Floor size in map px: the plan image, or the drawn content. */
export function floorBounds(floor: Floor): { W: number; H: number } {
  if (floor.plan) return { W: floor.plan.width, H: floor.plan.height };
  const st = useApp.getState();
  const on = <T extends { floorId: string }>(xs: T[]) => xs.filter((x) => x.floorId === floor.id);
  return vectorBounds(on(st.walls), on(st.areas), on(st.obstacles), on(st.devices), floor.pxPerMeter ?? DEFAULT_PPM);
}
