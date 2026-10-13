"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, MapPin, Plus, Trash2, Wand2 } from "lucide-react";
import { useApp, uid } from "@/lib/store";
import { deviceTypeById } from "@/lib/catalog";
import { DEFAULT_PPM } from "@/lib/space-catalog";
import {
  RACK_DEPTHS,
  RACK_DOORS,
  RACK_ITEMS,
  RACK_KINDS,
  firstFreeFromTop,
  fits,
  rackItemDef,
  rackKindForDevice,
  recommendRack,
  usedUnits,
} from "@/lib/rack-catalog";
import type { Device, RackData, RackDoor, RackItem, RackItemKind, RackKind } from "@/lib/types";
import { Button, Field, Input, Select, cx } from "../ui";
import { Section } from "./panel-ui";
import { rackDataOf } from "@/lib/rack-mount";

/** Order in which nearby equipment is mounted, top to bottom. */
const MOUNT_ORDER: RackItemKind[] = ["modem", "router", "firewall", "patch", "switch", "nvr", "server", "ups"];

export function RackSection({ d, ro, onGoto }: { d: Device; ro: boolean; onGoto: (id: string) => void }) {
  const updateDevice = useApp((s) => s.updateDevice);
  const addDevice = useApp((s) => s.addDevice);
  const devices = useApp((s) => s.devices);
  const ppm = useApp((s) => s.floors.find((f) => f.id === d.floorId)?.pxPerMeter) ?? DEFAULT_PPM;
  const [selId, setSelId] = useState<string | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const rack: RackData = rackDataOf(d);
  const { spec, items } = rack;
  const save = (r: RackData) => updateDevice(d.id, { rack: r });
  const setItems = (next: RackItem[]) => {
    setMsg(null);
    save({ spec, items: next });
  };
  const used = usedUnits(items);
  const overflow = items.some((i) => i.u + i.height - 1 > spec.units);
  const rec = recommendRack(items);
  const sel = items.find((i) => i.id === selId);
  const siteDevices = devices.filter((x) => x.siteId === d.siteId && x.id !== d.id);

  const add = (kind: RackItemKind) => {
    const def = rackItemDef(kind);
    const at = slot !== null && fits(items, spec.units, slot, def.height) ? slot : firstFreeFromTop(items, spec.units, def.height);
    if (at === null) {
      setMsg(`אין מקום פנוי בגובה ${def.height}U. הגדילו את הארון או הוציאו ציוד.`);
      return;
    }
    const n = items.filter((i) => i.kind === kind).length + 1;
    const item: RackItem = { id: uid(), kind, label: n > 1 ? `${def.label} ${n}` : def.label, u: at, height: def.height };
    setItems([...items, item]);
    setSelId(item.id);
    setSlot(null);
    setMsg(null);
  };

  // equipment already drawn next to the cabinet on the map and not yet mounted in it
  const linked = new Set(items.map((i) => i.deviceId).filter(Boolean));
  const nearby = siteDevices
    .filter((x) => x.floorId === d.floorId && rackKindForDevice(x.type) && !linked.has(x.id))
    .filter((x) => Math.hypot(x.x - d.x, x.y - d.y) <= 5 * ppm)
    .sort((a, b) => MOUNT_ORDER.indexOf(rackKindForDevice(a.type)!) - MOUNT_ORDER.indexOf(rackKindForDevice(b.type)!));

  const mountNearby = () => {
    let next = [...items];
    const skipped: string[] = [];
    for (const x of nearby) {
      const def = rackItemDef(rackKindForDevice(x.type)!);
      const at = firstFreeFromTop(next, spec.units, def.height);
      if (at === null) {
        skipped.push(x.label);
        continue;
      }
      next = [...next, { id: uid(), kind: def.kind, label: x.label, u: at, height: def.height, deviceId: x.id }];
    }
    setItems(next);
    setMsg(skipped.length ? `לא נכנסו לארון: ${skipped.join(", ")}. הגדילו את הארון.` : null);
  };

  const updateItem = (id: string, patch: Partial<RackItem>) => setItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const moveBy = (it: RackItem, du: number) => {
    const u = it.u + du;
    if (fits(items, spec.units, u, it.height, it.id)) updateItem(it.id, { u });
  };

  const createOnMap = (it: RackItem) => {
    const type = rackItemDef(it.kind).deviceType;
    if (!type) return;
    // place it next to the cabinet, a little below, so it doesn't hide the cabinet's marker
    const n = items.filter((i) => i.deviceId).length;
    const id = addDevice({ siteId: d.siteId, floorId: d.floorId, type, x: d.x + (n % 3) * 0.8 * ppm - 0.8 * ppm, y: d.y + 1.2 * ppm });
    updateDevice(id, { label: it.label });
    updateItem(it.id, { deviceId: id });
  };

  return (
    <Section
      title="מבנה הארון"
      extra={<span className={cx("text-xs font-normal", overflow || used > spec.units ? "text-red-600" : "text-slate-500")}>{used}/{spec.units}U</span>}
    >
      {/* general options */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="סוג">
          <Select
            value={spec.kind}
            disabled={ro}
            onChange={(e) => {
              const kind = e.target.value as RackKind;
              const sizes = RACK_KINDS.find((k) => k.id === kind)!.sizes;
              const units = sizes.includes(spec.units) ? spec.units : sizes.find((n) => n >= spec.units) ?? sizes[sizes.length - 1];
              save({ spec: { ...spec, kind, units }, items });
            }}
          >
            {RACK_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="גובה (U)">
          <Select value={spec.units} disabled={ro} onChange={(e) => save({ spec: { ...spec, units: +e.target.value }, items })}>
            {[...new Set([...RACK_KINDS.find((k) => k.id === spec.kind)!.sizes, spec.units])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n}U
                </option>
              ))}
          </Select>
        </Field>
        <Field label="רוחב">
          <Select value={spec.widthMm} disabled={ro} onChange={(e) => save({ spec: { ...spec, widthMm: +e.target.value }, items })}>
            <option value={600}>600 מ״מ</option>
            <option value={800}>800 מ״מ</option>
          </Select>
        </Field>
        <Field label="עומק">
          <Select value={spec.depthMm} disabled={ro} onChange={(e) => save({ spec: { ...spec, depthMm: +e.target.value }, items })}>
            {RACK_DEPTHS.map((n) => (
              <option key={n} value={n}>
                {n} מ״מ
              </option>
            ))}
          </Select>
        </Field>
        <Field label="דלת" className="col-span-2">
          <Select value={spec.door ?? "glass"} disabled={ro} onChange={(e) => save({ spec: { ...spec, door: e.target.value as RackDoor }, items })}>
            {RACK_DOORS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {(
          [
            ["lock", "מנעול"],
            ["fans", "מאווררים"],
            ["pdu", "פס שקעים"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={!!spec[k]} disabled={ro} onChange={(e) => save({ spec: { ...spec, [k]: e.target.checked }, items })} className="accent-slate-900" />
            {label}
          </label>
        ))}
      </div>

      {/* capacity */}
      <div>
        <div className="mb-1 flex justify-between text-xs text-slate-600">
          <span>
            בשימוש <b>{used}U</b> מתוך {spec.units}U
          </span>
          <span>פנוי {Math.max(0, spec.units - used)}U</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={cx("h-full rounded-full", used > spec.units ? "bg-red-500" : used / spec.units > 0.8 ? "bg-amber-500" : "bg-green-500")}
            style={{ width: `${Math.min(100, (used / spec.units) * 100)}%` }}
          />
        </div>
        {items.length > 0 && (rec.units !== spec.units || rec.kind !== spec.kind) && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs text-blue-900">
            <span>
              מומלץ: {RACK_KINDS.find((k) => k.id === rec.kind)!.label} {rec.units}U (כולל כ-30% רזרבה)
            </span>
            {!ro && (
              <button onClick={() => save({ spec: { ...spec, kind: rec.kind, units: rec.units }, items })} className="shrink-0 font-semibold hover:underline">
                החל
              </button>
            )}
          </div>
        )}
        {overflow && <p className="mt-1 text-xs text-red-600">יש ציוד מעבר לגובה הארון. הגדילו את הארון או הזיזו את הציוד.</p>}
      </div>

      {/* front view */}
      <RackElevation
        units={spec.units}
        items={items}
        selId={selId}
        slot={slot}
        ro={ro}
        devices={siteDevices}
        onSelect={(id) => {
          setSelId(id);
          setSlot(null);
          setMsg(null);
        }}
        onSlot={(u) => {
          setSlot(u);
          setSelId(null);
        }}
        onMove={(id, u) => updateItem(id, { u })}
      />

      {!ro && (
        <div>
          <div className="mb-1 text-xs font-medium text-slate-500">
            {slot !== null ? `הוסף בחריץ U${slot}:` : "הוסף לארון (נכנס לחריץ הפנוי העליון):"}
          </div>
          <div className="flex flex-wrap gap-1">
            {RACK_ITEMS.map((r) => (
              <button
                key={r.kind}
                onClick={() => add(r.kind)}
                className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs ring-1 ring-slate-200 hover:bg-slate-50"
              >
                <span className="size-2.5 rounded-sm" style={{ background: r.color }} />
                {r.label}
                <span className="text-slate-400">{r.height}U</span>
              </button>
            ))}
          </div>
          {nearby.length > 0 && (
            <Button size="sm" className="mt-2" onClick={mountNearby}>
              <Wand2 size={14} /> הכנס לארון את הציוד שלידו במפה ({nearby.length})
            </Button>
          )}
          {msg && <p className="mt-2 text-xs text-amber-700">{msg}</p>}
        </div>
      )}

      {/* selected item */}
      {sel && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {rackItemDef(sel.kind).label} · U{sel.u}
              {sel.height > 1 ? `–U${sel.u + sel.height - 1}` : ""}
            </span>
            {!ro && (
              <span className="flex gap-1">
                <button title="למעלה" onClick={() => moveBy(sel, 1)} className="rounded p-1 hover:bg-slate-200">
                  <ArrowUp size={14} />
                </button>
                <button title="למטה" onClick={() => moveBy(sel, -1)} className="rounded p-1 hover:bg-slate-200">
                  <ArrowDown size={14} />
                </button>
                <button
                  title="הוצא מהארון"
                  onClick={() => {
                    setItems(items.filter((i) => i.id !== sel.id));
                    setSelId(null);
                  }}
                  className="rounded p-1 text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} />
                </button>
              </span>
            )}
          </div>
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <Field label="שם">
              <Input value={sel.label} readOnly={ro} onChange={(e) => updateItem(sel.id, { label: e.target.value })} />
            </Field>
            <Field label="גובה">
              <Select
                value={sel.height}
                disabled={ro}
                onChange={(e) => {
                  const h = +e.target.value;
                  if (fits(items, spec.units, sel.u, h, sel.id)) updateItem(sel.id, { height: h });
                  else setMsg(`אין מקום ל-${h}U בחריץ הזה. הזיזו את הפריט קודם.`);
                }}
              >
                {[1, 2, 3, 4, 5, 6].map((h) => (
                  <option key={h} value={h}>
                    {h}U
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="ציוד במפה">
            <div className="flex gap-1">
              <Select value={sel.deviceId ?? ""} disabled={ro} onChange={(e) => updateItem(sel.id, { deviceId: e.target.value || undefined })}>
                <option value="">לא מקושר</option>
                {siteDevices
                  .filter((x) => !rackItemDef(sel.kind).deviceType || x.type === rackItemDef(sel.kind).deviceType || x.id === sel.deviceId)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label} ({deviceTypeById(x.type).label})
                    </option>
                  ))}
              </Select>
              {sel.deviceId && (
                <button title="עבור לציוד במפה" onClick={() => onGoto(sel.deviceId!)} className="grid w-9 shrink-0 place-items-center rounded-lg ring-1 ring-slate-200 hover:bg-white">
                  <MapPin size={14} />
                </button>
              )}
            </div>
          </Field>
          {!ro && !sel.deviceId && rackItemDef(sel.kind).deviceType && (
            <Button size="sm" onClick={() => createOnMap(sel)}>
              <Plus size={14} /> צור גם כציוד במפה
            </Button>
          )}
        </div>
      )}
    </Section>
  );
}

