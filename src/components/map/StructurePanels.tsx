"use client";

import { Lightbulb, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useApp } from "@/lib/store";
import { AREA_COLORS } from "@/lib/catalog";
import {
  CABLE_PASS,
  CEILING_TYPES,
  DEFAULT_PPM,
  DRILLING,
  ENV_TAGS,
  FLOOR_KINDS,
  LIGHTING,
  OBSTACLE_KINDS,
  OPENING_KINDS,
  ROOM_USAGES,
  WALL_TYPES,
  openingKindById,
  wallTypeById,
} from "@/lib/space-catalog";
import { wallLength } from "@/lib/space";
import type { Area, CablePass, CeilingType, Drilling, EnvTag, FloorKind, Lighting, ObstacleKind, OpeningKind, Wall, WallType } from "@/lib/types";
import { Button, Field, Input, Select, Textarea, cx } from "../ui";
import { useEditor } from "./editor-store";
import { PanelHeader, Section } from "./panel-ui";

interface P {
  id: string;
  canEdit: boolean;
  onClose: () => void;
}

const num = (v: string) => (v === "" ? undefined : Number(v.replace(",", ".")));

function usePpm(floorId?: string) {
  return useApp((s) => s.floors.find((f) => f.id === floorId)?.pxPerMeter) ?? DEFAULT_PPM;
}

