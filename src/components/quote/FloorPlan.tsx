import { deviceTypeById, layerById } from "@/lib/catalog";
import type { PublicFloor } from "@/lib/public-plan";
import type { LayerId } from "@/lib/types";
import { PlanViewer } from "./PlanViewer";

const PAPER = "#f8fafc";

/**
 * A floor for the customer: the plan picture (or what was drawn of the space, on a faint 1 m grid),
 * rooms by name, walls with their doors and windows, each camera's view fading with distance, the
 * cables, and the planned equipment numbered as in the list, with a scale and a legend.
 */
export function FloorPlan({ floor: f, many }: { floor: PublicFloor; many: boolean }) {
  const { box, s, ppm } = f;
  const id = `f${f.id.replace(/[^A-Za-z0-9]/g, "")}`;
  const paper = f.plan ? "#fff" : PAPER;
  const cams = f.devices.filter((d) => d.camera);
  const scale = scaleBar(box.w, ppm);
  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 break-inside-avoid">
      {many && <h2 className="border-b border-slate-100 px-4 py-2.5 font-semibold">{f.name}</h2>}
      <PlanViewer ratio={box.w / box.h}>
        <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} preserveAspectRatio="xMidYMid meet" className="block h-full w-full" role="img" aria-label={`תכנית ${f.name}`}>
          <defs>
            <pattern id={`${id}-grid`} width={ppm} height={ppm} patternUnits="userSpaceOnUse">
              <path d={`M ${ppm} 0 L 0 0 0 ${ppm}`} fill="none" stroke="#e2e8f0" strokeWidth={ppm / 45} />
            </pattern>
            <filter id={`${id}-lift`} x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy={s * 0.05} stdDeviation={s * 0.07} floodColor="#0f172a" floodOpacity="0.28" />
            </filter>
            {cams.map((d, i) => (
              // what a camera sees, fading as it gets farther
              <radialGradient key={i} id={`${id}-cone${i}`} gradientUnits="userSpaceOnUse" cx={d.x} cy={d.y} r={d.camera!.range * ppm}>
                <stop offset="0" stopColor="#ef4444" stopOpacity="1" />
                <stop offset="0.6" stopColor="#ef4444" stopOpacity="0.55" />
                <stop offset="1" stopColor="#ef4444" stopOpacity="0" />
              </radialGradient>
            ))}
          </defs>

          <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={paper} />
          {f.plan ? (
            <image href={f.plan.url} x={0} y={0} width={f.plan.width} height={f.plan.height} preserveAspectRatio="none" />
          ) : (
            <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={`url(#${id}-grid)`} />
          )}

          {/* rooms */}
          {f.areas.map((a, i) => (
            <polygon key={i} points={pts(a.points)} fill={a.color} fillOpacity={0.09} stroke={a.color} strokeOpacity={0.4} strokeWidth={s / 16} strokeLinejoin="round" />
          ))}

          {/* what the cameras see, under the walls: one light layer, so where views overlap it doesn't get darker */}
          <g opacity={0.2}>
            {cams.map((d, i) => (
              <path key={i} d={cone(d.x, d.y, d.camera!.dir, d.camera!.fov, d.camera!.range * ppm)} fill={`url(#${id}-cone${i})`} />
            ))}
          </g>
          {cams.map((d, i) =>
            d.camera!.fov < 359 ? (
              <path
                key={i}
                d={edges(d.x, d.y, d.camera!.dir, d.camera!.fov, Math.min(d.camera!.range * ppm, s * 3))}
                fill="none"
                stroke="#ef4444"
                strokeOpacity={0.45}
                strokeWidth={s / 26}
                strokeLinecap="round"
              />
            ) : null,
          )}

          {/* walls, and their doors and windows */}
          {f.walls.map((w, i) => (
            <line key={i} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke={w.color} strokeWidth={w.width} strokeLinecap="round" />
          ))}
          {f.openings.map((o, i) => (
            <Opening key={i} o={o} s={s} paper={paper} />
          ))}
          {f.obstacles.map((o, i) => (
            <Obstacle key={i} o={o} s={s} />
          ))}

          {/* cables */}
          {f.cables.map((c, i) => (
            <polyline
              key={i}
              points={pts(c.points)}
              fill="none"
              stroke="#64748b"
              strokeOpacity={0.55}
              strokeWidth={s / 15}
              strokeDasharray={`${s / 4} ${s / 7}`}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* room names, over everything but the equipment */}
          {f.areas.map((a, i) =>
            a.name && a.size ? (
              <text
                key={i}
                x={a.label.x}
                y={a.label.y}
                fontSize={a.size}
                fontWeight={600}
                fill="#475569"
                textAnchor="middle"
                dominantBaseline="central"
                paintOrder="stroke"
                stroke={paper}
                strokeWidth={a.size * 0.3}
                strokeLinejoin="round"
              >
                {a.name}
              </text>
            ) : null,
          )}

          {/* equipment moved off a neighbor: a thin line back to where it really is */}
          {f.devices.map((d, i) =>
            Math.hypot(d.mx - d.x, d.my - d.y) > s * 0.15 ? (
              <g key={`lead${i}`}>
                <line x1={d.x} y1={d.y} x2={d.mx} y2={d.my} stroke="#334155" strokeOpacity={0.6} strokeWidth={s / 24} />
                <circle cx={d.x} cy={d.y} r={s / 9} fill={colorOf(d.type)} stroke="#fff" strokeWidth={s / 30} />
              </g>
            ) : null,
          )}

          {/* the equipment: its list number on its color, or its icon */}
          {f.devices.map((d, i) => {
            const def = deviceTypeById(d.type);
            const Icon = def.icon;
            const color = colorOf(d.type);
            return (
              <g key={i} filter={`url(#${id}-lift)`}>
                <circle cx={d.mx} cy={d.my} r={s / 2} fill={color} stroke="#fff" strokeWidth={s / 11} />
                {d.n !== undefined ? (
                  <text x={d.mx} y={d.my} fontSize={s * 0.5} fontWeight={800} fill="#fff" textAnchor="middle" dominantBaseline="central">
                    {d.n}
                  </text>
                ) : (
                  <Icon x={d.mx - s / 4} y={d.my - s / 4} width={s / 2} height={s / 2} color="#fff" strokeWidth={2.4} />
                )}
              </g>
            );
          })}

          {/* scale */}
          {scale && (
            <g>
              <rect
                x={box.x + s * 0.4}
                y={box.y + box.h - s * 1.25}
                width={scale.m * ppm + s * 0.6}
                height={s * 0.9}
                rx={s * 0.15}
                fill="#fff"
                fillOpacity={0.85}
              />
              <path
                d={`M ${box.x + s * 0.7} ${box.y + box.h - s * 0.62} v ${s * 0.18} h ${scale.m * ppm} v ${-s * 0.18}`}
                fill="none"
                stroke="#334155"
                strokeWidth={s / 18}
              />
              <text x={box.x + s * 0.7 + (scale.m * ppm) / 2} y={box.y + box.h - s * 0.85} fontSize={s * 0.32} fill="#334155" textAnchor="middle" dominantBaseline="central">
                {scale.m} מ׳
              </text>
            </g>
          )}
        </svg>
      </PlanViewer>
      <Legend f={f} />
    </section>
  );
}

