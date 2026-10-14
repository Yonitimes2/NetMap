"use client";

import { useEffect, useRef, useState } from "react";
import {
  BrickWall,
  Ellipsis,
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
import { CABLE_RUNS, CABLE_TYPES, DEVICE_TYPES, LAYERS, TRAY_TYPES, deviceTypeById, layerById } from "@/lib/catalog";
import { CABLE_PASS, OBSTACLE_KINDS, OPENING_KINDS, WALL_TYPES } from "@/lib/space-catalog";
import type { CableRun, ObstacleKind, OpeningKind, WallType } from "@/lib/types";
import { Modal, cx } from "../ui";
import { useEditor, type Tool } from "./editor-store";
import { useIsPhone } from "@/lib/use-media";

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
  const phone = useIsPhone();
  return phone ? <PhoneToolbar canEdit={canEdit} /> : <DesktopToolbar canEdit={canEdit} />;
}

function DesktopToolbar({ canEdit }: { canEdit: boolean }) {
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
  return (
    <div className="absolute start-16 top-3 z-30 max-h-[calc(100%-24px)] w-72 overflow-auto rounded-xl bg-white p-3 shadow-xl ring-1 ring-slate-200">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">בחר ציוד להצבה</span>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="סגור">
          <X size={16} />
        </button>
      </div>
      <DeviceGrid onPick={onClose} />
    </div>
  );
}

