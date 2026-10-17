"use client";

import { ExternalLink, FileText, Maximize2, Pencil, RotateCcw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Badge, Modal, cx } from "../ui";
import { authApi } from "@/lib/session-client";
import { useSeesPrices } from "@/lib/access";
import { BoxIcons, GeneralBadges, TechTiles, generalBadges, techTiles } from "./ProductIcons";
import { ParamEditor } from "./ParamEditor";
import { PricesSection } from "./Prices";
import { ImageViewer, ZoomableImage } from "../ImageViewer";
import { PARAM_FIELDS, formatParam, type CatalogCategory, type ProductFull } from "@/lib/products/types";

/**
 * Everything about one catalog product: images, what it includes, planning parameters, the
 * manufacturer's overview and full spec table. A page of two columns, or one column in a popup.
 * `extra` goes right after the name (e.g. why it fits a spot); `side` under it on the page.
 */
export function ProductDetails({
  product,
  single,
  showPrices,
  onSave,
  extra,
  side,
}: {
  product: ProductFull;
  single?: boolean;
  /** the account owner's own costs and customer price */
  showPrices: boolean;
  /** admins correct parameter values; without it the parameters are read-only */
  onSave?: (patch: Record<string, unknown>) => void;
  extra?: ReactNode;
  side?: ReactNode;
}) {
  const head = (
    <>
      <Gallery ids={product.imageIds} compact={single} />
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
        {product.fetchedAt && <p className="mt-1 text-xs text-slate-400">נקרא מהאתר: {new Date(product.fetchedAt).toLocaleString("he-IL")}</p>}
      </section>
      {/* prices are an account owner's, their own account's (the server doesn't send them to anyone else) */}
      {showPrices && <PricesSection product={product} />}
      {extra}
    </>
  );
  const body = (
    <>
      <Highlights product={product} />
      <Params product={product} onSave={onSave} />
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
    </>
  );
  if (single) {
    return (
      <div className="space-y-3">
        {head}
        {body}
      </div>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="space-y-4">
        {head}
        {side}
      </div>
      <div className="space-y-4">{body}</div>
    </div>
  );
}

/** A product in a popup, loaded by id: from the map, without leaving it. */
export function ProductModal({ id, title, extra, footer, onClose }: { id: string; title?: string; extra?: ReactNode; footer?: ReactNode; onClose: () => void }) {
  const showPrices = useSeesPrices();
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
  return (
    <Modal wide title={title ?? product?.model ?? "פרטי המוצר"} onClose={onClose} footer={footer}>
      {error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : !product ? (
        <p className="p-10 text-center text-sm text-slate-400">טוען את פרטי המוצר…</p>
      ) : (
        <ProductDetails product={product} single showPrices={showPrices} extra={extra} />
      )}
    </Modal>
  );
}

/** What the product includes: the manufacturer's box icons, technical tiles and other features. */
function Highlights({ product }: { product: ProductFull }) {
  const tiles = techTiles(product.category, product.params);
  const badges = generalBadges(product.category, product.params, product.boxIcons);
  if (!product.boxIcons.length && !tiles.length && !badges.length) return null;
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="font-semibold">מה כולל המוצר</h2>
      <BoxIcons icons={product.boxIcons} size="lg" />
      <TechTiles tiles={tiles} />
      <GeneralBadges badges={badges} />
    </section>
  );
}

function Gallery({ ids, compact }: { ids: string[]; compact?: boolean }) {
  const [current, setCurrent] = useState(0);
  const [zoom, setZoom] = useState(false);
  if (!ids.length) return <div className={cx("grid place-items-center rounded-2xl bg-white text-sm text-slate-400 ring-1 ring-slate-200", compact ? "h-40" : "aspect-square")}>אין תמונה</div>;
  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
      {/* pinch the picture where it is (the full size, to read the small print); the corner button opens it on the whole screen */}
      <ZoomableImage
        key={ids[Math.min(current, ids.length - 1)]}
        src={`/api/catalog/images/${ids[Math.min(current, ids.length - 1)]}`}
        className={cx("w-full", compact ? "h-56 sm:h-72" : "aspect-square max-h-72 lg:max-h-none")}
      >
        <button
          onClick={() => setZoom(true)}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute bottom-1 end-1 grid size-9 place-items-center rounded-full bg-white/90 text-slate-600 shadow ring-1 ring-slate-200"
          aria-label="תמונה במסך מלא"
        >
          <Maximize2 size={16} />
        </button>
      </ZoomableImage>
      {zoom && <ImageViewer srcs={ids.map((id) => `/api/catalog/images/${id}`)} index={Math.min(current, ids.length - 1)} onClose={() => setZoom(false)} />}
      {ids.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {ids.map((id, i) => (
            <button key={id} onClick={() => setCurrent(i)} className={cx("size-14 shrink-0 overflow-hidden rounded-lg ring-2", i === current ? "ring-blue-500" : "ring-transparent")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/catalog/images/${id}?w=160`} alt="" loading="lazy" className="size-full object-contain" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Params({ product, onSave }: { product: ProductFull; onSave?: (p: Record<string, unknown>) => void }) {
  const fields = PARAM_FIELDS[product.category as CatalogCategory] ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  if (!fields.length) return null;
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="font-semibold">פרמטרים לתכנון</h2>
      {onSave && <p className="mb-2 text-xs text-slate-500">נקראו מהאתר. אפשר לתקן כל ערך; עדכון מהאתר לא ידרוס תיקון.</p>}
      <div className="divide-y divide-slate-100">
        {fields.map((f) => {
          const overridden = f.key in product.overrides;
          const value = product.params[f.key];
          return (
            <div key={f.key} className="py-2">
              <div className="flex items-center gap-2">
                <span className="w-36 shrink-0 text-sm text-slate-500">{f.label}</span>
                <span className={cx("min-w-0 flex-1 text-sm", value === undefined ? "text-slate-300" : "font-medium")}>{formatParam(f, value)}</span>
                {overridden && onSave && <Badge color="amber">תוקן</Badge>}
                {onSave && (
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
              {overridden && onSave && <div className="ms-38 text-xs text-slate-400">מהאתר: {formatParam(f, product.sourceParams[f.key])}</div>}
              {onSave && editing === f.key && (
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
