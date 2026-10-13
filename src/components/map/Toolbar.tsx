"use client";

import { useState } from "react";
import {
  BrickWall,
  Columns3,
  Crosshair,
  DoorOpen,
  Layers,
  Maximize,
  MousePointer2,
  Pentagon,
  Plus,
  Redo2,
  Route,
  Ruler,
  Sparkles,
  Spline,
  Square,
  StickyNote,
  Undo2,
  X,
} from "lucide-react";
import { redo, undo, useHistory } from "@/lib/history";
import { CABLE_TYPES, DEVICE_TYPES, LAYERS, TRAY_TYPES, deviceTypeById, layerById } from "@/lib/catalog";
import { CABLE_PASS, OBSTACLE_KINDS, OPENING_KINDS, WALL_TYPES } from "@/lib/space-catalog";
import type { ObstacleKind, OpeningKind, WallType } from "@/lib/types";
import { cx } from "../ui";
import { useEditor, type Tool } from "./editor-store";

type ToolDef = { id: Tool; label: string; icon: typeof Plus; edit?: boolean };
/** grouped: selection · structure · equipment · measuring */
const TOOL_GROUPS: ToolDef[][] = [
  [{ id: "select", label: "בחירה והזזה", icon: MousePointer2 }],
  [
    { id: "wall", label: "ציור קיר", icon: BrickWall, edit: true },
    { id: "room", label: "חדר מלבני", icon: Square, edit: true },
    { id: "opening", label: "דלת / חלון", icon: DoorOpen, edit: true },
    { id: "obstacle", label: "עמוד / מדרגות / פיר", icon: Columns3, edit: true },
    { id: "area", label: "אזור בצורה חופשית", icon: Pentagon, edit: true },
  ],
  [
    { id: "place", label: "הוספת ציוד", icon: Plus, edit: true },
    { id: "cable", label: "ציור כבל", icon: Spline, edit: true },
    { id: "tray", label: "תעלה / צנרת", icon: Route, edit: true },
    { id: "note", label: "הערה", icon: StickyNote, edit: true },
  ],
  [
    { id: "measure", label: "מדידה", icon: Ruler },
    { id: "calibrate", label: "כיול קנה מידה", icon: Crosshair, edit: true },
  ],
];