const colorOf = (type: string) => layerById(deviceTypeById(type).layer).color;
const pts = (points: { x: number; y: number }[]) => points.map((p) => `${p.x},${p.y}`).join(" ");

/** A scale bar about a fifth of the drawing wide, in round meters. */
function scaleBar(width: number, ppm: number) {
  const m = [1, 2, 5, 10, 20, 50, 100].filter((x) => x * ppm <= width / 5).pop();
  return m ? { m } : null;
}

/** A door: a gap in the wall, its leaf and its swing; a window: two thin lines across the gap. */
function Opening({ o, s, paper }: { o: PublicFloor["openings"][number]; s: number; paper: string }) {
  const len = Math.hypot(o.p2.x - o.p1.x, o.p2.y - o.p1.y);
  // across the wall
  const nx = -o.uy;
  const ny = o.ux;
  const gap = <line x1={o.p1.x} y1={o.p1.y} x2={o.p2.x} y2={o.p2.y} stroke={paper} strokeWidth={o.gap} />;
  if (o.kind === "window" || o.kind === "vitrine") {
    const d = o.gap / 4;
    return (
      <g>
        {gap}
        {[-d, d].map((k) => (
          <line key={k} x1={o.p1.x + nx * k} y1={o.p1.y + ny * k} x2={o.p2.x + nx * k} y2={o.p2.y + ny * k} stroke="#38bdf8" strokeWidth={s / 22} />
        ))}
      </g>
    );
  }
  if (o.kind === "door" || o.kind === "gate") {
    const leaf = { x: o.p1.x + nx * len, y: o.p1.y + ny * len };
    return (
      <g>
        {gap}
        <line x1={o.p1.x} y1={o.p1.y} x2={leaf.x} y2={leaf.y} stroke="#64748b" strokeWidth={s / 18} strokeLinecap="round" />
        <path d={`M ${o.p2.x} ${o.p2.y} A ${len} ${len} 0 0 1 ${leaf.x} ${leaf.y}`} fill="none" stroke="#94a3b8" strokeWidth={s / 28} strokeDasharray={`${s / 8} ${s / 10}`} />
      </g>
    );
  }
  return gap;
}