/** Equipment types by layer; picking one switches to the "place" tool. */
function DeviceGrid({ onPick, cols = 3 }: { onPick: () => void; cols?: number }) {
  const setPlaceType = useEditor((s) => s.setPlaceType);
  const placeType = useEditor((s) => s.placeType);
  return (
    <>
      {LAYERS.map((layer) => {
        const types = DEVICE_TYPES.filter((d) => d.layer === layer.id);
        if (!types.length) return null;
        return (
          <div key={layer.id} className="mb-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <span className="size-2 rounded-full" style={{ background: layer.color }} />
              {layer.label}
            </div>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {types.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setPlaceType(t.id);
                      onPick();
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
    </>
  );
}

// ---------- phones: a tool bar along the bottom edge, within thumb reach ----------

const STRUCTURE_TOOLS = TOOL_GROUPS[1];
const MORE_TOOLS: Tool[] = ["tray", "note", "measure", "calibrate"];
const toolDef = (id: Tool) => TOOL_GROUPS.flat().find((t) => t.id === id)!;

function PhoneToolbar({ canEdit }: { canEdit: boolean }) {
  const { tool, setTool, fit, placeType } = useEditor();
  const undoLabel = useHistory((s) => s.undoLabel);
  const redoLabel = useHistory((s) => s.redoLabel);
  const [sheet, setSheet] = useState<null | "place" | "structure" | "more" | "layers">(null);
  const ref = useRef<HTMLDivElement>(null);

  // the map keeps its content clear of the bar
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => useEditor.setState({ barH: el.offsetHeight }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      useEditor.setState({ barH: 0 });
    };
  }, []);

  const structure = STRUCTURE_TOOLS.find((t) => t.id === tool);
  const more = MORE_TOOLS.includes(tool) ? toolDef(tool) : undefined;
  const PlaceIcon = tool === "place" ? deviceTypeById(placeType).icon : Plus;
  const pick = (t: Tool) => {
    setTool(t);
    setSheet(null);
  };

  return (
    <>
      <div ref={ref} className="pb-safe shrink-0 border-t border-slate-200 bg-white">
        <PhoneToolStrip />
        <div className="flex h-[60px] items-stretch justify-around px-1">
          <BarButton icon={MousePointer2} label="בחירה" active={tool === "select"} onClick={() => setTool("select")} />
          {canEdit ? (
            <>
              <BarButton icon={PlaceIcon} label={tool === "place" ? deviceTypeById(placeType).label : "ציוד"} active={tool === "place"} onClick={() => setSheet("place")} />
              <BarButton icon={Spline} label="כבל" active={tool === "cable"} onClick={() => setTool("cable")} />
              <BarButton icon={structure?.icon ?? BrickWall} label={structure ? structure.label.split(" ")[0] : "מבנה"} active={!!structure} onClick={() => setSheet("structure")} />
              <BarButton icon={more?.icon ?? Ellipsis} label={more ? more.label.split(" ")[0] : "עוד"} active={!!more} onClick={() => setSheet("more")} />
              <BarButton icon={Undo2} label="בטל" disabled={!undoLabel} onClick={undo} />
            </>
          ) : (
            <>
              <BarButton icon={Ruler} label="מדידה" active={tool === "measure"} onClick={() => setTool("measure")} />
              <BarButton icon={Maximize} label="כל המפה" onClick={fit} />
              <BarButton icon={Layers} label="שכבות" onClick={() => setSheet("layers")} />
            </>
          )}
        </div>
      </div>
      {sheet === "layers" && (
        <Modal title="שכבות ותצוגה" onClose={() => setSheet(null)}>
          {/* taller rows for fingers */}
          <div className="[&_label]:min-h-11">
            <LayersOptions />
          </div>
        </Modal>
      )}

      {sheet === "place" && (
        <Modal title="איזה ציוד להציב?" onClose={() => setSheet(null)}>
          <p className="text-xs text-slate-500">בחרו סוג, ואז הקישו על המפה במקום שבו הוא מותקן.</p>
          <DeviceGrid cols={4} onPick={() => setSheet(null)} />
        </Modal>
      )}
      {sheet === "structure" && (
        <Modal title="ציור המבנה" onClose={() => setSheet(null)}>
          <div className="grid gap-1">
            {STRUCTURE_TOOLS.map((t) => (
              <SheetRow key={t.id} icon={t.icon} label={t.label} hint={SHORT_HINT[t.id]} active={tool === t.id} onClick={() => pick(t.id)} />
            ))}
          </div>
        </Modal>
      )}
      {sheet === "more" && (
        <Modal title="עוד כלים" onClose={() => setSheet(null)}>
          <div className="grid gap-1">
            {MORE_TOOLS.map((id) => toolDef(id))
              .filter((t) => canEdit || !t.edit)
              .map((t) => (
                <SheetRow key={t.id} icon={t.icon} label={t.label} hint={SHORT_HINT[t.id]} active={tool === t.id} onClick={() => pick(t.id)} />
              ))}
            <div className="my-1 h-px bg-slate-100" />
            <SheetRow
              icon={Layers}
              label="שכבות ותצוגה"
              hint="מה להציג במפה: מצלמות, רשת, קירות, שמות…"
              onClick={() => setSheet("layers")}
            />
            <SheetRow
              icon={Maximize}
              label="הצג את כל המפה"
              onClick={() => {
                fit();
                setSheet(null);
              }}
            />
            {canEdit && (
              <SheetRow
                icon={Redo2}
                label="בצע שוב"
                hint={redoLabel ?? "אין מה לשחזר"}
                disabled={!redoLabel}
                onClick={() => {
                  redo();
                  setSheet(null);
                }}
              />
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * Phones: above the tool buttons, what the current tool does, its options, and "סיום / ביטול"
 * for a line being drawn. Part of the bar, so it never covers the map.
 */
function PhoneToolStrip() {
  const { tool, setTool, drawingN, pickMode, setPickMode, regionStarted, requestFinish, requestCancel } = useEditor();
  if (pickMode) {
    return (
      <div className="flex items-center gap-2 bg-violet-700 px-3 py-2 text-xs text-white">
        <span className="min-w-0 flex-1">
          {pickMode === "object" ? "הקישו על פריט במפה כדי לסמן אותו לעוזר" : regionStarted ? "עכשיו הקישו על הפינה הנגדית" : "הקישו על פינה אחת של האזור"}
        </span>
        <button onClick={() => setPickMode(null)} className="rounded-md bg-white/20 px-3 py-1.5 font-medium">
          סיום
        </button>
      </div>
    );
  }
  if (tool === "select") return null;
  const minPoints = tool === "area" ? 3 : 2;
  return (
    <div className="space-y-2 bg-slate-900 px-3 py-2 text-xs text-white">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">{SHORT_HINT[tool] ?? TOOL_HINT[tool]}</span>
        {drawingN > 0 ? (
          <>
            {drawingN >= minPoints && (
              <button onClick={requestFinish} className="rounded-md bg-blue-500 px-3 py-1.5 font-semibold">
                סיום
              </button>
            )}
            <button onClick={requestCancel} className="rounded-md bg-white/20 px-3 py-1.5 font-medium">
              ביטול
            </button>
          </>
        ) : (
          <button onClick={() => setTool("select")} className="rounded-md bg-white/20 px-3 py-1.5 font-medium" aria-label="יציאה מהכלי">
            סגור
          </button>
        )}
      </div>
      {["cable", "tray", "wall", "room", "opening", "obstacle"].includes(tool) && (
        <div className="flex flex-wrap gap-2 [&_select]:h-9 [&_select]:min-w-0 [&_select]:flex-1">
          <ToolOptions />
        </div>
      )}
    </div>
  );
}

function BarButton({ icon: Icon, label, active, disabled, onClick }: { icon: typeof Plus; label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cx("flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] disabled:opacity-30", active ? "text-slate-900" : "text-slate-500")}
    >
      <span className={cx("grid h-8 w-12 place-items-center rounded-full transition", active && "bg-slate-900 text-white")}>
        <Icon size={20} />
      </span>
      <span className={cx("max-w-full truncate px-0.5", active && "font-semibold")}>{label}</span>
    </button>
  );
}

function SheetRow({ icon: Icon, label, hint, active, disabled, onClick }: { icon: typeof Plus; label: string; hint?: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx("flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-start disabled:opacity-40", active ? "bg-slate-900 text-white" : "hover:bg-slate-50")}
    >
      <Icon size={20} className="shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className={cx("block text-xs", active ? "text-white/70" : "text-slate-500")}>{hint}</span>}
      </span>
    </button>
  );
}

/** One-line explanations for the phone tool sheets and hint strip. */
const SHORT_HINT: Partial<Record<Tool, string>> = {
  wall: "הקישו נקודה אחרי נקודה; ״סיום״ כשמסיימים",
  room: "הקישו על פינה ואז על הפינה הנגדית",
  opening: "הקישו על קיר כדי להוסיף בו דלת או חלון",
  obstacle: "הקישו על המפה כדי להציב",
  area: "הקישו על הפינות; הקשה על הראשונה סוגרת",
  place: "הקישו על המפה במקום ההתקנה",
  cable: "הקישו על ציוד, על נקודות בדרך, ועל הציוד ביעד",
  tray: "הקישו לאורך התוואי; ״סיום״ כשמסיימים",
  note: "הקישו על המפה כדי להוסיף הערה",
  measure: "הקישו על שתי נקודות",
  calibrate: "הקישו על שתי נקודות שהמרחק ביניהן ידוע",
};

function ToolHint() {
  const tool = useEditor((s) => s.tool);
  const placeType = useEditor((s) => s.placeType);
  if (tool === "select") return null;
  return (
    <div className="absolute left-1/2 top-3 z-20 flex max-w-[calc(100%-180px)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl bg-slate-900/90 px-3 py-2 text-xs text-white shadow-lg">
      <ToolOptions />
      <span>{tool === "place" ? `לחץ על המפה כדי להציב: ${deviceTypeById(placeType).label}` : TOOL_HINT[tool]}</span>
      <span className="text-white/50">· Esc לביטול</span>
    </div>
  );
}

const TOOL_HINT: Record<Tool, string> = {
  select: "",
  wall: "לחיצה מתחילה קיר, וכל לחיצה נוספת ממשיכה אותו. הקירות נצמדים לזוויות ישרות ולקצוות של קירות אחרים (Shift מבטל הצמדה). לחיצה חוזרת על הנקודה האחרונה מסיימת",
  room: "לחצו על פינה אחת של החדר ואז על הפינה הנגדית. ייווצרו 4 קירות וחדר",
  opening: "לחצו על קיר כדי להוסיף בו פתח",
  obstacle: "לחצו על המפה כדי להציב",
  place: "לחץ על המפה כדי להציב את הציוד",
  cable: "לחצו על ציוד להתחלה, על המפה לנקודות ביניים, ועל הציוד ביעד לסיום. כדי לפצל מכבל קיים, התחילו בלחיצה עליו",
  tray: "לחץ לאורך התוואי. לחיצה כפולה או Enter לסיום",
  area: "לחץ על פינות האזור. לחיצה על הנקודה הראשונה לסגירה",
  note: "לחץ על המפה כדי להוסיף הערה",
  measure: "לחץ על שתי נקודות למדידת מרחק",
  calibrate: "לחץ על שתי נקודות שהמרחק ביניהן ידוע (למשל אורך קיר), ואז הזן את המרחק במטרים",
};

/** Choices for the current tool: cable type and run, wall type, door / window kind… */
function ToolOptions() {
  const { tool, cableType, setCableType, trayType, setTrayType } = useEditor();
  const { wallType, setWallType, openingKind, setOpeningKind, obstacleKind, setObstacleKind } = useEditor();
  const { cableRun, setCableRun } = useEditor();
  return (
    <>
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
      {tool === "cable" && (
        <select
          value={cableRun ?? ""}
          onChange={(e) => setCableRun((e.target.value || undefined) as CableRun | undefined)}
          className="rounded-md bg-white/15 px-1.5 py-1 text-xs text-white outline-none"
        >
          <option value="" className="text-slate-900">
            תוואי: לא צוין
          </option>
          {CABLE_RUNS.map((r) => (
            <option key={r.id} value={r.id} className="text-slate-900">
              {r.label}
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
    </>
  );
}

export function LayersPanel() {
  const { assistantOpen, setAssistantOpen } = useEditor();
  const [open, setOpen] = useState(false);
  // phones: the assistant is in the strip above the map and the layers are under "עוד"
  if (useIsPhone()) return null;
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
        <div className="mt-1 max-h-[60vh] w-56 overflow-auto rounded-xl bg-white p-2 shadow-xl ring-1 ring-slate-200">
          <LayersOptions />
        </div>
      )}
    </div>
  );
}

/** Which layers and details the map shows. */
function LayersOptions() {
  const { layers, toggleLayer, showLabels, setShowLabels, showCones, setShowCones } = useEditor();
  const { showStructure, setShowStructure, wallColorBy, setWallColorBy } = useEditor();
  const { rackCollapse, setRackCollapse } = useEditor();
  return (
    <>
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
            <input type="checkbox" checked={!rackCollapse} onChange={(e) => setRackCollapse(!e.target.checked)} className="accent-slate-900" />
            ציוד שבתוך ארונות בנפרד
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} className="accent-slate-900" />
            הצג שמות
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
            <input type="checkbox" checked={showCones} onChange={(e) => setShowCones(e.target.checked)} className="accent-slate-900" />
            זוויות צילום
          </label>
    </>
  );
}
