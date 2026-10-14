"use client";

import { CABLE_PASS, obstacleKindById, openingKindById, wallTypeById } from "@/lib/space-catalog";
import { openingSegment, wallLength } from "@/lib/space";
import type { Obstacle, Opening, Point, Wall } from "@/lib/types";
import type { Selection } from "./editor-store";

interface Props {
  walls: Wall[];
  openings: Opening[];
  obstacles: Obstacle[];
  ppm: number;
  /** world units per screen pixel */
  s: number;
  colorBy: "type" | "pass";
  selection: Selection;
  /** wall endpoint override while dragging */
  wallPos: (w: Wall) => { a: Point; b: Point };
  obstaclePos: (o: Obstacle) => Point;
  openingOffset: (o: Opening) => number;
  onPick: (e: React.PointerEvent, pick: Selection) => void;
  onWallEndDown?: (e: React.PointerEvent, w: Wall, end: "a" | "b") => void;
  /** when editing: press on a wall to select it and drag it */
  onWallDown?: (e: React.PointerEvent, w: Wall) => void;
  onOpeningDown?: (e: React.PointerEvent, o: Opening) => void;
  onObstacleDown?: (e: React.PointerEvent, o: Obstacle) => void;
  /** finger input: wider hit lines and bigger handles */
  touch?: boolean;
}

export function wallColor(w: Wall, colorBy: "type" | "pass") {
  if (colorBy === "pass") return CABLE_PASS.find((c) => c.id === (w.cablePass ?? "unknown"))!.color;
  return wallTypeById(w.type).color;
}

export function wallWidth(w: Wall, ppm: number, s: number) {
  const cm = w.thicknessCm ?? wallTypeById(w.type).thickness;
  return Math.max((cm / 100) * ppm, 2.5 * s);
}