/** Columns dark, stairs as steps, elevators and shafts crossed. */
function Obstacle({ o, s }: { o: PublicFloor["obstacles"][number]; s: number }) {
  const x = o.x - o.w / 2;
  const y = o.y - o.h / 2;
  if (o.kind === "column") return <rect x={x} y={y} width={o.w} height={o.h} fill="#475569" />;
  if (o.kind === "stairs") {
    const steps = Math.max(3, Math.round(Math.max(o.w, o.h) / (s / 2)));
    const along = o.w >= o.h;
    return (
      <g>
        <rect x={x} y={y} width={o.w} height={o.h} fill="#f1f5f9" stroke="#94a3b8" strokeWidth={s / 30} />
        {Array.from({ length: steps - 1 }, (_, i) =>
          along ? (
            <line key={i} x1={x + ((i + 1) * o.w) / steps} y1={y} x2={x + ((i + 1) * o.w) / steps} y2={y + o.h} stroke="#cbd5e1" strokeWidth={s / 40} />
          ) : (
            <line key={i} x1={x} y1={y + ((i + 1) * o.h) / steps} x2={x + o.w} y2={y + ((i + 1) * o.h) / steps} stroke="#cbd5e1" strokeWidth={s / 40} />
          ),
        )}
      </g>
    );
  }
  return (
    <g>
      <rect x={x} y={y} width={o.w} height={o.h} fill="#f1f5f9" stroke="#94a3b8" strokeWidth={s / 30} />
      <path d={`M ${x} ${y} L ${x + o.w} ${y + o.h} M ${x + o.w} ${y} L ${x} ${y + o.h}`} stroke="#cbd5e1" strokeWidth={s / 40} />
    </g>
  );
}

/** What the colors and marks on the plan mean, with how many of each. */
function Legend({ f }: { f: PublicFloor }) {
  const byLayer = new Map<LayerId, number>();
  for (const d of f.devices) {
    const layer = deviceTypeById(d.type).layer;
    byLayer.set(layer, (byLayer.get(layer) ?? 0) + 1);
  }
  if (!byLayer.size) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-600">
      {[...byLayer].map(([layer, n]) => {
        const def = layerById(layer);
        return (
          <span key={layer} className="flex items-center gap-1.5">
            <span className="size-3 rounded-full ring-2 ring-white" style={{ background: def.color, boxShadow: "0 0 0 1px #cbd5e1" }} />
            {def.label} ({n})
          </span>
        );
      })}
      {f.devices.some((d) => d.camera) && (
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm" style={{ background: "linear-gradient(to left, rgba(239,68,68,0.05), rgba(239,68,68,0.35))" }} />
          מה שהמצלמה רואה
        </span>
      )}
      {f.cables.length > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="w-5 border-t-2 border-dashed border-slate-400" />
          כבלים
        </span>
      )}
      <span className="text-slate-400">המספרים תואמים לרשימת הציוד</span>
    </div>
  );
}

/** A camera's view: a slice of a circle from the camera, `dir` degrees from the right, clockwise. */
function cone(x: number, y: number, dir: number, fov: number, r: number) {
  if (fov >= 359) return `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
  const rad = (a: number) => (a * Math.PI) / 180;
  const a0 = rad(dir - fov / 2);
  const a1 = rad(dir + fov / 2);
  return `M ${x} ${y} L ${x + r * Math.cos(a0)} ${y + r * Math.sin(a0)} A ${r} ${r} 0 ${fov > 180 ? 1 : 0} 1 ${x + r * Math.cos(a1)} ${y + r * Math.sin(a1)} Z`;
}

/** The two sides of a camera's view, a short way out. */
function edges(x: number, y: number, dir: number, fov: number, r: number) {
  const rad = (a: number) => (a * Math.PI) / 180;
  const a0 = rad(dir - fov / 2);
  const a1 = rad(dir + fov / 2);
  return `M ${x + r * Math.cos(a0)} ${y + r * Math.sin(a0)} L ${x} ${y} L ${x + r * Math.cos(a1)} ${y + r * Math.sin(a1)}`;
}