export function Toolbar({ canEdit }: { canEdit: boolean }) {
  const { tool, setTool, fit, placeType } = useEditor();
  const [palette, setPalette] = useState(false);

  return (
    <>
      <div className="absolute start-3 top-3 z-20 flex max-h-[calc(100%-24px)] flex-col gap-1 overflow-y-auto rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200">
        {TOOL_GROUPS.map((g) => g.filter((t) => canEdit || !t.edit))
          .filter((g) => g.length)
          .flatMap((g, gi) => [
            ...(gi ? [<div key={`sep${gi}`} className="mx-1 h-px shrink-0 bg-slate-200" />] : []),
            ...g.map((t) => {
          const Icon = t.id === "place" && tool === "place" ? deviceTypeById(placeType).icon : t.icon;
          return (
            <button
              key={t.id}
              title={t.label}
              aria-label={t.label}
              onClick={() => {
                if (t.id === "place") setPalette(true);
                else {
                  setPalette(false);
                  setTool(t.id);
                }
              }}
              className={cx(
                "grid size-10 shrink-0 place-items-center rounded-lg transition",
                tool === t.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              <Icon size={19} />
            </button>
          );
            }),
          ])}
        <div className="mx-1 h-px shrink-0 bg-slate-200" />
        <button title="התאם למסך" aria-label="התאם למסך" onClick={fit} className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100">
          <Maximize size={18} />
        </button>
        {canEdit && <UndoButtons />}
      </div>
      {palette && <DevicePalette onClose={() => setPalette(false)} />}
      <ToolHint />
    </>
  );
}

function UndoButtons() {
  const undoLabel = useHistory((s) => s.undoLabel);
  const redoLabel = useHistory((s) => s.redoLabel);
  const btn = "grid size-10 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <>
      <button
        onClick={undo}
        disabled={!undoLabel}
        title={undoLabel ? `בטל: ${undoLabel} (Ctrl+Z)` : "אין מה לבטל"}
        aria-label="בטל פעולה אחרונה"
        className={btn}
      >
        <Undo2 size={18} />
      </button>
      <button
        onClick={redo}
        disabled={!redoLabel}
        title={redoLabel ? `בצע שוב: ${redoLabel} (Ctrl+Shift+Z)` : "אין מה לשחזר"}
        aria-label="בצע שוב"
        className={btn}
      >
        <Redo2 size={18} />
      </button>
    </>
  );
}

function DevicePalette({ onClose }: { onClose: () => void }) {
  const setPlaceType = useEditor((s) => s.setPlaceType);
  const placeType = useEditor((s) => s.placeType);
  return (
    <div className="absolute start-16 top-3 z-30 max-h-[calc(100%-24px)] w-72 overflow-auto rounded-xl bg-white p-3 shadow-xl ring-1 ring-slate-200">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">בחר ציוד להצבה</span>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="סגור">
          <X size={16} />
        </button>
      </div>
      {LAYERS.map((layer) => {
        const types = DEVICE_TYPES.filter((d) => d.layer === layer.id);
        if (!types.length) return null;
        return (
          <div key={layer.id} className="mb-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <span className="size-2 rounded-full" style={{ background: layer.color }} />
              {layer.label}
            </div>
            <div className="grid grid-cols-3 gap-1">
              {types.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setPlaceType(t.id);
                      onClose();
                    }}
                    className={cx(
                      "flex flex-col items-center gap-1 rounded-lg p-1.5 text-center text-[11px] leading-tight hover:bg-slate-50",
                      placeType === t.id && "bg-blue-50 ring-1 ring-blue-200",
                    )}
                  >
                    <span className="grid size-8 place-items-center rounded-full ring-2" style={{ color: layer.color, ["--tw-ring-color" as string]: layer.color }}>
                      <Icon size={16} />
                    </span>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ToolHint() {
  const { tool, placeType, cableType, setCableType, trayType, setTrayType } = useEditor();
  const { wallType, setWallType, openingKind, setOpeningKind, obstacleKind, setObstacleKind } = useEditor();
  if (tool === "select") return null;
  const hint: Record<Tool, string> = {
    select: "",
    wall: "לחיצה מתחילה קיר, וכל לחיצה נוספת ממשיכה אותו. הקירות נצמדים לזוויות ישרות ולקצוות של קירות אחרים (Shift מבטל הצמדה). לחיצה חוזרת על הנקודה האחרונה מסיימת",
    room: "לחצו על פינה אחת של החדר ואז על הפינה הנגדית. ייווצרו 4 קירות וחדר",
    opening: "לחצו על קיר כדי להוסיף בו פתח",
    obstacle: "לחצו על המפה כדי להציב",
    place: `לחץ על המפה כדי להציב: ${deviceTypeById(placeType).label}`,
    cable: "לחץ על ציוד להתחלה, לחץ על המפה לנקודות ביניים, ולחץ על ציוד היעד לסיום",
    tray: "לחץ לאורך התוואי. לחיצה כפולה או Enter לסיום",
    area: "לחץ על פינות האזור. לחיצה על הנקודה הראשונה לסגירה",
    note: "לחץ על המפה כדי להוסיף הערה",
    measure: "לחץ על שתי נקודות למדידת מרחק",
    calibrate: "לחץ על שתי נקודות שהמרחק ביניהן ידוע (למשל אורך קיר), ואז הזן את המרחק במטרים",
  };
  return (
    <div className="absolute left-1/2 top-3 z-20 flex max-w-[calc(100%-180px)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl bg-slate-900/90 px-3 py-2 text-xs text-white shadow-lg">
      {tool === "cable" && (
        <select
          value={cableType}
          onChange={(e) => setCableType(e.target.value)}
          className="rounded-md bg-white/15 px-1.5 py-1 text-xs text-white outline-none"
        >
          {CABLE_TYPES.map((c) => (
            <option key={c.id} value={c.id} className="text-slate-900">
              {c.label} · {layerById(c.layer).label}
            </option>
          ))}
        </select>
      )}
      {(tool === "wall" || tool === "room") && (
        <select value={wallType} onChange={(e) => setWallType(e.target.value as WallType)} className="rounded-md bg-white/15 px-1.5 py-1 text-xs text-white outline-none">
          {WALL_TYPES.map((w) => (
            <option key={w.id} value={w.id} className="text-slate-900">
              קיר {w.label}
            </option>
          ))}
        </select>
      )}
      {tool === "opening" && (
        <select value={openingKind} onChange={(e) => setOpeningKind(e.target.value as OpeningKind)} className="rounded-md bg-white/15 px-1.5 py-1 text-xs text-white outline-none">
          {OPENING_KINDS.map((o) => (
            <option key={o.id} value={o.id} className="text-slate-900">
              {o.label} ({o.width} מ׳)
            </option>
          ))}
        </select>
      )}
      {tool === "obstacle" && (
        <select value={obstacleKind} onChange={(e) => setObstacleKind(e.target.value as ObstacleKind)} className="rounded-md bg-white/15 px-1.5 py-1 text-xs text-white outline-none">
          {OBSTACLE_KINDS.map((o) => (
            <option key={o.id} value={o.id} className="text-slate-900">
              {o.label}
            </option>
          ))}
        </select>
      )}
      {tool === "tray" && (
        <select
          value={trayType}
          onChange={(e) => setTrayType(e.target.value)}
          className="rounded-md bg-white/15 px-1.5 py-1 text-xs text-white outline-none"
        >
          {TRAY_TYPES.map((c) => (
            <option key={c.id} value={c.id} className="text-slate-900">
              {c.label}
            </option>
          ))}
        </select>
      )}
      <span>{hint[tool]}</span>
      <span className="text-white/50">· Esc לביטול</span>
    </div>
  );
}

export function LayersPanel() {
  const { layers, toggleLayer, showLabels, setShowLabels, showCones, setShowCones } = useEditor();
  const { showStructure, setShowStructure, wallColorBy, setWallColorBy, assistantOpen, setAssistantOpen } = useEditor();
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute end-3 top-3 z-20 flex flex-col items-end">
      <div className="flex gap-2">
        <button
          onClick={() => setAssistantOpen(!assistantOpen)}
          className={cx(
            "flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium shadow-lg ring-1",
            assistantOpen ? "bg-violet-600 text-white ring-violet-600" : "bg-white text-violet-700 ring-violet-200 hover:bg-violet-50",
          )}
        >
          <Sparkles size={16} /> עוזר שטח
        </button>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex h-10 items-center gap-1.5 rounded-xl bg-white px-3 text-sm shadow-lg ring-1 ring-slate-200 hover:bg-slate-50"
        >
          <Layers size={16} /> שכבות
        </button>
      </div>
      {open && (
        <div className="mt-1 w-56 rounded-xl bg-white p-2 shadow-xl ring-1 ring-slate-200">
          {LAYERS.map((l) => (
            <label key={l.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={layers[l.id]} onChange={() => toggleLayer(l.id)} className="accent-slate-900" />
              <span className="size-3 rounded-full" style={{ background: l.color }} />
              {l.label}
            </label>
          ))}
          <div className="my-1 h-px bg-slate-100" />
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
            <input type="checkbox" checked={showStructure} onChange={(e) => setShowStructure(e.target.checked)} className="accent-slate-900" />
            מבנה: קירות, פתחים ועמודים
          </label>
          {showStructure && (
            <div className="mx-2 mb-1 rounded-lg bg-slate-50 p-2">
              <div className="mb-1 text-xs text-slate-500">צבע קירות לפי</div>
              <div className="flex rounded-md bg-white p-0.5 ring-1 ring-slate-200">
                {(
                  [
                    ["type", "סוג קיר"],
                    ["pass", "השחלה"],
                  ] as const
                ).map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setWallColorBy(v)}
                    className={cx("flex-1 rounded px-2 py-1 text-xs", wallColorBy === v ? "bg-slate-900 text-white" : "text-slate-600")}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1">
                {(wallColorBy === "type" ? WALL_TYPES : CABLE_PASS).map((w) => (
                  <span key={w.id} className="flex items-center gap-1 text-[11px] text-slate-600">
                    <span className="h-1.5 w-3 shrink-0 rounded-sm" style={{ background: w.color }} />
                    <span className="truncate">{w.label}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} className="accent-slate-900" />
            הצג שמות
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
            <input type="checkbox" checked={showCones} onChange={(e) => setShowCones(e.target.checked)} className="accent-slate-900" />
            זוויות צילום
          </label>
        </div>
      )}
    </div>
  );
}
