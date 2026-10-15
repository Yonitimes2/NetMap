"use client";

import { useMemo, useRef, useState } from "react";
import {
  Camera,
  ImagePlus,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Plus,
  Server,
  Trash2,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { storeImageFile, useImageSrc, deleteImage } from "@/lib/images";
import { logAudit } from "@/lib/audit";
import { toast } from "@/lib/toast";
import {
  CABLE_RUNS,
  CABLE_TYPES,
  DEVICE_TYPES,
  LAYERS,
  TRAY_TYPES,
  deviceTypeById,
  layerById,
  linkTypeById,
} from "@/lib/catalog";
import { linkLengthM, traceDevice } from "@/lib/graph";
import { camerasPrivacyHits } from "@/lib/space";
import { rackOf } from "@/lib/rack-mount";
import { DEFAULT_PPM } from "@/lib/space-catalog";
import type { CableRun, Device, Link } from "@/lib/types";
import { Button, Field, Input, Modal, Select, Textarea, cx } from "../ui";
import { useEditor } from "./editor-store";
import { PanelHeader, Section } from "./panel-ui";
import { RackSection } from "./RackSection";
import { DeviceProductSection } from "./DeviceProduct";
import { CameraWizard } from "./CameraWizard";
import { askConfirm } from "../dialogs";
import { ObstaclePanel, OpeningPanel, RoomPanel, WallPanel } from "./StructurePanels";

interface PanelProps {
  accountId: string;
  canEdit: boolean;
  /** navigate to a device, switching floors if needed */
  onGoto: (deviceId: string) => void;
}

export function DetailsPanel(props: PanelProps) {
  const selection = useEditor((s) => s.selection);
  const select = useEditor((s) => s.select);
  if (!selection) return null;
  // the side panel (SiteScreen) provides the frame; this is just the scrolling content
  return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        {selection.kind === "device" && <DevicePanel key={selection.id} id={selection.id} {...props} onClose={() => select(null)} />}
        {selection.kind === "link" && <LinkPanel key={selection.id} id={selection.id} {...props} onClose={() => select(null)} />}
        {selection.kind === "area" && <RoomPanel id={selection.id} canEdit={props.canEdit} onClose={() => select(null)} />}
        {selection.kind === "wall" && <WallPanel key={selection.id} id={selection.id} canEdit={props.canEdit} onClose={() => select(null)} />}
        {selection.kind === "opening" && <OpeningPanel id={selection.id} canEdit={props.canEdit} onClose={() => select(null)} />}
        {selection.kind === "obstacle" && <ObstaclePanel id={selection.id} canEdit={props.canEdit} onClose={() => select(null)} />}
        {selection.kind === "note" && <NotePanel id={selection.id} canEdit={props.canEdit} onClose={() => select(null)} />}
      </div>
  );
}

// ---------------------------------------------------------------- device

