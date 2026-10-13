"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp, List, Map as MapIcon, Plus, Search, Settings2, Sparkles, Trash2, Waypoints } from "lucide-react";
import { AppShell } from "./AppShell";
import { Button, Empty, Field, Input, Modal, cx } from "./ui";
import { MapCanvas } from "./map/MapCanvas";
import { LayersPanel, Toolbar } from "./map/Toolbar";
import { DetailsPanel } from "./map/DetailsPanel";
import { SpaceAssistant } from "./map/SpaceAssistant";
import { useEditor } from "./map/editor-store";
import { useApp } from "@/lib/store";
import { can, useRole } from "@/lib/access";
import { deviceTypeById, layerById, linkTypeById } from "@/lib/catalog";
import { linkLengthM } from "@/lib/graph";
import { pdfPageCount, storeImageFile, storePdfPage } from "@/lib/images";
import { askConfirm, askText, showAlert } from "./dialogs";
import type { Floor } from "@/lib/types";

export function SiteScreen() {
  const { accountId, siteId } = useParams<{ accountId: string; siteId: string }>();
  const account = useApp((s) => s.accounts.find((a) => a.id === accountId));
  const site = useApp((s) => s.sites.find((x) => x.id === siteId));
  const allowed = can.view(useRole(accountId));
  return (
    <AppShell
      fullBleed
      crumbs={
        allowed
          ? [
              { label: account?.name ?? "", href: `/a/${accountId}` },
              { label: site?.name ?? "" },
            ]
          : []
      }
    >
      <SiteBody accountId={accountId} siteId={siteId} />
    </AppShell>
  );
}

type ViewMode = "map" | "devices" | "links";