export function StructureLayer(p: Props) {
  const { ppm, s } = p;
  const hs = p.touch ? 1.7 : 1;
  const byId = new Map(p.walls.map((w) => [w.id, w]));
  const sel = p.selection;

  return (
    <g>
      {/* walls */}
      {p.walls.map((w) => {
        const { a, b } = p.wallPos(w);
        const width = wallWidth(w, ppm, s);
        const color = wallColor(w, p.colorBy);
        const def = wallTypeById(w.type);
        const selected = sel?.kind === "wall" && sel.id === w.id;
        return (
          <g key={w.id}>
            {selected && (
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#3b82f6" strokeOpacity={0.45} strokeWidth={width + 8 * s} strokeLinecap="round" />
            )}
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={color}
              strokeWidth={width}
              strokeLinecap="square"
              strokeDasharray={def.dash ? def.dash.split(" ").map((n) => +n * s * 1.5).join(" ") : undefined}
            />
            {w.type === "mamad" && p.colorBy === "type" && (
              // hatch marker for protected-space walls
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fbbf24" strokeWidth={Math.max(1, width * 0.18)} strokeDasharray={`${6 * s} ${6 * s}`} />
            )}
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="transparent"
              strokeWidth={Math.max(width, 14 * s * hs)}
              style={{ cursor: p.onWallDown ? "move" : "pointer" }}
              onPointerDown={(e) => (p.onWallDown ? p.onWallDown(e, w) : p.onPick(e, { kind: "wall", id: w.id }))}
            />
          </g>
        );
      })}

      {/* openings */}
      {p.openings.map((o) => {
        const w = byId.get(o.wallId);
        if (!w) return null;
        const pos = p.wallPos(w);
        const seg = openingSegment(pos, { offsetM: p.openingOffset(o), widthM: o.widthM }, ppm);
        const width = wallWidth(w, ppm, s);
        const kind = openingKindById(o.kind);
        const selected = sel?.kind === "opening" && sel.id === o.id;
        const nx = -seg.uy;
        const ny = seg.ux;
        const span = Math.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
        return (
          <g key={o.id}>
            {/* gap in the wall */}
            <line x1={seg.p1.x} y1={seg.p1.y} x2={seg.p2.x} y2={seg.p2.y} stroke="#fff" strokeWidth={width + 1.5 * s} />
            {o.kind === "door" && (
              <>
                <line x1={seg.p1.x} y1={seg.p1.y} x2={seg.p1.x + nx * span} y2={seg.p1.y + ny * span} stroke={kind.color} strokeWidth={1.5 * s} />
                <path
                  d={`M${seg.p1.x + nx * span} ${seg.p1.y + ny * span} A${span} ${span} 0 0 0 ${seg.p2.x} ${seg.p2.y}`}
                  fill="none"
                  stroke={kind.color}
                  strokeWidth={1 * s}
                  strokeDasharray={`${3 * s} ${2 * s}`}
                />
              </>
            )}
            {(o.kind === "window" || o.kind === "vitrine") && (
              <>
                <line
                  x1={seg.p1.x + (nx * width) / 3}
                  y1={seg.p1.y + (ny * width) / 3}
                  x2={seg.p2.x + (nx * width) / 3}
                  y2={seg.p2.y + (ny * width) / 3}
                  stroke={kind.color}
                  strokeWidth={(o.kind === "vitrine" ? 2.5 : 1.5) * s}
                />
                <line
                  x1={seg.p1.x - (nx * width) / 3}
                  y1={seg.p1.y - (ny * width) / 3}
                  x2={seg.p2.x - (nx * width) / 3}
                  y2={seg.p2.y - (ny * width) / 3}
                  stroke={kind.color}
                  strokeWidth={(o.kind === "vitrine" ? 2.5 : 1.5) * s}
                />
              </>
            )}
            {o.kind === "gate" && (
              <line x1={seg.p1.x} y1={seg.p1.y} x2={seg.p2.x} y2={seg.p2.y} stroke={kind.color} strokeWidth={3 * s} strokeDasharray={`${8 * s} ${4 * s}`} />
            )}
            {o.kind === "passage" &&
              [seg.p1, seg.p2].map((q, i) => (
                <line key={i} x1={q.x - (nx * width) / 2} y1={q.y - (ny * width) / 2} x2={q.x + (nx * width) / 2} y2={q.y + (ny * width) / 2} stroke={kind.color} strokeWidth={1.5 * s} />
              ))}
            {selected && (
              <line x1={seg.p1.x} y1={seg.p1.y} x2={seg.p2.x} y2={seg.p2.y} stroke="#3b82f6" strokeOpacity={0.6} strokeWidth={width + 6 * s} strokeLinecap="round" />
            )}
            <line
              x1={seg.p1.x}
              y1={seg.p1.y}
              x2={seg.p2.x}
              y2={seg.p2.y}
              stroke="transparent"
              strokeWidth={Math.max(width, 16 * s * hs)}
              style={{ cursor: p.onOpeningDown ? "ew-resize" : "pointer" }}
              onPointerDown={(e) => (p.onOpeningDown ? p.onOpeningDown(e, o) : p.onPick(e, { kind: "opening", id: o.id }))}
            />
          </g>
        );
      })}

      {/* obstacles */}
      {p.obstacles.map((o) => {
        const c = p.obstaclePos(o);
        const x = c.x - o.w / 2;
        const y = c.y - o.h / 2;
        const selected = sel?.kind === "obstacle" && sel.id === o.id;
        const k = obstacleKindById(o.kind);
        return (
          <g
            key={o.id}
            style={{ cursor: p.onObstacleDown ? "move" : "pointer" }}
            onPointerDown={(e) => (p.onObstacleDown ? p.onObstacleDown(e, o) : p.onPick(e, { kind: "obstacle", id: o.id }))}
          >
            <rect
              x={x}
              y={y}
              width={o.w}
              height={o.h}
              fill={o.kind === "column" ? "#475569" : "#f1f5f9"}
              stroke={selected ? "#3b82f6" : "#475569"}
              strokeWidth={(selected ? 3 : 1.5) * s}
            />
            {o.kind === "stairs" &&
              (() => {
                const steps = Math.max(2, Math.round(Math.max(o.w, o.h) / (0.3 * ppm)));
                return Array.from({ length: steps }, (_, i) => i);
              })().map((i, _, arr) => {
                const vertical = o.h >= o.w;
                const t = (i + 1) / (arr.length + 1);
                return vertical ? (
                  <line key={i} x1={x} y1={y + o.h * t} x2={x + o.w} y2={y + o.h * t} stroke="#64748b" strokeWidth={1 * s} />
                ) : (
                  <line key={i} x1={x + o.w * t} y1={y} x2={x + o.w * t} y2={y + o.h} stroke="#64748b" strokeWidth={1 * s} />
                );
              })}
            {(o.kind === "elevator" || o.kind === "shaft") && (
              <>
                <line x1={x} y1={y} x2={x + o.w} y2={y + o.h} stroke="#64748b" strokeWidth={1 * s} />
                <line x1={x + o.w} y1={y} x2={x} y2={y + o.h} stroke="#64748b" strokeWidth={1 * s} />
              </>
            )}
            {o.kind !== "column" && (
              <text
                x={c.x}
                y={y - 4 * s}
                fontSize={10 * s}
                textAnchor="middle"
                fill="#334155"
                style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 3 * s }}
              >
                {k.label}
              </text>
            )}
          </g>
        );
      })}

      {/* length of the selected wall */}
      {sel?.kind === "wall" &&
        (() => {
          const w = byId.get(sel.id);
          if (!w) return null;
          const { a, b } = p.wallPos(w);
          return (
            <text
              x={(a.x + b.x) / 2}
              y={(a.y + b.y) / 2 - 10 * s}
              fontSize={12 * s}
              fontWeight={700}
              textAnchor="middle"
              fill="#1e3a8a"
              style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 3 * s }}
            >
              {(wallLength({ a, b }) / ppm).toFixed(2)} מ׳
            </text>
          );
        })()}

      {/* endpoint handles of the selected wall */}
      {sel?.kind === "wall" &&
        p.onWallEndDown &&
        (() => {
          const w = byId.get(sel.id);
          if (!w) return null;
          const pos = p.wallPos(w);
          return (["a", "b"] as const).map((end) => (
            <circle
              key={end}
              cx={pos[end].x}
              cy={pos[end].y}
              r={6 * s * hs}
              fill="#3b82f6"
              stroke="#fff"
              strokeWidth={2 * s}
              style={{ cursor: "grab" }}
              onPointerDown={(e) => p.onWallEndDown!(e, w, end)}
            />
          ));
        })()}
    </g>
  );
}