function DevicePanel({ id, accountId, canEdit, onGoto, onClose }: PanelProps & { id: string; onClose: () => void }) {
  const d = useApp((s) => s.devices.find((x) => x.id === id));
  const allDevices = useApp((s) => s.devices);
  const allLinks = useApp((s) => s.links);
  const floors = useApp((s) => s.floors);
  const updateDevice = useApp((s) => s.updateDevice);
  const deleteDevice = useApp((s) => s.deleteDevice);
  const select = useEditor((s) => s.select);
  const aiming = useEditor((s) => s.aim === id);

  const siteDevices = useMemo(() => allDevices.filter((x) => x.siteId === d?.siteId), [allDevices, d?.siteId]);
  const siteLinks = useMemo(() => allLinks.filter((x) => x.siteId === d?.siteId), [allLinks, d?.siteId]);
  const trace = useMemo(() => (d ? traceDevice(d, siteDevices, siteLinks) : null), [d, siteDevices, siteLinks]);
  if (!d) return null;

  const def = deviceTypeById(d.type);
  const layer = layerById(def.layer);
  const Icon = def.icon;
  const ro = !canEdit;
  const upd = (patch: Partial<Device>) => updateDevice(d.id, patch);
  const myLinks = siteLinks.filter((l) => l.kind === "cable" && (l.a?.deviceId === d.id || l.b?.deviceId === d.id));
  const floorName = (fid: string) => floors.find((f) => f.id === fid)?.name;

  // suggesting a model for this camera takes the whole panel
  if (aiming && canEdit && d.camera) return <CameraWizard d={d} siteDevices={siteDevices} onChange={upd} />;

  return (
    <div>
      <PanelHeader onClose={onClose} color={layer.color}>
        <div className="flex items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full ring-2" style={{ color: layer.color, ["--tw-ring-color" as string]: layer.color }}>
            <Icon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <input
              value={d.label}
              readOnly={ro}
              onChange={(e) => upd({ label: e.target.value })}
              className="w-full truncate rounded bg-transparent text-base font-semibold outline-none focus:bg-slate-50"
            />
            <div className="text-xs text-slate-500">
              {def.label} · {layer.label}
            </div>
          </div>
        </div>
      </PanelHeader>

      <DeviceProductSection d={d} siteDevices={siteDevices} ro={ro} onChange={upd} />

      <MountedIn d={d} onGoto={onGoto} />

      {/* trace */}
      {trace && trace.steps.length > 1 && (
        <Section title="מסלול חיבור">
          <ol className="relative space-y-0">
            {trace.steps.map((st, i) => {
              const sd = deviceTypeById(st.device.type);
              const SIcon = sd.icon;
              const color = layerById(sd.layer).color;
              const otherFloor = st.device.floorId !== d.floorId;
              return (
                <li key={st.device.id + i}>
                  {st.link && (
                    <div className="flex items-center gap-2 py-0.5 ps-3.5 text-[11px] text-slate-500">
                      <span className="h-5 w-0.5 bg-amber-300" />
                      {linkTypeById(st.link.cableType).label}
                      {st.fromPort && <span>· יציאה {st.fromPort}</span>}
                      {st.toPort && <span>→ פורט {st.toPort}</span>}
                      {!st.link.floorId && <span className="text-amber-700">· בין קומות</span>}
                    </div>
                  )}
                  <button
                    onClick={() => onGoto(st.device.id)}
                    className={cx(
                      "flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-start text-sm hover:bg-slate-50",
                      i === 0 && "font-semibold",
                    )}
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white ring-2" style={{ color, ["--tw-ring-color" as string]: color }}>
                      <SIcon size={13} />
                    </span>
                    <span className="flex-1 truncate">{st.device.label}</span>
                    {otherFloor && <span className="text-[11px] text-slate-400">{floorName(st.device.floorId)}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
          {!trace.reached && <p className="text-xs text-amber-700">המסלול לא מגיע לרכזת או לראוטר. חסר חיבור?</p>}
        </Section>
      )}

      <Section title="פרטים כלליים">
        <div className="grid grid-cols-2 gap-3">
          <Field label="סוג">
            <Select value={d.type} disabled={ro} onChange={(e) => upd({ type: e.target.value })}>
              {LAYERS.map((l) => (
                <optgroup key={l.id} label={l.label}>
                  {DEVICE_TYPES.filter((t) => t.layer === l.id).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label="יצרן">
            <Input value={d.manufacturer ?? ""} readOnly={ro} onChange={(e) => upd({ manufacturer: e.target.value })} />
          </Field>
          <Field label="דגם">
            <Input value={d.model ?? ""} readOnly={ro} onChange={(e) => upd({ model: e.target.value })} className="ltr text-end" />
          </Field>
          <Field label="מספר סידורי">
            <Input value={d.serial ?? ""} readOnly={ro} onChange={(e) => upd({ serial: e.target.value })} className="ltr text-end" />
          </Field>
          <Field label="תאריך התקנה">
            <Input type="date" value={d.installDate ?? ""} readOnly={ro} onChange={(e) => upd({ installDate: e.target.value })} />
          </Field>
          <Field label="אחריות עד">
            <Input type="date" value={d.warrantyUntil ?? ""} readOnly={ro} onChange={(e) => upd({ warrantyUntil: e.target.value })} />
          </Field>
        </div>
        {def.fields.length > 0 && (
          <div className="grid grid-cols-2 gap-3 border-t border-dashed border-slate-200 pt-3">
            {def.fields.map((f) => (
              <Field key={f.key} label={f.label}>
                {f.type === "select" ? (
                  <Select value={d.extra[f.key] ?? ""} disabled={ro} onChange={(e) => upd({ extra: { ...d.extra, [f.key]: e.target.value } })}>
                    <option value="">—</option>
                    {f.options!.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    type={f.type === "number" ? "number" : "text"}
                    value={d.extra[f.key] ?? ""}
                    readOnly={ro}
                    className={f.ltr ? "ltr text-end" : ""}
                    onChange={(e) => upd({ extra: { ...d.extra, [f.key]: e.target.value } })}
                  />
                )}
              </Field>
            ))}
          </div>
        )}
      </Section>

      {d.type === "rack" && <RackSection d={d} ro={ro} onGoto={onGoto} />}

      {def.network && (
        <Section
          title="הגדרות רשת"
          extra={d.net.ip ? <span className="ltr text-xs font-normal text-slate-500">{d.net.ip}</span> : undefined}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="כתובת IP">
              <div className="flex gap-1">
                <Input
                  value={d.net.ip ?? ""}
                  readOnly={ro}
                  onChange={(e) => upd({ net: { ...d.net, ip: e.target.value } })}
                  className="ltr text-end"
                  placeholder="192.168.1.10"
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                />
                {d.net.ip && <CopyButton value={d.net.ip} label="IP" />}
                {d.net.ip && (
                  <a href={`http://${d.net.ip}`} target="_blank" rel="noreferrer" title="פתח ממשק ניהול" className="grid w-9 shrink-0 place-items-center rounded-lg text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50">
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </Field>
            <Field label="שיטה">
              <Select value={d.net.mode ?? ""} disabled={ro} onChange={(e) => upd({ net: { ...d.net, mode: (e.target.value || undefined) as "dhcp" | "static" | undefined } })}>
                <option value="">—</option>
                <option value="static">סטטי</option>
                <option value="dhcp">DHCP</option>
              </Select>
            </Field>
            {(["subnet", "gateway", "dns", "mac", "vlan"] as const).map((k) => (
              <Field key={k} label={{ subnet: "Subnet", gateway: "Gateway", dns: "DNS", mac: "MAC", vlan: "VLAN" }[k]}>
                <div className="flex gap-1">
                  <Input
                    value={d.net[k] ?? ""}
                    readOnly={ro}
                    onChange={(e) => upd({ net: { ...d.net, [k]: e.target.value } })}
                    className="ltr text-end"
                    // number pad with a dot for addresses; capitals for MAC
                    inputMode={k === "mac" ? "text" : k === "vlan" ? "numeric" : "decimal"}
                    autoCapitalize={k === "mac" ? "characters" : "none"}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {k === "mac" && d.net.mac && <CopyButton value={d.net.mac} label="MAC" />}
                </div>
              </Field>
            ))}
          </div>
        </Section>
      )}

      {def.creds && <CredsSection d={d} accountId={accountId} ro={ro} secretLabel={def.secretLabel} />}

      {def.camera && d.camera && <PrivacyWarning d={d} />}

      {def.camera && d.camera && (
        <Section title="זווית צילום">
          <Field label={`כיוון: ${d.camera.dir}°`}>
            <input type="range" min={0} max={359} value={d.camera.dir} disabled={ro} onChange={(e) => upd({ camera: { ...d.camera!, dir: +e.target.value } })} className="w-full accent-red-600" />
          </Field>
          <Field label={`רוחב שדה ראייה: ${d.camera.fov}°`}>
            <input type="range" min={10} max={360} value={d.camera.fov} disabled={ro} onChange={(e) => upd({ camera: { ...d.camera!, fov: +e.target.value } })} className="w-full accent-red-600" />
          </Field>
          <Field label="טווח (מטר)">
            <Input type="number" value={d.camera.range} readOnly={ro} onChange={(e) => upd({ camera: { ...d.camera!, range: +e.target.value || 1 } })} />
          </Field>
          {canEdit && <p className="text-xs text-slate-500">אפשר גם לגרור את הנקודה האדומה על המפה כדי לכוון.</p>}
        </Section>
      )}

      {(def.ports || d.ports) && <PortsSection d={d} links={siteLinks} devices={siteDevices} ro={ro} onGoto={onGoto} />}

      <Section title={`חיבורים (${myLinks.length})`}>
        {myLinks.length === 0 && <p className="text-sm text-slate-500">אין חיבורים. צייר כבל במפה או הוסף חיבור כאן.</p>}
        <ul className="space-y-1">
          {myLinks.map((l) => {
            const mine = l.a?.deviceId === d.id ? l.a : l.b!;
            const other = l.a?.deviceId === d.id ? l.b : l.a;
            const od = siteDevices.find((x) => x.id === other?.deviceId);
            const t = linkTypeById(l.cableType);
            const floor = floors.find((f) => f.id === d.floorId);
            const len = linkLengthM(l, floor?.pxPerMeter);
            return (
              <li key={l.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <span className="h-3 w-1.5 shrink-0 rounded" style={{ background: l.color || t.color }} />
                <button className="min-w-0 flex-1 text-start" onClick={() => (l.floorId ? select({ kind: "link", id: l.id }) : od && onGoto(od.id))}>
                  <div className="truncate">
                    {mine.port && <span className="text-slate-500">פורט {mine.port} → </span>}
                    {od?.label ?? "קצה לא מחובר"}
                    {other?.port && <span className="text-slate-500"> (פורט {other.port})</span>}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {t.label}
                    {len ? ` · ${len.toFixed(1)} מ׳` : ""}
                    {!l.floorId ? " · בין קומות" : ""}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        {canEdit && <AddConnection d={d} devices={siteDevices} />}
      </Section>

      <PhotosSection d={d} ro={ro} />

      <Section title="הערות" open={!!d.notes}>
        <Textarea rows={3} value={d.notes ?? ""} readOnly={ro} onChange={(e) => upd({ notes: e.target.value })} placeholder="מיקום מדויק, היסטוריה, תקלות…" />
      </Section>

      <div className="flex items-center justify-between px-4 py-3 text-[11px] text-slate-400">
        <span>עודכן {new Date(d.updatedAt).toLocaleString("he-IL")}</span>
        {canEdit && (
          <Button
            variant="danger"
            size="sm"
            onClick={async () => {
              if (await askConfirm({ title: "מחיקת ציוד", message: `למחוק את "${d.label}"? כבלים מצוירים יישארו בלי קצה.`, danger: true, okLabel: "מחק" })) {
                deleteDevice(d.id);
                onClose();
              }
            }}
          >
            <Trash2 size={14} /> מחק
          </Button>
        )}
      </div>
    </div>
  );
}

/** "In rack X · U10" for equipment mounted in a comms rack. */
function MountedIn({ d, onGoto }: { d: Device; onGoto: (id: string) => void }) {
  const devices = useApp((s) => s.devices);
  const m = rackOf(d.id, devices);
  if (!m) return null;
  const { rack, item } = m;
  return (
    <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
      <Server size={15} className="text-slate-500" />
      <span className="flex-1">
        בתוך <b>{rack.label}</b> · U{item.u}
        {item.height > 1 ? `–U${item.u + item.height - 1}` : ""}
      </span>
      <button onClick={() => onGoto(rack.id)} className="text-xs font-medium text-blue-600 hover:underline">
        פתח ארון
      </button>
    </div>
  );
}

function PrivacyWarning({ d }: { d: Device }) {
  const areas = useApp((s) => s.areas);
  const ppm = useApp((s) => s.floors.find((f) => f.id === d.floorId)?.pxPerMeter) ?? DEFAULT_PPM;
  const hits = camerasPrivacyHits(d, areas, ppm);
  if (!hits.length) return null;
  return (
    <div className="mx-4 my-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
      <b>אזהרת פרטיות:</b> זווית הצילום מגיעה ל{hits.map((h) => `"${h.name}"`).join(", ")}, שמסומן כאזור שאסור לצלם. כדאי לשנות כיוון או טווח.
    </div>
  );
}

function CredsSection({ d, accountId, ro, secretLabel }: { d: Device; accountId: string; ro: boolean; secretLabel?: string }) {
  const updateDevice = useApp((s) => s.updateDevice);
  const [shown, setShown] = useState(false);
  const reveal = () => {
    if (!shown) logAudit(accountId, "צפה בסיסמאות של", d.id);
    setShown(!shown);
  };
  const upd = (k: "username" | "password" | "secret", v: string) => updateDevice(d.id, { creds: { ...d.creds, [k]: v } });
  const secretField = (k: "password" | "secret", label: string) => (
    <Field label={label}>
      <div className="flex gap-1">
        <Input
          type={shown ? "text" : "password"}
          value={d.creds[k] ?? ""}
          readOnly={ro || !shown}
          onChange={(e) => upd(k, e.target.value)}
          className="ltr text-end"
          placeholder={shown ? "" : "••••••"}
        />
        <button
          type="button"
          title="העתק"
          onClick={() => {
            void navigator.clipboard?.writeText(d.creds[k] ?? "");
            if (!shown) logAudit(accountId, "העתיק סיסמה של", d.id);
          }}
          className="grid w-9 shrink-0 place-items-center rounded-lg text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          <Copy size={14} />
        </button>
      </div>
    </Field>
  );
  return (
    <Section
      title="גישה וסיסמאות"
      open={false}
      extra={
        <span className="flex items-center gap-1 text-[11px] font-normal text-slate-400">
          <span className="size-1.5 rounded-full bg-green-500" /> מוצפן
        </span>
      }
    >
      <Field label="שם משתמש">
        <Input value={d.creds.username ?? ""} readOnly={ro} onChange={(e) => upd("username", e.target.value)} className="ltr text-end" />
      </Field>
      {secretField("password", "סיסמה")}
      {secretField("secret", secretLabel ?? "סיסמה / קוד נוסף")}
      <Button size="sm" onClick={reveal}>
        {shown ? <EyeOff size={14} /> : <Eye size={14} />} {shown ? "הסתר" : "הצג ועריכה"}
      </Button>
      <p className="text-[11px] text-slate-400">כל צפייה בסיסמה נרשמת ביומן של בעל העסק.</p>
    </Section>
  );
}

function PortsSection({ d, links, devices, ro, onGoto }: { d: Device; links: Link[]; devices: Device[]; ro: boolean; onGoto: (id: string) => void }) {
  const updateDevice = useApp((s) => s.updateDevice);
  const n = d.ports ?? deviceTypeById(d.type).ports ?? 0;
  const byPort = new Map<string, { other?: Device; otherPort?: string; link: Link }>();
  for (const l of links) {
    if (l.kind !== "cable") continue;
    const mine = l.a?.deviceId === d.id ? l.a : l.b?.deviceId === d.id ? l.b : undefined;
    if (!mine?.port) continue;
    const other = l.a?.deviceId === d.id ? l.b : l.a;
    byPort.set(mine.port, { other: devices.find((x) => x.id === other?.deviceId), otherPort: other?.port, link: l });
  }
  const numbered = Array.from({ length: n }, (_, i) => String(i + 1));
  const named = [...byPort.keys()].filter((p) => !numbered.includes(p));
  const used = [...numbered, ...named].filter((p) => byPort.has(p)).length;
  return (
    <Section title="פורטים" extra={<span className="text-xs font-normal text-slate-500">{used}/{n + named.length} בשימוש</span>}>
      <Field label="מספר פורטים">
        <Input type="number" min={0} max={96} value={n} readOnly={ro} onChange={(e) => updateDevice(d.id, { ports: Math.max(0, Math.min(96, +e.target.value)) })} />
      </Field>
      <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
        {numbered.map((p) => {
          const c = byPort.get(p);
          return (
            <button
              key={p}
              title={c ? `${c.other?.label ?? "?"}${c.otherPort ? ` (פורט ${c.otherPort})` : ""}` : "פנוי"}
              onClick={() => c?.other && onGoto(c.other.id)}
              className={cx(
                "h-8 rounded text-xs font-medium",
                c ? "text-white" : "bg-slate-100 text-slate-400",
              )}
              style={c ? { background: linkTypeById(c.link.cableType).color } : undefined}
            >
              {p}
            </button>
          );
        })}
      </div>
      <ul className="divide-y divide-slate-100 text-sm">
        {[...numbered, ...named]
          .filter((p) => byPort.has(p))
          .map((p) => {
            const c = byPort.get(p)!;
            return (
              <li key={p} className="flex items-center gap-2 py-1">
                <span className="w-10 shrink-0 text-xs font-semibold text-slate-500">{p}</span>
                <button className="flex-1 truncate text-start hover:underline" onClick={() => c.other && onGoto(c.other.id)}>
                  {c.other?.label ?? "—"}
                </button>
                {c.otherPort && <span className="text-xs text-slate-400">פורט {c.otherPort}</span>}
              </li>
            );
          })}
      </ul>
    </Section>
  );
}

function AddConnection({ d, devices }: { d: Device; devices: Device[] }) {
  const addLink = useApp((s) => s.addLink);
  const floors = useApp((s) => s.floors);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ target: "", myPort: "", otherPort: "", cableType: deviceTypeById(d.type).layer === "cctv" ? "cctv-cat6" : "cat6" });
  if (!open)
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={14} /> הוסף חיבור
      </Button>
    );
  const siteFloors = floors.filter((fl) => devices.some((x) => x.floorId === fl.id));
  const submit = () => {
    const t = devices.find((x) => x.id === f.target);
    if (!t) return;
    const ct = linkTypeById(f.cableType);
    const sameFloor = t.floorId === d.floorId;
    addLink({
      siteId: d.siteId,
      floorId: sameFloor ? d.floorId : undefined,
      kind: "cable",
      layer: ct.layer,
      cableType: ct.id,
      points: sameFloor ? [{ x: d.x, y: d.y }, { x: t.x, y: t.y }] : [],
      a: { deviceId: d.id, port: f.myPort || undefined },
      b: { deviceId: t.id, port: f.otherPort || undefined },
    });
    setOpen(false);
    setF({ ...f, target: "", myPort: "", otherPort: "" });
  };
  return (
    <div className="space-y-2 rounded-xl bg-slate-50 p-3">
      <Field label="מחובר אל">
        <Select value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })}>
          <option value="">בחר ציוד…</option>
          {siteFloors.map((fl) => (
            <optgroup key={fl.id} label={fl.name}>
              {devices
                .filter((x) => x.floorId === fl.id && x.id !== d.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="פורט כאן">
          <Input value={f.myPort} onChange={(e) => setF({ ...f, myPort: e.target.value })} className="ltr text-end" />
        </Field>
        <Field label="פורט ביעד">
          <Input value={f.otherPort} onChange={(e) => setF({ ...f, otherPort: e.target.value })} className="ltr text-end" />
        </Field>
      </div>
      <Field label="סוג כבל">
        <Select value={f.cableType} onChange={(e) => setF({ ...f, cableType: e.target.value })}>
          {CABLE_TYPES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={!f.target} onClick={submit}>
          הוסף
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          ביטול
        </Button>
      </div>
      <p className="text-[11px] text-slate-500">ציוד באותה קומה יקבל קו ישר במפה, ואפשר לכופף אותו אחר כך. חיבור לקומה אחרת יישמר כחיבור בין קומות.</p>
    </div>
  );
}

/** Copies a value (IP, MAC) with one tap. */
function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      title={`העתק ${label}`}
      aria-label={`העתק ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => toast(`${label} הועתק`));
      }}
      className="grid w-9 shrink-0 place-items-center rounded-lg text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
    >
      <Copy size={14} />
    </button>
  );
}

function PhotosSection({ d, ro }: { d: Device; ro: boolean }) {
  const updateDevice = useApp((s) => s.updateDevice);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const added: string[] = [];
      for (const f of Array.from(files)) added.push((await storeImageFile(f, 1600)).src);
      const cur = useApp.getState().devices.find((x) => x.id === d.id);
      updateDevice(d.id, { photos: [...(cur?.photos ?? []), ...added] });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };
  return (
    <Section title={`תמונות (${d.photos.length})`} open={d.photos.length > 0}>
      <div className="grid grid-cols-3 gap-2">
        {d.photos.map((p) => (
          <Thumb key={p} src={p} onClick={() => setViewing(p)} />
        ))}
        {!ro && (
          <button
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:bg-slate-50"
          >
            <Camera size={18} />
            {busy ? "שומר…" : "צלם"}
          </button>
        )}
        {!ro && !busy && (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:bg-slate-50"
          >
            <ImagePlus size={18} />
            מהגלריה
          </button>
        )}
      </div>
      {/* the camera straight away on phones (computers just open a file picker) */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFiles(e.target.files)} />
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      {viewing && (
        <Modal
          title={d.label}
          onClose={() => setViewing(null)}
          footer={
            !ro && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  updateDevice(d.id, { photos: d.photos.filter((x) => x !== viewing) });
                  void deleteImage(viewing);
                  setViewing(null);
                }}
              >
                <Trash2 size={14} /> מחק תמונה
              </Button>
            )
          }
        >
          <FullImage src={viewing} />
        </Modal>
      )}
    </Section>
  );
}

function Thumb({ src, onClick }: { src: string; onClick: () => void }) {
  const url = useImageSrc(src);
  return (
    <button onClick={onClick} className="aspect-square overflow-hidden rounded-lg bg-slate-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </button>
  );
}

function FullImage({ src }: { src: string }) {
  const url = useImageSrc(src);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" className="w-full rounded-lg" /> : null;
}

// ---------------------------------------------------------------- link

function LinkPanel({ id, canEdit, onGoto, onClose }: PanelProps & { id: string; onClose: () => void }) {
  const l = useApp((s) => s.links.find((x) => x.id === id));
  const allDevices = useApp((s) => s.devices);
  const floors = useApp((s) => s.floors);
  const updateLink = useApp((s) => s.updateLink);
  const deleteLink = useApp((s) => s.deleteLink);
  if (!l) return null;
  const ro = !canEdit;
  const devices = allDevices.filter((d) => d.siteId === l.siteId);
  const t = linkTypeById(l.cableType);
  const floor = floors.find((f) => f.id === l.floorId);
  const drawnLen = linkLengthM({ ...l, lengthM: undefined }, floor?.pxPerMeter);
  const isTray = l.kind === "tray";

  const endEditor = (key: "a" | "b", label: string) => {
    const end = l[key];
    const dev = devices.find((d) => d.id === end?.deviceId);
    return (
      <div className="rounded-xl bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
          {label}
          {dev && (
            <button onClick={() => onGoto(dev.id)} className="font-normal text-blue-600 hover:underline">
              עבור לציוד
            </button>
          )}
        </div>
        <div className="grid grid-cols-[1fr_80px] gap-2">
          <Select
            value={end?.deviceId ?? ""}
            disabled={ro}
            onChange={(e) => {
              const nd = devices.find((d) => d.id === e.target.value);
              const pts = [...l.points];
              if (nd && nd.floorId === l.floorId && pts.length >= 2) pts[key === "a" ? 0 : pts.length - 1] = { x: nd.x, y: nd.y };
              updateLink(l.id, { [key]: nd ? { deviceId: nd.id, port: end?.port } : undefined, points: pts });
            }}
          >
            <option value="">— לא מחובר —</option>
            {devices
              .filter((d) => !l.floorId || d.floorId === l.floorId || d.id === end?.deviceId)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
          </Select>
          <Input
            value={end?.port ?? ""}
            readOnly={ro || !end}
            placeholder="פורט"
            className="ltr text-end"
            onChange={(e) => end && updateLink(l.id, { [key]: { ...end, port: e.target.value || undefined } })}
          />
        </div>
      </div>
    );
  };

  return (
    <div>
      <PanelHeader onClose={onClose} color={l.color || t.color}>
        <input
          value={l.label ?? ""}
          readOnly={ro}
          placeholder={isTray ? t.label : `כבל ${t.label}`}
          onChange={(e) => updateLink(l.id, { label: e.target.value })}
          className="w-full rounded bg-transparent text-base font-semibold outline-none placeholder:text-slate-800 focus:bg-slate-50"
        />
        <div className="text-xs text-slate-500">
          {isTray ? "תוואי תשתית" : "כבל"} · {layerById(l.layer).label}
          {!l.floorId && " · חיבור בין קומות"}
        </div>
      </PanelHeader>
      <div className="space-y-3 p-4">
        <Field label={isTray ? "סוג תוואי" : "סוג כבל"}>
          <Select
            value={l.cableType}
            disabled={ro}
            onChange={(e) => {
              const nt = linkTypeById(e.target.value);
              updateLink(l.id, { cableType: nt.id, layer: nt.layer });
            }}
          >
            {(isTray ? TRAY_TYPES : CABLE_TYPES).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        {!isTray && (
          <>
            {endEditor("a", "צד א׳")}
            {endEditor("b", "צד ב׳")}
            <Field label="תוואי">
              <Select value={l.run ?? ""} disabled={ro} onChange={(e) => updateLink(l.id, { run: (e.target.value || undefined) as CableRun | undefined })}>
                <option value="">לא צוין</option>
                {CABLE_RUNS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="צבע מעטה">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={l.color || t.color}
                    disabled={ro}
                    onChange={(e) => updateLink(l.id, { color: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded border-0 bg-transparent"
                  />
                  {l.color && !ro && (
                    <button className="text-xs text-slate-500 hover:underline" onClick={() => updateLink(l.id, { color: undefined })}>
                      ברירת מחדל
                    </button>
                  )}
                </div>
              </Field>
              <Field label="אורך (מטר)">
                <Input
                  type="number"
                  value={l.lengthM ?? ""}
                  readOnly={ro}
                  placeholder={drawnLen ? `≈ ${drawnLen.toFixed(1)}` : "לא כויל"}
                  onChange={(e) => updateLink(l.id, { lengthM: e.target.value ? +e.target.value : undefined })}
                />
              </Field>
            </div>
          </>
        )}
        {isTray && drawnLen && <p className="text-sm text-slate-600">אורך תוואי: {drawnLen.toFixed(1)} מ׳</p>}
        <Field label="הערות">
          <Textarea rows={2} value={l.notes ?? ""} readOnly={ro} onChange={(e) => updateLink(l.id, { notes: e.target.value })} />
        </Field>
        {canEdit && l.floorId && (
          <p className="text-[11px] text-slate-500">
            כדי לכופף את הקו, גרור את הנקודות הכחולות במפה. נקודה מקווקווית מוסיפה פינה, ולחיצה כפולה על פינה מוחקת אותה.
          </p>
        )}
        {canEdit && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              deleteLink(l.id);
              onClose();
            }}
          >
            <Trash2 size={14} /> מחק {isTray ? "תוואי" : "כבל"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- note

function NotePanel({ id, canEdit, onClose }: { id: string; canEdit: boolean; onClose: () => void }) {
  const n = useApp((s) => s.notes.find((x) => x.id === id));
  const updateNote = useApp((s) => s.updateNote);
  const deleteNote = useApp((s) => s.deleteNote);
  if (!n) return null;
  return (
    <div>
      <PanelHeader onClose={onClose} color="#eab308">
        <div className="font-semibold">הערה</div>
      </PanelHeader>
      <div className="space-y-3 p-4">
        <Textarea rows={4} value={n.text} readOnly={!canEdit} onChange={(e) => updateNote(n.id, { text: e.target.value })} />
        {canEdit && (
          <Button variant="danger" size="sm" onClick={() => { deleteNote(n.id); onClose(); }}>
            <Trash2 size={14} /> מחק הערה
          </Button>
        )}
      </div>
    </div>
  );
}