/** Front view of the cabinet: numbered rack units, mounted equipment, drag to move. */
function RackElevation({
  units,
  items,
  selId,
  slot,
  ro,
  devices,
  onSelect,
  onSlot,
  onMove,
}: {
  units: number;
  items: RackItem[];
  selId: string | null;
  slot: number | null;
  ro: boolean;
  devices: Device[];
  onSelect: (id: string) => void;
  onSlot: (u: number) => void;
  onMove: (id: string, u: number) => void;
}) {
  const uh = units > 24 ? 14 : 18;
  const top = 10;
  const W = 300;
  const rail = 26;
  const H = top * 2 + units * uh;
  const yOf = (u: number) => top + (units - u) * uh; // top edge of unit u
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; startY: number; startU: number; u: number } | null>(null);
  const highest = Math.max(units, ...items.map((i) => i.u + i.height - 1));
  const free = (u: number) => !items.some((i) => u >= i.u && u < i.u + i.height);

  const localY = (e: React.PointerEvent) => e.clientY - svgRef.current!.getBoundingClientRect().top;

  return (
    <div className="flex justify-center">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${top * 2 + highest * uh}`}
        width={W}
        className="max-w-full touch-none select-none"
        onPointerMove={(e) => {
          if (!drag) return;
          const it = items.find((i) => i.id === drag.id)!;
          const scale = (top * 2 + highest * uh) / svgRef.current!.getBoundingClientRect().height;
          const du = -Math.round(((localY(e) - drag.startY) * scale) / uh);
          const u = Math.max(1, Math.min(units - it.height + 1, drag.startU + du));
          setDrag({ ...drag, u });
        }}
        onPointerUp={() => {
          if (!drag) return;
          const it = items.find((i) => i.id === drag.id)!;
          if (drag.u !== drag.startU && fits(items, units, drag.u, it.height, it.id)) onMove(it.id, drag.u);
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
      >
        {/* cabinet body and rails */}
        <rect x={0} y={0} width={W} height={H} rx={8} fill="#1e293b" />
        <rect x={rail} y={top} width={W - rail * 2} height={units * uh} fill="#0f172a" />
        {Array.from({ length: units }, (_, i) => units - i).map((u) => (
          <g key={u}>
            <text x={rail / 2} y={yOf(u) + uh / 2 + 3.5} fontSize={9} fill="#94a3b8" textAnchor="middle">
              {u}
            </text>
            <text x={W - rail / 2} y={yOf(u) + uh / 2 + 3.5} fontSize={9} fill="#94a3b8" textAnchor="middle">
              {u}
            </text>
            {free(u) && (
              <rect
                x={rail + 2}
                y={yOf(u) + 1}
                width={W - rail * 2 - 4}
                height={uh - 2}
                rx={2}
                fill={slot === u ? "#1d4ed8" : "transparent"}
                fillOpacity={slot === u ? 0.5 : 1}
                stroke="#334155"
                strokeDasharray="3 3"
                style={{ cursor: ro ? "default" : "pointer" }}
                onClick={() => !ro && onSlot(u)}
              />
            )}
          </g>
        ))}

        {/* mounted equipment */}
        {items.map((it) => {
          const u = drag?.id === it.id ? drag.u : it.u;
          const def = rackItemDef(it.kind);
          const y = yOf(u + it.height - 1) + 1;
          const h = it.height * uh - 2;
          const selected = it.id === selId;
          const out = it.u + it.height - 1 > units;
          const dev = it.deviceId && devices.find((x) => x.id === it.deviceId);
          const blocked = drag?.id === it.id && !fits(items, units, drag.u, it.height, it.id);
          return (
            <g
              key={it.id}
              style={{ cursor: ro ? "pointer" : "grab" }}
              onPointerDown={(e) => {
                onSelect(it.id);
                if (ro) return;
                try {
                  svgRef.current?.setPointerCapture(e.pointerId);
                } catch {
                  // pointer already released — the drag still works without capture
                }
                setDrag({ id: it.id, startY: localY(e), startU: it.u, u: it.u });
              }}
            >
              <rect
                x={rail + 2}
                y={y}
                width={W - rail * 2 - 4}
                height={h}
                rx={3}
                fill={def.color}
                stroke={blocked || out ? "#ef4444" : selected ? "#facc15" : "#0f172a"}
                strokeWidth={selected || blocked || out ? 2.5 : 1}
                opacity={drag?.id === it.id ? 0.85 : 1}
              />
              <text x={W / 2} y={y + h / 2 + 4} fontSize={11} fontWeight={600} fill="#fff" textAnchor="middle" direction="rtl">
                {it.label.length > 30 ? it.label.slice(0, 29) + "…" : it.label}
                {dev ? " 🔗" : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