function SiteBody({ accountId, siteId }: { accountId: string; siteId: string }) {
  const site = useApp((s) => s.sites.find((x) => x.id === siteId && x.accountId === accountId));
  const allFloors = useApp((s) => s.floors);
  const allDevices = useApp((s) => s.devices);
  const role = useRole(accountId);
  const floors = useMemo(() => allFloors.filter((f) => f.siteId === siteId).sort((a, b) => a.order - b.order), [allFloors, siteId]);
  const [floorId, setFloorId] = useState<string | undefined>();
  const [mode, setMode] = useState<ViewMode>("map");
  const [floorSettings, setFloorSettings] = useState<Floor | null>(null);
  const addFloor = useApp((s) => s.addFloor);
  const resetEditor = useEditor((s) => s.reset);
  const focusOn = useEditor((s) => s.focusOn);
  const selection = useEditor((s) => s.selection);
  const assistantOpen = useEditor((s) => s.assistantOpen);
  const setAssistantOpen = useEditor((s) => s.setAssistantOpen);
  const allWalls = useApp((s) => s.walls);

  useEffect(() => resetEditor(), [siteId, resetEditor]);

  const floor = floors.find((f) => f.id === floorId) ?? floors.find((f) => f.order === Math.max(...floors.map((x) => x.order))) ?? floors[0];
  const canEdit = can.edit(role);

  if (!site || !can.view(role)) {
    return (
      <div className="w-full p-6">
        <Empty>אין לך גישה לאתר הזה.</Empty>
      </div>
    );
  }

  const gotoDevice = (id: string) => {
    const d = allDevices.find((x) => x.id === id);
    if (!d) return;
    setMode("map");
    setFloorId(d.floorId);
    focusOn(id);
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {/* sub header: floors + view mode + search */}
      <div className="z-20 flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-2 py-1.5 sm:flex-nowrap sm:px-3">
        <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
          {(
            [
              ["map", "מפה", MapIcon],
              ["devices", "ציוד", List],
              ["links", "חיבורים", Waypoints],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cx("flex h-8 items-center gap-1 rounded-md px-2.5 text-sm", mode === m ? "bg-white font-medium shadow-sm" : "text-slate-500")}
            >
              <Icon size={15} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
        {mode === "map" && (
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {floors.map((f) => (
              <button
                key={f.id}
                onClick={() => setFloorId(f.id)}
                onDoubleClick={() => canEdit && setFloorSettings(f)}
                className={cx(
                  "flex h-8 shrink-0 items-center gap-1 rounded-lg px-3 text-sm",
                  f.id === floor?.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {f.name}
                {f.id === floor?.id && canEdit && (
                  <Settings2
                    size={14}
                    className="opacity-70 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFloorSettings(f);
                    }}
                  />
                )}
              </button>
            ))}
            {canEdit && (
              <button
                onClick={async () => {
                  const name = await askText({ title: "קומה / אזור חדש", label: "שם הקומה או האזור", value: `קומה ${floors.length + 1}` });
                  if (name?.trim()) setFloorId(addFloor(siteId, name.trim()));
                }}
                className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-sm text-slate-500 hover:bg-slate-100"
              >
                <Plus size={15} /> קומה
              </button>
            )}
          </div>
        )}
        {mode !== "map" && <div className="flex-1" />}
        <SiteSearch siteId={siteId} onPick={gotoDevice} />
      </div>

      {mode === "map" && floor && (
        <div className="relative flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1">
            <MapCanvas key={floor.id} floor={floor} canEdit={canEdit} />
            <Toolbar canEdit={canEdit} />
            <LayersPanel />
            {!floor.plan && canEdit && !assistantOpen && !allWalls.some((w) => w.floorId === floor.id) && (
              <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-wrap justify-center gap-2">
                <Button variant="primary" className="bg-violet-600 hover:bg-violet-700" onClick={() => setAssistantOpen(true)}>
                  <Sparkles size={16} /> תאר את השטח לעוזר
                </Button>
                <Button onClick={() => setFloorSettings(floor)}>
                  <FileUp size={16} /> העלה תוכנית
                </Button>
              </div>
            )}
          </div>
          {(selection || assistantOpen) && (
            <SidePanel
              details={selection ? <DetailsPanel accountId={accountId} canEdit={canEdit} onGoto={gotoDevice} /> : null}
              assistant={assistantOpen ? <SpaceAssistant key={`assistant-${floor.id}`} floor={floor} canEdit={canEdit} /> : null}
            />
          )}
        </div>
      )}
      {mode === "map" && !floor && (
        <div className="p-6">
          <Empty>אין קומות באתר. הוסף קומה כדי להתחיל.</Empty>
        </div>
      )}
      {mode === "devices" && <DevicesTable siteId={siteId} onPick={gotoDevice} />}
      {mode === "links" && <LinksTable siteId={siteId} onPick={gotoDevice} />}

      {floorSettings && <FloorSettings floor={floorSettings} onClose={() => setFloorSettings(null)} onDeleted={() => setFloorId(undefined)} />}
    </div>
  );
}

/**
 * One side panel for the selection details and the space assistant: a column next to the map on
 * desktop, a bottom sheet on phones. When both are open they share it as tabs, so the map is never covered.
 */
function SidePanel({ details, assistant }: { details: React.ReactNode; assistant: React.ReactNode }) {
  const sideTab = useEditor((s) => s.sideTab);
  const setSideTab = useEditor((s) => s.setSideTab);
  const select = useEditor((s) => s.select);
  const both = !!details && !!assistant;
  const show = both ? sideTab : assistant ? "assistant" : "details";
  return (
    <aside className="absolute inset-x-0 bottom-0 z-30 flex h-[65%] flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.12)] md:static md:h-auto md:w-[400px] md:shrink-0 md:rounded-none md:border-s md:border-slate-200 md:shadow-none">
      <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-300 md:hidden" />
      {both && (
        <div className="flex shrink-0 gap-1 border-b border-slate-200 px-2 pt-2">
          {(
            [
              ["assistant", "עוזר שטח"],
              ["details", "פרטים"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSideTab(id)}
              className={cx(
                "flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-1.5 text-sm",
                show === id ? "border-violet-600 font-semibold text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {id === "assistant" && <Sparkles size={14} className="text-violet-600" />}
              {label}
              {id === "details" && (
                <span
                  role="button"
                  aria-label="סגור פרטים"
                  onClick={(e) => {
                    e.stopPropagation();
                    select(null);
                  }}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
                >
                  ×
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {/* both stay mounted so a running assistant request isn't cancelled by switching tabs */}
      {assistant && <div className={cx("min-h-0 flex-1 flex-col", show === "assistant" ? "flex" : "hidden")}>{assistant}</div>}
      {details && <div className={cx("min-h-0 flex-1 flex-col", show === "details" ? "flex" : "hidden")}>{details}</div>}
    </aside>
  );
}

function SiteSearch({ siteId, onPick }: { siteId: string; onPick: (id: string) => void }) {
  const devices = useApp((s) => s.devices);
  const floors = useApp((s) => s.floors);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return devices
      .filter((d) => d.siteId === siteId)
      .filter((d) =>
        [d.label, d.net.ip, d.net.mac, d.model, d.serial, d.extra.pointNo, d.extra.zone, d.extra.channel, deviceTypeById(d.type).label]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(t)),
      )
      .slice(0, 12);
  }, [q, devices, siteId]);
  return (
    <div className="relative order-last w-full sm:order-none sm:w-64 sm:shrink-0">
      <Search size={15} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="חיפוש: שם, IP, MAC, נקודה…"
        className="h-8 ps-8"
      />
      {open && results.length > 0 && (
        <div className="absolute end-0 top-10 z-50 w-72 rounded-xl bg-white p-1 shadow-xl ring-1 ring-slate-200">
          {results.map((d) => {
            const def = deviceTypeById(d.type);
            const Icon = def.icon;
            return (
              <button
                key={d.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(d.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm hover:bg-slate-50"
              >
                <Icon size={15} style={{ color: layerById(def.layer).color }} />
                <span className="flex-1 truncate">{d.label}</span>
                {d.net.ip && <span className="ltr text-xs text-slate-400">{d.net.ip}</span>}
                <span className="text-[11px] text-slate-400">{floors.find((f) => f.id === d.floorId)?.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FloorSettings({ floor, onClose, onDeleted }: { floor: Floor; onClose: () => void; onDeleted: () => void }) {
  const live = useApp((s) => s.floors.find((f) => f.id === floor.id)) ?? floor;
  const updateFloor = useApp((s) => s.updateFloor);
  const deleteFloor = useApp((s) => s.deleteFloor);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        setBusy("קורא PDF…");
        const pages = await pdfPageCount(file);
        let page = 1;
        if (pages > 1) {
          const ans = await askText({ title: "בחירת עמוד", label: `ב-PDF יש ${pages} עמודים. איזה עמוד להציג כתוכנית?`, value: "1", inputMode: "decimal" });
          if (!ans) return;
          page = Number(ans) || 1;
        }
        setBusy("ממיר עמוד לתמונה…");
        const r = await storePdfPage(file, page);
        updateFloor(floor.id, { plan: { src: r.src, width: r.width, height: r.height }, pxPerMeter: undefined });
      } else {
        setBusy("מעבד תמונה…");
        const r = await storeImageFile(file, 3000);
        updateFloor(floor.id, { plan: r, pxPerMeter: undefined });
      }
      onClose();
    } catch (err) {
      console.error(err);
      void showAlert("שגיאה בקריאת הקובץ", "לא הצלחתי לקרוא את הקובץ. נסו תמונה (JPG/PNG) או PDF.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Modal title="הגדרות קומה" onClose={onClose}>
      <Field label="שם הקומה">
        <Input value={live.name} onChange={(e) => updateFloor(floor.id, { name: e.target.value })} />
      </Field>
      <div className="rounded-xl bg-slate-50 p-3">
        <div className="mb-1 text-sm font-medium">תוכנית קומה</div>
        <p className="mb-2 text-xs text-slate-500">
          תמונה (JPG/PNG), צילום של שרטוט, או PDF של אדריכל. אחרי ההעלאה כדאי לכייל את קנה המידה עם הכלי <b>כיול</b> בסרגל הכלים.
        </p>
        <Button variant="primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          <FileUp size={16} /> {busy ?? (live.plan ? "החלף תוכנית" : "העלה תוכנית")}
        </Button>
        <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        {live.plan && <p className="mt-2 text-[11px] text-slate-500">החלפת תוכנית שומרת את מיקומי הציוד, ומאפסת את כיול קנה המידה.</p>}
      </div>
      <div className="text-sm text-slate-600">
        קנה מידה: {live.pxPerMeter ? `מכויל (${live.pxPerMeter.toFixed(1)} פיקסלים למטר)` : "לא מכויל"}
      </div>
      <Button
        variant="danger"
        size="sm"
        onClick={async () => {
          if (await askConfirm({ title: "מחיקת קומה", message: `למחוק את "${live.name}" עם כל הציוד, הכבלים והקירות שבה?`, danger: true, okLabel: "מחק" })) {
            deleteFloor(floor.id);
            onDeleted();
            onClose();
          }
        }}
      >
        <Trash2 size={14} /> מחק קומה
      </Button>
    </Modal>
  );
}

function DevicesTable({ siteId, onPick }: { siteId: string; onPick: (id: string) => void }) {
  const devices = useApp((s) => s.devices);
  const floors = useApp((s) => s.floors);
  const [layer, setLayer] = useState<string>("all");
  const rows = devices
    .filter((d) => d.siteId === siteId)
    .filter((d) => layer === "all" || deviceTypeById(d.type).layer === layer)
    .sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label, "he"));
  const layersInUse = [...new Set(devices.filter((d) => d.siteId === siteId).map((d) => deviceTypeById(d.type).layer))];
  return (
    <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap gap-1">
        <FilterChip active={layer === "all"} onClick={() => setLayer("all")}>
          הכל ({devices.filter((d) => d.siteId === siteId).length})
        </FilterChip>
        {layersInUse.map((l) => (
          <FilterChip key={l} active={layer === l} onClick={() => setLayer(l)} color={layerById(l).color}>
            {layerById(l).label}
          </FilterChip>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {["שם", "סוג", "קומה", "IP", "MAC", "דגם", "פרט"].map((h) => (
                <th key={h} className="px-3 py-2 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((d) => {
              const def = deviceTypeById(d.type);
              const Icon = def.icon;
              return (
                <tr key={d.id} onClick={() => onPick(d.id)} className="cursor-pointer hover:bg-blue-50/50">
                  <td className="px-3 py-2 font-medium">
                    <span className="flex items-center gap-2">
                      <Icon size={15} style={{ color: layerById(def.layer).color }} /> {d.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{def.label}</td>
                  <td className="px-3 py-2 text-slate-600">{floors.find((f) => f.id === d.floorId)?.name}</td>
                  <td className="ltr px-3 py-2 text-end font-mono text-xs">{d.net.ip}</td>
                  <td className="ltr px-3 py-2 text-end font-mono text-xs">{d.net.mac}</td>
                  <td className="ltr px-3 py-2 text-end text-xs">{d.model}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {d.extra.pointNo && `נקודה ${d.extra.pointNo}`}
                    {d.extra.channel && `ערוץ ${d.extra.channel}`}
                    {d.extra.zone && `אזור ${d.extra.zone}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LinksTable({ siteId, onPick }: { siteId: string; onPick: (id: string) => void }) {
  const links = useApp((s) => s.links);
  const devices = useApp((s) => s.devices);
  const floors = useApp((s) => s.floors);
  const rows = links.filter((l) => l.siteId === siteId && l.kind === "cable");
  const name = (id?: string) => devices.find((d) => d.id === id)?.label ?? "—";
  return (
    <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {["צד א׳", "פורט", "", "צד ב׳", "פורט", "סוג כבל", "אורך", "קומה"].map((h, i) => (
                <th key={i} className="px-3 py-2 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((l) => {
              const t = linkTypeById(l.cableType);
              const fl = floors.find((f) => f.id === l.floorId);
              const len = linkLengthM(l, fl?.pxPerMeter);
              return (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <button className="hover:underline" onClick={() => l.a && onPick(l.a.deviceId)}>
                      {name(l.a?.deviceId)}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{l.a?.port}</td>
                  <td className="px-1 text-slate-300">⟷</td>
                  <td className="px-3 py-2">
                    <button className="hover:underline" onClick={() => l.b && onPick(l.b.deviceId)}>
                      {name(l.b?.deviceId)}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{l.b?.port}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="h-1 w-4 rounded" style={{ background: l.color || t.color }} />
                      {t.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{len ? `${len.toFixed(1)} מ׳` : ""}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{fl?.name ?? "בין קומות"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={cx("flex h-8 items-center gap-1.5 rounded-full px-3 text-sm ring-1", active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200")}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}