function Tips({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
      <div className="mb-1 flex items-center gap-1 font-semibold">
        <Lightbulb size={13} /> שימו לב בהתקנה
      </div>
      <ul className="list-disc space-y-0.5 ps-4">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

function Check({ checked, onChange, disabled, children }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-slate-900" />
      {children}
    </label>
  );
}

// ---------------------------------------------------------------- wall

export function WallPanel({ id, canEdit, onClose }: P) {
  const w = useApp((s) => s.walls.find((x) => x.id === id));
  const openings = useApp((s) => s.openings).filter((o) => o.wallId === id);
  const updateWall = useApp((s) => s.updateWall);
  const deleteWall = useApp((s) => s.deleteWall);
  const addOpening = useApp((s) => s.addOpening);
  const select = useEditor((s) => s.select);
  const ppm = usePpm(w?.floorId);
  if (!w) return null;
  const ro = !canEdit;
  const def = wallTypeById(w.type);
  const len = wallLength(w) / ppm;
  const upd = (patch: Partial<Wall>) => updateWall(w.id, patch);

  const setLength = (m?: number) => {
    if (!m || m <= 0) return;
    const ux = (w.b.x - w.a.x) / (wallLength(w) || 1);
    const uy = (w.b.y - w.a.y) / (wallLength(w) || 1);
    upd({ b: { x: w.a.x + ux * m * ppm, y: w.a.y + uy * m * ppm } });
  };

  const tips = [
    def.hint,
    w.drilling === "forbidden" ? "אסור לקדוח בקיר הזה. יש לתכנן מעבר דרך פתח או צנרת קיימים" : null,
    w.cablePass === "yes" && w.conduit ? `השחלה דרך: ${w.conduit}` : null,
    w.exterior ? "קיר חוץ: מעבר כבלים החוצה דורש איטום, וציוד חוץ צריך IP66" : null,
  ].filter(Boolean) as string[];

  return (
    <div>
      <PanelHeader onClose={onClose} color={def.color}>
        <div className="font-semibold">קיר {def.label}</div>
        <div className="text-xs text-slate-500">
          {len.toFixed(2)} מ׳{w.exterior ? " · קיר חוץ" : ""}
        </div>
      </PanelHeader>
      <Section title="מבנה">
        <div className="grid grid-cols-2 gap-3">
          <Field label="סוג קיר" className="col-span-2">
            <Select
              value={w.type}
              disabled={ro}
              onChange={(e) => {
                const t = e.target.value as WallType;
                // keep a custom thickness, otherwise follow the new type's default
                const thick = !w.thicknessCm || w.thicknessCm === def.thickness ? wallTypeById(t).thickness : w.thicknessCm;
                upd({ type: t, thicknessCm: thick, drilling: t === "mamad" ? "forbidden" : w.drilling });
              }}
            >
              {WALL_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="אורך (מ׳)">
            <Input key={len.toFixed(2)} type="number" step="0.1" defaultValue={len.toFixed(2)} readOnly={ro} onBlur={(e) => setLength(num(e.target.value))} />
          </Field>
          <Field label="עובי (ס״מ)">
            <Input type="number" value={w.thicknessCm ?? ""} placeholder={String(def.thickness)} readOnly={ro} onChange={(e) => upd({ thicknessCm: num(e.target.value) })} />
          </Field>
          <Field label="גובה (מ׳)">
            <Input type="number" step="0.1" value={w.heightM ?? ""} readOnly={ro} onChange={(e) => upd({ heightM: num(e.target.value) })} />
          </Field>
          <Field label="גימור">
            <Input value={w.finish ?? ""} readOnly={ro} placeholder="טיח, קרמיקה, חיפוי…" onChange={(e) => upd({ finish: e.target.value })} />
          </Field>
        </div>
        <Check checked={!!w.exterior} disabled={ro} onChange={(v) => upd({ exterior: v })}>
          קיר חוץ
        </Check>
      </Section>

      <Section title="מעבר כבלים">
        <Field label="השחלה קיימת">
          <div className="grid grid-cols-4 gap-1">
            {CABLE_PASS.map((c) => (
              <button
                key={c.id}
                disabled={ro}
                onClick={() => upd({ cablePass: c.id as CablePass })}
                className={cx(
                  "rounded-lg px-1 py-1.5 text-[11px] font-medium ring-1",
                  (w.cablePass ?? "unknown") === c.id ? "text-white" : "bg-white text-slate-600 ring-slate-200",
                )}
                style={(w.cablePass ?? "unknown") === c.id ? { background: c.color, borderColor: c.color } : undefined}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="צנרת בקיר">
          <Input value={w.conduit ?? ""} readOnly={ro} placeholder="למשל: צינור 25 מ״מ מהתקרה" onChange={(e) => upd({ conduit: e.target.value })} />
        </Field>
        <Check checked={!!w.pullString} disabled={ro} onChange={(v) => upd({ pullString: v })}>
          יש חוט משיכה
        </Check>
        <Field label="קידוח">
          <Select value={w.drilling ?? ""} disabled={ro} onChange={(e) => upd({ drilling: (e.target.value || undefined) as Drilling | undefined })}>
            <option value="">לא צוין</option>
            {DRILLING.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title={`פתחים (${openings.length})`} open={openings.length > 0}>
        <ul className="space-y-1">
          {openings.map((o) => (
            <li key={o.id}>
              <button onClick={() => select({ kind: "opening", id: o.id })} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <span>{openingKindById(o.kind).label}</span>
                <span className="text-xs text-slate-500">
                  רוחב {o.widthM} מ׳ · {o.offsetM.toFixed(1)} מ׳ מתחילת הקיר
                </span>
              </button>
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="flex flex-wrap gap-1">
            {OPENING_KINDS.slice(0, 3).map((k) => (
              <Button
                key={k.id}
                size="sm"
                onClick={() => {
                  const widthM = Math.min(k.width, len);
                  const oid = addOpening({ siteId: w.siteId, floorId: w.floorId, wallId: w.id, kind: k.id, offsetM: Math.round((len / 2) * 100) / 100, widthM });
                  select({ kind: "opening", id: oid });
                }}
              >
                <Plus size={13} /> {k.label}
              </Button>
            ))}
          </div>
        )}
      </Section>

      <div className="space-y-3 p-4">
        <Tips items={tips} />
        <Field label="הערות">
          <Textarea rows={2} value={w.notes ?? ""} readOnly={ro} onChange={(e) => upd({ notes: e.target.value })} />
        </Field>
        {canEdit && (
          <Button variant="danger" size="sm" onClick={() => { deleteWall(w.id); onClose(); }}>
            <Trash2 size={14} /> מחק קיר
          </Button>
        )}
        {canEdit && <p className="text-[11px] text-slate-500">גררו את הנקודות הכחולות כדי להזיז את קצות הקיר. קירות שמחוברים אליו יזוזו יחד.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- opening

export function OpeningPanel({ id, canEdit, onClose }: P) {
  const o = useApp((s) => s.openings.find((x) => x.id === id));
  const wall = useApp((s) => s.walls.find((x) => x.id === o?.wallId));
  const updateOpening = useApp((s) => s.updateOpening);
  const deleteOpening = useApp((s) => s.deleteOpening);
  const select = useEditor((s) => s.select);
  const ppm = usePpm(o?.floorId);
  if (!o) return null;
  const ro = !canEdit;
  const kind = openingKindById(o.kind);
  const wallLen = wall ? wallLength(wall) / ppm : 0;
  const tips = [
    o.kind === "window" || o.kind === "vitrine" ? "מצלמה שמצלמת לכיוון הפתח תסבול מתאורה אחורית. עדיף לצלם מהצד, או להשתמש במצלמה עם WDR" : null,
    o.kind === "door" || o.kind === "gate" ? "כדאי לבדוק אם צריך כאן מגנט אזעקה או בקרת כניסה" : null,
  ].filter(Boolean) as string[];
  return (
    <div>
      <PanelHeader onClose={onClose} color={kind.color}>
        <div className="font-semibold">{kind.label}</div>
        {wall && (
          <button className="text-xs text-blue-600 hover:underline" onClick={() => select({ kind: "wall", id: wall.id })}>
            בקיר {wallTypeById(wall.type).label} ({wallLen.toFixed(1)} מ׳)
          </button>
        )}
      </PanelHeader>
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="סוג">
            <Select value={o.kind} disabled={ro} onChange={(e) => updateOpening(o.id, { kind: e.target.value as OpeningKind })}>
              {OPENING_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="רוחב (מ׳)">
            <Input type="number" step="0.1" value={o.widthM} readOnly={ro} onChange={(e) => updateOpening(o.id, { widthM: Math.max(0.3, num(e.target.value) ?? 0.9) })} />
          </Field>
          <Field label="גובה (מ׳)">
            <Input type="number" step="0.1" value={o.heightM ?? ""} readOnly={ro} onChange={(e) => updateOpening(o.id, { heightM: num(e.target.value) })} />
          </Field>
          <Field label="מרחק מתחילת הקיר (מ׳)">
            <Input type="number" step="0.1" value={o.offsetM} readOnly={ro} onChange={(e) => updateOpening(o.id, { offsetM: num(e.target.value) ?? 0 })} />
          </Field>
        </div>
        <Tips items={tips} />
        <Field label="הערות">
          <Textarea rows={2} value={o.notes ?? ""} readOnly={ro} onChange={(e) => updateOpening(o.id, { notes: e.target.value })} />
        </Field>
        {canEdit && <p className="text-[11px] text-slate-500">אפשר לגרור את הפתח לאורך הקיר כשהוא מסומן.</p>}
        {canEdit && (
          <Button variant="danger" size="sm" onClick={() => { deleteOpening(o.id); onClose(); }}>
            <Trash2 size={14} /> מחק פתח
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- obstacle

export function ObstaclePanel({ id, canEdit, onClose }: P) {
  const o = useApp((s) => s.obstacles.find((x) => x.id === id));
  const updateObstacle = useApp((s) => s.updateObstacle);
  const deleteObstacle = useApp((s) => s.deleteObstacle);
  const ppm = usePpm(o?.floorId);
  if (!o) return null;
  const ro = !canEdit;
  return (
    <div>
      <PanelHeader onClose={onClose} color="#475569">
        <div className="font-semibold">{OBSTACLE_KINDS.find((k) => k.id === o.kind)?.label}</div>
      </PanelHeader>
      <div className="space-y-3 p-4">
        <Field label="סוג">
          <Select value={o.kind} disabled={ro} onChange={(e) => updateObstacle(o.id, { kind: e.target.value as ObstacleKind })}>
            {OBSTACLE_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="רוחב (מ׳)">
            <Input type="number" step="0.1" value={+(o.w / ppm).toFixed(2)} readOnly={ro} onChange={(e) => updateObstacle(o.id, { w: (num(e.target.value) ?? 0.4) * ppm })} />
          </Field>
          <Field label="עומק (מ׳)">
            <Input type="number" step="0.1" value={+(o.h / ppm).toFixed(2)} readOnly={ro} onChange={(e) => updateObstacle(o.id, { h: (num(e.target.value) ?? 0.4) * ppm })} />
          </Field>
        </div>
        {o.kind === "shaft" && <Tips items={["פיר הוא מעבר טבעי לכבלים בין קומות. כדאי לתעד מה כבר עובר בו"]} />}
        <Field label="הערות">
          <Textarea rows={2} value={o.notes ?? ""} readOnly={ro} onChange={(e) => updateObstacle(o.id, { notes: e.target.value })} />
        </Field>
        {canEdit && (
          <Button variant="danger" size="sm" onClick={() => { deleteObstacle(o.id); onClose(); }}>
            <Trash2 size={14} /> מחק
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- room

export function roomTips(a: Area): string[] {
  const t: string[] = [];
  if (a.noCameras) t.push("אזור פרטיות: אסור שמצלמות יכסו אותו");
  if (a.outdoor || a.env?.includes("rain")) t.push("ציוד חוץ: מצלמות וקופסאות חיבור ברמת IP66 לפחות");
  if (a.env?.includes("vandal")) t.push("סיכון ונדליזם: מצלמת כיפה IK10, בגובה של 3 מ׳ ומעלה");
  if (a.env?.includes("humid")) t.push("לחות: ציוד אטום, בלי שקעים חשופים");
  if (a.env?.includes("hot")) t.push("חום: להרחיק ציוד ממקורות חום");
  if (a.lighting === "dark" || a.lighting === "low") t.push("תאורה חלשה: מצלמה עם IR או טכנולוגיית ColorVu");
  if (a.lighting === "backlight" || a.lighting === "sun") t.push("תאורה אחורית או שמש: מצלמה עם WDR, ולא לצלם מול הפתח");
  const ceil = CEILING_TYPES.find((c) => c.id === a.ceilingType);
  if (ceil?.hint) t.push(`תקרה: ${ceil.hint}`);
  if (a.plenumAccess && a.plenumM) t.push(`חלל של ${a.plenumM} מ׳ מעל התקרה: תוואי כבלים נוח`);
  if (a.ceilingHeightM && a.ceilingHeightM > 4) t.push("תקרה גבוהה: צריך סולם או במה, ולשקול מצלמה עם זום");
  if (a.floorKind === "raised") t.push("רצפה צפה: אפשר להעביר כבלים מתחת לרצפה");
  if (a.power === "none") t.push("אין חשמל זמין: הזנה ב-PoE או קו חשמל חדש");
  return t;
}

function polygonAreaM2(pts: { x: number; y: number }[], ppm: number) {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  return Math.abs(s / 2) / (ppm * ppm);
}

export function RoomPanel({ id, canEdit, onClose }: P) {
  const a = useApp((s) => s.areas.find((x) => x.id === id));
  const updateArea = useApp((s) => s.updateArea);
  const deleteArea = useApp((s) => s.deleteArea);
  const ppm = usePpm(a?.floorId);
  if (!a) return null;
  const ro = !canEdit;
  const upd = (patch: Partial<Area>) => updateArea(a.id, patch);
  const dropped = a.ceilingType === "acoustic" || a.ceilingType === "drywall";
  const toggleEnv = (t: EnvTag) => {
    const cur = new Set(a.env ?? []);
    if (cur.has(t)) cur.delete(t);
    else cur.add(t);
    upd({ env: [...cur] });
  };

  return (
    <div>
      <PanelHeader onClose={onClose} color={a.color}>
        <input
          value={a.name}
          readOnly={ro}
          onChange={(e) => upd({ name: e.target.value })}
          className="w-full rounded bg-transparent text-base font-semibold outline-none focus:bg-slate-50"
        />
        <div className="text-xs text-slate-500">
          חדר / אזור · {polygonAreaM2(a.points, ppm).toFixed(1)} מ״ר
        </div>
      </PanelHeader>

      <Section title="כללי">
        <div className="grid grid-cols-2 gap-3">
          <Field label="שימוש">
            <Input list="room-usages" value={a.usage ?? ""} readOnly={ro} onChange={(e) => upd({ usage: e.target.value })} />
            <datalist id="room-usages">
              {ROOM_USAGES.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </Field>
          <Field label="חשמל זמין">
            <Select value={a.power ?? ""} disabled={ro} onChange={(e) => upd({ power: (e.target.value || undefined) as Area["power"] })}>
              <option value="">לא צוין</option>
              <option value="available">יש שקעים</option>
              <option value="limited">מוגבל</option>
              <option value="none">אין</option>
            </Select>
          </Field>
        </div>
        <Check checked={!!a.outdoor} disabled={ro} onChange={(v) => upd({ outdoor: v })}>
          אזור חוץ
        </Check>
        <label className={cx("flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm ring-1", a.noCameras ? "bg-red-50 text-red-800 ring-red-200" : "ring-slate-200")}>
          <input type="checkbox" checked={!!a.noCameras} disabled={ro} onChange={(e) => upd({ noCameras: e.target.checked })} className="size-4 accent-red-600" />
          אזור פרטיות: אסור לצלם (שירותים, חדר הלבשה)
        </label>
        <Field label="צבע">
          <div className="flex gap-2">
            {AREA_COLORS.map((c) => (
              <button
                key={c}
                disabled={ro}
                onClick={() => upd({ color: c })}
                className={cx("size-7 rounded-full ring-offset-2", a.color === c && "ring-2 ring-slate-900")}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
      </Section>

      <Section title="תקרה ורצפה">
        <Field label="סוג תקרה">
          <Select value={a.ceilingType ?? ""} disabled={ro} onChange={(e) => upd({ ceilingType: (e.target.value || undefined) as CeilingType | undefined })}>
            <option value="">לא צוין</option>
            {CEILING_TYPES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="גובה תקרה (מ׳)">
            <Input type="number" step="0.1" value={a.ceilingHeightM ?? ""} readOnly={ro} onChange={(e) => upd({ ceilingHeightM: num(e.target.value) })} />
          </Field>
          {dropped && (
            <Field label="חלל מעל התקרה (מ׳)">
              <Input type="number" step="0.1" value={a.plenumM ?? ""} readOnly={ro} onChange={(e) => upd({ plenumM: num(e.target.value) })} />
            </Field>
          )}
        </div>
        {dropped && (
          <Check checked={!!a.plenumAccess} disabled={ro} onChange={(v) => upd({ plenumAccess: v })}>
            יש גישה לחלל התקרה
          </Check>
        )}
        <Field label="רצפה">
          <Select value={a.floorKind ?? ""} disabled={ro} onChange={(e) => upd({ floorKind: (e.target.value || undefined) as FloorKind | undefined })}>
            <option value="">לא צוין</option>
            {FLOOR_KINDS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title="תנאים למצלמות וציוד">
        <Field label="תאורה">
          <Select value={a.lighting ?? ""} disabled={ro} onChange={(e) => upd({ lighting: (e.target.value || undefined) as Lighting | undefined })}>
            <option value="">לא צוין</option>
            {LIGHTING.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="סביבה">
          <div className="flex flex-wrap gap-1">
            {ENV_TAGS.map((t) => {
              const on = a.env?.includes(t.id);
              return (
                <button
                  key={t.id}
                  disabled={ro}
                  title={t.hint}
                  onClick={() => toggleEnv(t.id)}
                  className={cx("rounded-full px-2.5 py-1 text-xs ring-1", on ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200")}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </Field>
      </Section>

      <div className="space-y-3 p-4">
        <Tips items={roomTips(a)} />
        <Field label="הערות">
          <Textarea rows={2} value={a.notes ?? ""} readOnly={ro} onChange={(e) => upd({ notes: e.target.value })} />
        </Field>
        {canEdit && (
          <Button variant="danger" size="sm" onClick={() => { deleteArea(a.id); onClose(); }}>
            <Trash2 size={14} /> מחק חדר (הקירות נשארים)
          </Button>
        )}
      </div>
    </div>
  );
}
