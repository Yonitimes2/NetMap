"use client";

import { Package, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Input, Modal, cx } from "../ui";
import { BoxIcons } from "./ProductIcons";
import { FAMILY_LABEL, categoriesFor, fitsSystem, useCatalog } from "@/lib/products/client";
import { CATEGORY_LABEL, FORM_LABEL, paramChips, type CatalogCategory, type FormFactor, type LensType, type ProductSummary } from "@/lib/products/types";
import type { Device } from "@/lib/types";

/** Choose the catalog model for a device on the map: filtered to its kind, same-brand models first. */
export function ProductPicker({
  deviceType,
  siteDevices,
  current,
  onPick,
  onClose,
}: {
  deviceType: string;
  siteDevices: Device[];
  current?: string;
  onPick: (p: ProductSummary) => void;
  onClose: () => void;
}) {
  const { products, error, loading, load } = useCatalog();
  useEffect(() => {
    void load();
  }, [load]);

  const cats = useMemo(() => categoriesFor(deviceType) ?? [], [deviceType]);
  const camera = deviceType.startsWith("cam-");
  const [cat, setCat] = useState<CatalogCategory | "all">(deviceType === "cam-ptz" ? "ptz" : camera ? "ip-camera" : (cats[0] ?? "all"));
  const [q, setQ] = useState("");
  const [mp, setMp] = useState<number | null>(null);
  const [form, setForm] = useState<FormFactor | null>(null);
  const [lens, setLens] = useState<LensType | null>(null);
  const [colorNight, setColorNight] = useState(false);
  const [size, setSize] = useState<number | null>(null);

  const available = useMemo(() => (products ?? []).filter((p) => cats.includes(p.category)), [products, cats]);
  const catCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of available) c[p.category] = (c[p.category] ?? 0) + 1;
    return c;
  }, [available]);

  // the default category may have nothing yet: then show every kind
  const activeCat = cat !== "all" && !catCounts[cat] ? "all" : cat;

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = available.filter((p) => {
      const s = p.params;
      if (activeCat !== "all" && p.category !== activeCat) return false;
      if (t && !p.model.toLowerCase().includes(t) && !p.name.toLowerCase().includes(t)) return false;
      if (camera) {
        if (mp !== null && (mp === 8 ? (s.mp ?? 0) < 8 : s.mp !== mp)) return false;
        if (form && s.formFactor !== form) return false;
        if (lens && s.lensType !== lens) return false;
        if (colorNight && !s.colorNight) return false;
      } else if (size !== null) {
        const n = deviceType === "nvr" ? s.channels : s.ports;
        if (n === undefined || (size >= 32 ? n < size : n !== size)) return false;
      }
      return true;
    });
    // the site's camera brand first, then by resolution / size and model
    return list.sort(
      (a, b) =>
        Number(fitsSystem(b.brandName, siteDevices)) - Number(fitsSystem(a.brandName, siteDevices)) ||
        (a.params.mp ?? a.params.channels ?? a.params.ports ?? 0) - (b.params.mp ?? b.params.channels ?? b.params.ports ?? 0) ||
        a.model.localeCompare(b.model),
    );
  }, [available, activeCat, q, mp, form, lens, colorNight, size, camera, deviceType, siteDevices]);

  return (
    <Modal title={`בחירת דגם: ${FAMILY_LABEL(deviceType)}`} onClose={onClose}>
      {error ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>
      ) : !products || loading ? (
        <p className="p-6 text-center text-sm text-slate-400">טוען את מאגר המוצרים…</p>
      ) : !available.length ? (
        <p className="p-6 text-center text-sm text-slate-500">אין עדיין מוצרים מהסוג הזה במאגר.</p>
      ) : (
        <>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי דגם או תיאור" className="ps-8" type="search" />
          </div>
          {Object.keys(catCounts).length > 1 && (
            <Chips>
              {(Object.keys(catCounts) as CatalogCategory[]).map((c) => (
                <Chip key={c} active={activeCat === c} onClick={() => setCat(activeCat === c ? "all" : c)}>
                  {CATEGORY_LABEL[c]} ({catCounts[c]})
                </Chip>
              ))}
            </Chips>
          )}
          {camera ? (
            <>
              <Chips>
                {[2, 4, 5, 6, 8].map((m) => (
                  <Chip key={m} active={mp === m} onClick={() => setMp(mp === m ? null : m)}>
                    {m === 8 ? "8MP+" : `${m}MP`}
                  </Chip>
                ))}
                {(["bullet", "dome", "turret"] as FormFactor[]).map((f) => (
                  <Chip key={f} active={form === f} onClick={() => setForm(form === f ? null : f)}>
                    {FORM_LABEL[f]}
                  </Chip>
                ))}
              </Chips>
              <Chips>
                {(
                  [
                    ["fixed", "עדשה קבועה"],
                    ["vf", "משתנה"],
                    ["mvf", "ממונעת"],
                  ] as [LensType, string][]
                ).map(([l, label]) => (
                  <Chip key={l} active={lens === l} onClick={() => setLens(lens === l ? null : l)}>
                    {label}
                  </Chip>
                ))}
                <Chip active={colorNight} onClick={() => setColorNight(!colorNight)}>
                  צבע בלילה
                </Chip>
              </Chips>
            </>
          ) : (
            (deviceType === "nvr" || deviceType === "switch") && (
              <Chips>
                {(deviceType === "nvr" ? [4, 8, 16, 32] : [4, 8, 16, 24]).map((n) => (
                  <Chip key={n} active={size === n} onClick={() => setSize(size === n ? null : n)}>
                    {n}
                    {n >= 32 || (deviceType === "switch" && n >= 24) ? "+" : ""} {deviceType === "nvr" ? "ערוצים" : "פורטים"}
                  </Chip>
                ))}
              </Chips>
            )
          )}
          <p className="text-xs text-slate-500">{shown.length} דגמים</p>
          <div className="-mx-1 space-y-1.5">
            {shown.slice(0, 80).map((p) => (
              <ProductRow key={p.id} p={p} active={p.id === current} fits={fitsSystem(p.brandName, siteDevices)} onClick={() => onPick(p)} />
            ))}
            {shown.length > 80 && <p className="p-2 text-center text-xs text-slate-400">מוצגים 80 הראשונים. צמצמו בחיפוש או בסינון.</p>}
          </div>
        </>
      )}
    </Modal>
  );
}

