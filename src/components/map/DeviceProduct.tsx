"use client";

import { AlertTriangle, Crosshair, Info, Package, Pencil, Replace, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { Badge, Button } from "../ui";
import { useEditor } from "./editor-store";
import { ProductPicker } from "../catalog/ProductPicker";
import { ProductModal } from "../catalog/ProductDetails";
import { ParamEditor } from "../catalog/ParamEditor";
import { BoxIcons, GeneralBadges, TechTiles, generalBadges, techTiles } from "../catalog/ProductIcons";
import { brandWarning, categoriesFor, productPatch, specPatch } from "@/lib/products/client";
import { PARAM_FIELDS, formatParam, type ProductParams } from "@/lib/products/types";
import { toast } from "@/lib/toast";
import type { Device } from "@/lib/types";

/** How many parameters show before "more". */
const FIRST_FIELDS = 9;

/**
 * The catalog model of a device on the map: choose it, see what it includes, and adjust its
 * parameters for this device (they start as the catalog's values).
 */
export function DeviceProductSection({ d, siteDevices, ro, onChange }: { d: Device; siteDevices: Device[]; ro: boolean; onChange: (patch: Partial<Device>) => void }) {
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [details, setDetails] = useState(false);
  const setAim = useEditor((s) => s.setAim);
  const cats = categoriesFor(d.type);
  if (!cats && !d.product) return null;

  const camera = d.type.startsWith("cam-");
  /** suggest a model for the spot: aim the camera first (it needs a view on the map for that) */
  const suggest = () => {
    if (!d.camera) onChange({ camera: { dir: 0, fov: 90, range: 10 } });
    setAim(d.id);
  };

  const picker = picking && (
    <ProductPicker
      deviceType={d.type}
      siteDevices={siteDevices}
      current={d.product?.id}
      onClose={() => setPicking(false)}
      onPick={(p) => {
        onChange(productPatch(d, p));
        setPicking(false);
        toast(`נבחר דגם ${p.model}. השדות מולאו מהמאגר, ואפשר לשנות אותם.`);
      }}
    />
  );

  if (!d.product) {
    if (ro) return null;
    return (
      <div className="space-y-2 border-b border-slate-100 px-4 py-3">
        {camera && (
          <button onClick={suggest} className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-red-200 bg-red-50/50 p-3 text-start hover:bg-red-50">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-red-600 text-white">
              <Crosshair size={20} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-red-900">הצעת מצלמה למיקום</span>
              <span className="block text-xs text-red-800/70">מכוונים במפה, עונים על שאלה או שתיים ומקבלים דגמים מתאימים</span>
            </span>
          </button>
        )}
        <button onClick={() => setPicking(true)} className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-3 text-start hover:bg-blue-50">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-600 text-white">
            <Package size={20} />
          </span>
          <span>
            <span className="block text-sm font-semibold text-blue-900">בחירת דגם מהמאגר</span>
            <span className="block text-xs text-blue-800/70">הרזולוציה, העדשה, הזווית, ההזנה והאנליטיקה יתמלאו לבד</span>
          </span>
        </button>
        {picker}
      </div>
    );
  }

  const p = d.product;
  const spec = d.spec ?? {};
  const fields = PARAM_FIELDS[p.category] ?? [];
  const changed = (k: keyof ProductParams) => JSON.stringify(spec[k] ?? null) !== JSON.stringify(p.defaults[k] ?? null);
  const filled = fields.filter((f) => spec[f.key] !== undefined || changed(f.key));
  const visible = all ? fields : filled.slice(0, FIRST_FIELDS);
  const nChanged = fields.filter((f) => changed(f.key)).length;
  const warning = brandWarning(d, siteDevices);

  return (
    <div className="space-y-3 border-b border-slate-100 px-4 py-3">
      <div className="flex gap-3">
        <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-200">
          {p.imageId ? (
            // eslint-disable-next-line @next/next/no-img-element -- served by our API with the session cookie
            <img src={`/api/catalog/images/${p.imageId}?w=160`} alt="" className="size-full object-contain" />
          ) : (
            <Package size={20} className="text-slate-300" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-slate-400">{p.brand}</div>
          <div className="ltr text-end font-semibold">{p.model}</div>
          <div className="line-clamp-2 text-xs text-slate-500">{p.name}</div>
        </div>
      </div>

      {warning && (
        <p className="flex gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {warning}
        </p>
      )}

      {p.boxIcons && p.boxIcons.length > 0 && <BoxIcons icons={p.boxIcons} />}
      <TechTiles tiles={techTiles(p.category, spec)} size="sm" />
      <GeneralBadges compact badges={generalBadges(p.category, spec, p.boxIcons)} />

      <div className="rounded-xl bg-slate-50 px-3 py-1">
        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs font-semibold text-slate-600">מאפיינים</span>
          {nChanged > 0 && <span className="text-[11px] text-amber-700">{nChanged} שונו מהמאגר</span>}
        </div>
        <div className="divide-y divide-slate-200/70">
          {visible.map((f) => (
            <div key={f.key} className="py-1.5">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-32 shrink-0 text-xs text-slate-500">{f.label}</span>
                <span className={spec[f.key] === undefined ? "min-w-0 flex-1 text-slate-300" : "min-w-0 flex-1"}>{formatParam(f, spec[f.key])}</span>
                {changed(f.key) && <Badge color="amber">שונה</Badge>}
                {!ro && (
                  <button onClick={() => setEditing(editing === f.key ? null : f.key)} className="rounded p-1.5 text-slate-400 hover:bg-white" aria-label={`שינוי ${f.label}`}>
                    <Pencil size={13} />
                  </button>
                )}
                {!ro && changed(f.key) && (
                  <button
                    onClick={() => onChange(specPatch(d, f.key, p.defaults[f.key]))}
                    className="rounded p-1.5 text-slate-400 hover:bg-white"
                    title={`חזרה לערך מהמאגר: ${formatParam(f, p.defaults[f.key])}`}
                    aria-label="חזרה לערך מהמאגר"
                  >
                    <RotateCcw size={13} />
                  </button>
                )}
              </div>
              {editing === f.key && (
                <ParamEditor
                  field={f}
                  value={spec[f.key]}
                  onCancel={() => setEditing(null)}
                  onSave={(v) => {
                    setEditing(null);
                    onChange(specPatch(d, f.key, v));
                  }}
                />
              )}
            </div>
          ))}
        </div>
        {(fields.length > visible.length || all) && (
          <button onClick={() => setAll(!all)} className="w-full py-2 text-center text-xs font-medium text-blue-700">
            {all ? "פחות" : `כל המאפיינים (${fields.length})`}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {!ro && (
          <Button size="sm" onClick={() => setPicking(true)}>
            <Replace size={14} /> החלפת דגם
          </Button>
        )}
        {!ro && camera && (
          <Button size="sm" onClick={suggest}>
            <Crosshair size={14} /> הצעה לפי המיקום
          </Button>
        )}
        <Button size="sm" onClick={() => setDetails(true)}>
          <Info size={14} /> כל פרטי המוצר
        </Button>
        {!ro && (
          <Button size="sm" variant="ghost" onClick={() => onChange({ product: undefined, spec: undefined })}>
            <X size={14} /> בלי דגם
          </Button>
        )}
      </div>
      {picker}
      {details && (
        <ProductModal
          id={p.id}
          onClose={() => setDetails(false)}
          footer={
            <Button variant="ghost" onClick={() => setDetails(false)}>
              סגירה
            </Button>
          }
        />
      )}
    </div>
  );
}
