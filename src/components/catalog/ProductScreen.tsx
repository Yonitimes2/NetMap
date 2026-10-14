"use client";

import { ExternalLink, FileText, Pencil, RotateCcw } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../AppShell";
import { Badge, Button, Field, Input, Select, cx } from "../ui";
import { authApi, useSession } from "@/lib/session-client";
import { toast } from "@/lib/toast";
import { DEVICE_TYPES } from "@/lib/catalog";
import { CATEGORY_LABEL, PARAM_FIELDS, formatParam, type CatalogCategory, type Dori, type ParamField, type ProductFull } from "@/lib/products/types";

/** One catalog product: images, planning parameters (with corrections) and the full spec table. */
export function ProductScreen() {
  const { id } = useParams<{ id: string }>();
  const me = useSession((s) => s.user);
  const [product, setProduct] = useState<ProductFull | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    authApi<{ product: ProductFull }>(`/api/catalog/products/${id}`, "GET")
      .then((r) => alive && setProduct(r.product))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  const save = async (patch: Record<string, unknown>) => {
    try {
      const r = await authApi<{ product: ProductFull }>(`/api/catalog/products/${id}`, "PATCH", patch);
      setProduct(r.product);
      toast("נשמר");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const isAdmin = me?.role === "admin";
  return (
    <AppShell crumbs={[{ label: "מאגר מוצרים", href: "/admin/catalog" }, { label: product?.model ?? "" }]}>
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        {error ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        ) : !product ? (
          <p className="p-10 text-center text-slate-400">טוען…</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="space-y-4">
              <Gallery ids={product.imageIds} />
              <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <div className="ltr text-end text-xs text-slate-400">{product.brandName}</div>
                <h1 className="ltr text-end text-xl font-bold">{product.model}</h1>
                <p className="mt-1 text-sm font-medium text-slate-700">{product.name}</p>
                {product.description && <p className="mt-2 text-sm leading-relaxed text-slate-600">{product.description}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.pageUrl && (
                    <a href={product.pageUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm ring-1 ring-slate-200 hover:bg-slate-50">
                      <ExternalLink size={15} /> דף המוצר באתר
                    </a>
                  )}
                  {product.datasheetUrl && (
                    <a href={product.datasheetUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm ring-1 ring-slate-200 hover:bg-slate-50">
                      <FileText size={15} /> דף נתונים (PDF)
                    </a>
                  )}
                </div>
                {product.msrp && <p className="mt-2 text-xs text-slate-500">מחיר מומלץ לצרכן באתר: ₪{product.msrp.toLocaleString("he-IL")}</p>}
                {product.fetchedAt && <p className="mt-1 text-xs text-slate-400">נקרא מהאתר: {new Date(product.fetchedAt).toLocaleString("he-IL")}</p>}
              </section>
              {isAdmin && <Placement product={product} onSave={save} />}
            </div>

            <div className="space-y-4">
              <Params product={product} editable={isAdmin} onSave={save} />
              {product.overview.length > 0 && (
                <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <h2 className="mb-2 font-semibold">עיקרי המוצר</h2>
                  <ul className="ltr list-inside list-disc space-y-0.5 text-start text-sm text-slate-700">
                    {product.overview.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                </section>
              )}
              <Specs product={product} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Gallery({ ids }: { ids: string[] }) {
  const [current, setCurrent] = useState(0);
  if (!ids.length) return <div className="grid aspect-square place-items-center rounded-2xl bg-white text-sm text-slate-400 ring-1 ring-slate-200">אין תמונה</div>;
  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
      {/* eslint-disable-next-line @next/next/no-img-element -- served by our API with the session cookie */}
      <img src={`/api/catalog/images/${ids[Math.min(current, ids.length - 1)]}`} alt="" className="mx-auto aspect-square max-h-72 w-full object-contain lg:max-h-none" />
      {ids.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {ids.map((id, i) => (
            <button key={id} onClick={() => setCurrent(i)} className={cx("size-14 shrink-0 overflow-hidden rounded-lg ring-2", i === current ? "ring-blue-500" : "ring-transparent")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/catalog/images/${id}`} alt="" loading="lazy" className="size-full object-contain" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Category, the equipment type it is placed as on the map, and status. */
function Placement({ product, onSave }: { product: ProductFull; onSave: (p: Record<string, unknown>) => void }) {
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="font-semibold">שיוך</h2>
      <Field label="קטגוריה">
        <Select value={product.category} onChange={(e) => onSave({ category: e.target.value })}>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="סוג ציוד במפה">
        <Select value={product.deviceType} onChange={(e) => onSave({ deviceType: e.target.value })}>
          {DEVICE_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="מצב">
        <Select value={product.status} onChange={(e) => onSave({ status: e.target.value })}>
          <option value="active">פעיל</option>
          <option value="review">לבדיקה</option>
          <option value="discontinued">לא באתר / הופסק</option>
        </Select>
      </Field>
    </section>
  );
}

function Params({ product, editable, onSave }: { product: ProductFull; editable: boolean; onSave: (p: Record<string, unknown>) => void }) {
  const fields = PARAM_FIELDS[product.category as CatalogCategory] ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  if (!fields.length) return null;
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="font-semibold">פרמטרים לתכנון</h2>
      <p className="mb-2 text-xs text-slate-500">נקראו מהאתר. אפשר לתקן כל ערך; עדכון מהאתר לא ידרוס תיקון.</p>
      <div className="divide-y divide-slate-100">
        {fields.map((f) => {
          const overridden = f.key in product.overrides;
          const value = product.params[f.key];
          return (
            <div key={f.key} className="py-2">
              <div className="flex items-center gap-2">
                <span className="w-36 shrink-0 text-sm text-slate-500">{f.label}</span>
                <span className={cx("min-w-0 flex-1 text-sm", value === undefined ? "text-slate-300" : "font-medium")}>{formatParam(f, value)}</span>
                {overridden && <Badge color="amber">תוקן</Badge>}
                {editable && (
                  <>
                    <button onClick={() => setEditing(editing === f.key ? null : f.key)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" aria-label={`עריכת ${f.label}`}>
                      <Pencil size={14} />
                    </button>
                    {overridden && (
                      <button onClick={() => onSave({ overrides: { [f.key]: null } })} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" title="חזרה לערך מהאתר" aria-label="חזרה לערך מהאתר">
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </>
                )}
              </div>
              {overridden && <div className="ms-38 text-xs text-slate-400">מהאתר: {formatParam(f, product.sourceParams[f.key])}</div>}
              {editing === f.key && (
                <ParamEditor
                  field={f}
                  value={value}
                  onCancel={() => setEditing(null)}
                  onSave={(v) => {
                    setEditing(null);
                    onSave({ overrides: { [f.key]: v } });
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ParamEditor({ field: f, value, onSave, onCancel }: { field: ParamField; value: unknown; onSave: (v: unknown) => void; onCancel: () => void }) {
  const [v, setV] = useState<unknown>(value);
  const numIn = (x: unknown, set: (n: number | undefined) => void, ph?: string) => (
    <Input type="number" inputMode="decimal" step="any" placeholder={ph} value={x === undefined || x === null ? "" : String(x)} onChange={(e) => set(e.target.value === "" ? undefined : Number(e.target.value))} />
  );
  let input: React.ReactNode;
  switch (f.kind) {
    case "number":
      input = numIn(v, setV);
      break;
    case "text":
      input = <Input value={(v as string) ?? ""} onChange={(e) => setV(e.target.value)} />;
      break;
    case "bool":
      input = (
        <Select value={v === true ? "1" : v === false ? "0" : ""} onChange={(e) => setV(e.target.value === "" ? undefined : e.target.value === "1")}>
          <option value="">—</option>
          <option value="1">כן</option>
          <option value="0">לא</option>
        </Select>
      );
      break;
    case "select":
      input = (
        <Select value={(v as string) ?? ""} onChange={(e) => setV(e.target.value || undefined)}>
          <option value="">—</option>
          {f.options.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
      );
      break;
    case "list":
      input = <Input value={Array.isArray(v) ? v.join(", ") : ""} placeholder="מופרדים בפסיקים" onChange={(e) => setV(e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />;
      break;
    case "range": {
      const r = (v as [number, number] | undefined) ?? [undefined, undefined];
      input = (
        <div className="flex gap-2">
          {numIn(r[0], (n) => setV([n, r[1] ?? n]), "מ-")}
          {numIn(r[1], (n) => setV([r[0] ?? n, n]), "עד")}
        </div>
      );
      break;
    }
    case "dori": {
      const d = (v as Dori | undefined) ?? {};
      input = (
        <div className="grid grid-cols-3 gap-2">
          {numIn(d.detect, (n) => setV({ ...d, detect: n }), "גילוי")}
          {numIn(d.recognize, (n) => setV({ ...d, recognize: n }), "זיהוי")}
          {numIn(d.identify, (n) => setV({ ...d, identify: n }), "ודאי")}
        </div>
      );
      break;
    }
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2">
      <div className="min-w-0 flex-1">{input}</div>
      <Button size="sm" variant="primary" onClick={() => onSave(v === undefined ? null : v)}>
        שמירה
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        ביטול
      </Button>
    </div>
  );
}

function Specs({ product }: { product: ProductFull }) {
  if (!product.specs.length) return null;
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="mb-2 font-semibold">מפרט מלא</h2>
      <div className="space-y-2">
        {product.specs.map((g) => (
          <details key={g.group} className="group rounded-xl bg-slate-50 px-3 py-2" open={/video|lens|housing|poe|interface|storage/i.test(g.group)}>
            <summary className="ltr cursor-pointer text-end text-sm font-semibold">{g.group}</summary>
            <dl className="ltr mt-1 divide-y divide-slate-200/70 text-start text-xs">
              {g.items.map((i) => (
                <div key={i.k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 py-1">
                  <dt className="text-slate-500">{i.k}</dt>
                  <dd className="whitespace-pre-line text-slate-800">{i.v}</dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
      </div>
    </section>
  );
}