function ProductRow({ p, active, fits, onClick }: { p: ProductSummary; active: boolean; fits: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cx("flex w-full gap-3 rounded-xl p-2 text-start ring-1", active ? "bg-blue-50 ring-blue-300" : "ring-slate-200 hover:bg-slate-50 active:bg-slate-100")}>
      <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-50">
        {p.imageId ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by our API with the session cookie
          <img src={`/api/catalog/images/${p.imageId}?w=160`} alt="" loading="lazy" className="size-full object-contain" />
        ) : (
          <Package size={20} className="text-slate-300" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="ltr truncate text-sm font-semibold">{p.model}</span>
          <span className="shrink-0 text-[11px] text-slate-400">{p.brandName}</span>
        </span>
        <span className="line-clamp-1 text-xs text-slate-500">{p.name}</span>
        <span className="mt-1 flex flex-wrap gap-1">
          {paramChips(p.category, p.params)
            .slice(0, 6)
            .map((c) => (
              <span key={c} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                {c}
              </span>
            ))}
        </span>
        {p.boxIcons.length > 0 && (
          <span className="mt-1 block">
            <BoxIcons icons={p.boxIcons} />
          </span>
        )}
        {!fits && <span className="mt-1 block text-[11px] text-amber-700">מותג אחר מהמצלמות באתר: לא תואם למערך הקיים</span>}
      </span>
    </button>
  );
}

function Chips({ children }: { children: React.ReactNode }) {
  return <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 [&>*]:shrink-0">{children}</div>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cx("flex h-9 items-center rounded-full px-3 text-sm ring-1 sm:h-8", active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200")}>
      {children}
    </button>
  );
}
