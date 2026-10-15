"use client";

import Link from "next/link";
import { FileSpreadsheet, Package, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "../AppShell";
import { askConfirm } from "../dialogs";
import { Badge, Button, Empty, Field, Input, Modal, cx } from "../ui";
import { BoxIcons, GeneralBadges, generalBadges } from "./ProductIcons";
import { CostTag } from "./Prices";
import { authApi, useSession } from "@/lib/session-client";
import { toast } from "@/lib/toast";
import { CAMERA_CATEGORIES, CATEGORY_LABEL, FORM_LABEL, paramChips, type CatalogCategory, type FormFactor, type ProductSummary } from "@/lib/products/types";
import { readPriceList } from "@/lib/products/price-list";
import { priceListName, type PriceRow } from "@/lib/products/pricing";

interface BrandInfo {
  id: string;
  name: string;
  website: string | null;
  counts: Record<string, number>;
  runs: { id: number; source: string; startedAt: number; finishedAt?: number; status: string; stats: Record<string, number> }[];
  /** markup on cost for a customer price, where the maker's site has no retail price */
  markupPct: number;
  /** the price list the costs are from now */
  priceList: { source: string; at: number; priced: number } | null;
}

interface PriceStats {
  rows: number;
  products: number;
  priced: number;
  noted: number;
  withDisk: number;
  removed: number;
  unmatched: string[];
}

interface Progress {
  brandId: string;
  phase: "listing" | "products" | "done" | "error";
  total: number;
  done: number;
  current?: string;
  stats: Record<string, number>;
  error?: string;
}

/** System admin: the product catalog, its brands and website updates. */
export function CatalogScreen() {
  const me = useSession((s) => s.user);
  return (
    <AppShell crumbs={[{ label: "מאגר מוצרים" }]}>
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        {!me ? (
          <p className="p-10 text-center text-slate-400">טוען…</p>
        ) : me.role !== "admin" ? (
          <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">מאגר המוצרים מנוהל על ידי מנהל המערכת.</p>
        ) : (
          <Catalog />
        )}
      </div>
    </AppShell>
  );
}

function Catalog() {
  const [brands, setBrands] = useState<BrandInfo[] | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [category, setCategory] = useState<CatalogCategory | "all">("all");
  const [q, setQ] = useState("");
  const [mp, setMp] = useState<number | null>(null);
  const [form, setForm] = useState<FormFactor | null>(null);
  /** bumped after prices change, to load brands and products again */
  const [reload, setReload] = useState(0);
  const running = progress?.phase === "listing" || progress?.phase === "products";

  // brand status, polled while an update runs
  useEffect(() => {
    let alive = true;
    const load = () =>
      authApi<{ brands: BrandInfo[]; progress: Progress | null }>("/api/admin/catalog", "GET")
        .then((r) => {
          if (!alive) return;
          setBrands(r.brands);
          setProgress(r.progress);
        })
        .catch((e: Error) => alive && toast(e.message, "error"));
    void load();
    const t = running ? setInterval(load, 2500) : undefined;
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [running, reload]);

  // the products; reloaded when an update finishes
  useEffect(() => {
    let alive = true;
    authApi<{ products: ProductSummary[] }>("/api/catalog/products?all=1", "GET")
      .then((r) => alive && setProducts(r.products))
      .catch((e: Error) => alive && toast(e.message, "error"));
    return () => {
      alive = false;
    };
  }, [progress?.phase, reload]);

  const sync = async (brandId: string) => {
    const ok = await askConfirm({
      title: "עדכון מהאתר",
      message: "המערכת תקרא את כל המוצרים בקטגוריות ה-IP מאתר היצרן, עמוד אחרי עמוד, ותוריד את התמונות. זה לוקח כ-10 דקות. אפשר להמשיך לעבוד בינתיים.",
      okLabel: "התחל עדכון",
    });
    if (!ok) return;
    try {
      const r = await authApi<{ progress: Progress }>("/api/admin/catalog", "POST", { brandId });
      setProgress(r.progress);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const camera = category !== "all" && CAMERA_CATEGORIES.includes(category);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (products ?? []).filter(
      (p) =>
        (category === "all" || p.category === category) &&
        (!t || p.model.toLowerCase().includes(t) || p.name.toLowerCase().includes(t)) &&
        (!camera || mp === null || (mp === 8 ? (p.params.mp ?? 0) >= 8 : p.params.mp === mp)) &&
        (!camera || form === null || p.params.formFactor === form),
    );
  }, [products, category, q, mp, form, camera]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of products ?? []) c[p.category] = (c[p.category] ?? 0) + 1;
    return c;
  }, [products]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">מאגר מוצרים</h1>
          <p className="text-sm text-slate-500">ציוד מהיצרנים עם הפרמטרים לתכנון. מתעדכן מאתרי היצרנים ומקובצי אקסל.</p>
        </div>
      </div>

      {brands?.map((b) => {
        const last = b.runs[0];
        const total = Object.values(b.counts).reduce((s, x) => s + x, 0);
        const mine = progress && progress.brandId === b.id ? progress : null;
        return (
          <div key={b.id} className="mb-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-slate-900 text-white">
                <Package size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{b.name}</div>
                <div className="text-xs text-slate-500">
                  {total} מוצרים
                  {last?.finishedAt && ` · עודכן ${new Date(last.finishedAt).toLocaleString("he-IL")}`}
                  {last?.status === "error" && " · העדכון האחרון נכשל"}
                </div>
              </div>
              <Button onClick={() => sync(b.id)} disabled={running}>
                <RefreshCw size={16} className={running ? "animate-spin" : ""} /> {running ? "מעדכן…" : "עדכון מהאתר"}
              </Button>
            </div>
            {mine && (mine.phase === "listing" || mine.phase === "products") && (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>{mine.phase === "listing" ? `קורא רשימות מוצרים: ${mine.current ?? ""}` : `${mine.done} מתוך ${mine.total}: ${mine.current ?? ""}`}</span>
                  <span>
                    {mine.stats.new} חדשים · {mine.stats.updated} עודכנו · {mine.stats.images} תמונות
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-blue-600 transition-all" style={{ width: `${mine.total ? (mine.done / mine.total) * 100 : 3}%` }} />
                </div>
              </div>
            )}
            {mine?.phase === "done" && (
              <p className="mt-2 text-xs text-green-700">
                העדכון הסתיים: {mine.stats.new} חדשים, {mine.stats.updated} עודכנו, {mine.stats.same} ללא שינוי
                {mine.stats.failed ? `, ${mine.stats.failed} נכשלו` : ""}
                {mine.stats.discontinued ? `, ${mine.stats.discontinued} כבר לא באתר` : ""}.
              </p>
            )}
            {mine?.phase === "error" && <p className="mt-2 text-xs text-red-700">העדכון נכשל: {mine.error}</p>}
            <PriceList brand={b} onChanged={() => setReload((n) => n + 1)} />
          </div>
        );
      })}

      <div className="no-scrollbar -mx-4 mb-3 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0 [&>*]:shrink-0">
        {(["all", ...Object.keys(CATEGORY_LABEL)] as (CatalogCategory | "all")[])
          .filter((c) => c === "all" || counts[c])
          .map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c === "all" ? "הכל" : CATEGORY_LABEL[c]} ({c === "all" ? (products?.length ?? 0) : counts[c]})
            </Chip>
          ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי דגם או תיאור" className="ps-8" type="search" />
        </div>
        {camera && (
          <div className="no-scrollbar flex gap-1 overflow-x-auto [&>*]:shrink-0">
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
          </div>
        )}
      </div>

      {!products ? (
        <p className="p-10 text-center text-slate-400">טוען…</p>
      ) : !products.length ? (
        <Empty>המאגר עדיין ריק. לחצו ״עדכון מהאתר״ כדי לייבא את המוצרים.</Empty>
      ) : !shown.length ? (
        <Empty>אין מוצרים שמתאימים לסינון.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </>
  );
}

/** The brand's price list (the distributor's Excel file) and its markup for a customer price. */
function PriceList({ brand, onChanged }: { brand: BrandInfo; onChanged: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ source: string; rows: PriceRow[]; stats: PriceStats } | null>(null);
  const [markup, setMarkup] = useState(String(brand.markupPct));

  const read = async (file: File) => {
    setBusy(true);
    try {
      const rows = await readPriceList(file);
      if (!rows.length) throw new Error("לא נמצאו בקובץ גיליונות עם עמודות ״דגם״ ו״מחיר״.");
      const source = file.name.replace(/\.[^.]+$/, "").trim();
      const r = await authApi<{ stats: PriceStats }>("/api/admin/catalog/prices", "POST", { brandId: brand.id, source, rows, dryRun: true });
      setPreview({ source, rows, stats: r.stats });
    } catch (e) {
      toast((e as Error).message || "לא הצלחנו לקרוא את הקובץ", "error");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const r = await authApi<{ stats: PriceStats }>("/api/admin/catalog/prices", "POST", { brandId: brand.id, source: preview.source, rows: preview.rows });
      toast(`נשמרו מחירים ל-${r.stats.priced} מוצרים`);
      setPreview(null);
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const saveMarkup = async () => {
    const n = Number(markup.replace(",", "."));
    if (!(n >= 0 && n <= 1000)) return setMarkup(String(brand.markupPct));
    if (n === brand.markupPct) return;
    try {
      await authApi("/api/admin/catalog/prices", "PATCH", { brandId: brand.id, markupPct: n });
      toast("נשמר");
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const st = preview?.stats;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
      <div className="min-w-0 flex-1 text-xs text-slate-500">
        {brand.priceList ? (
          <>
            <b className="text-slate-700">{priceListName(brand.priceList.source)}</b> · {new Date(brand.priceList.at).toLocaleDateString("he-IL")} · {brand.priceList.priced} מוצרים עם
            מחיר
          </>
        ) : (
          "עדיין לא נטען מחירון."
        )}
      </div>
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        מחיר ללקוח כשאין מחיר באתר: עלות +
        <span className="w-16">
          <Input value={markup} onChange={(e) => setMarkup(e.target.value)} onBlur={saveMarkup} inputMode="decimal" className="ltr text-center" />
        </span>
        %
      </label>
      <Button onClick={() => fileRef.current?.click()} disabled={busy}>
        <FileSpreadsheet size={16} /> {busy && !preview ? "קורא את הקובץ…" : "ייבוא מחירון"}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".xls,.xlsx"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void read(f);
        }}
      />
      {preview && st && (
        <Modal
          title={`ייבוא מחירון · ${brand.name}`}
          onClose={() => setPreview(null)}
          footer={
            <>
              <Button variant="primary" onClick={save} disabled={busy || !st.priced}>
                {busy ? "שומר…" : "שמירת המחירים"}
              </Button>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                ביטול
              </Button>
            </>
          }
        >
          <Field label="שם המחירון">
            <Input value={preview.source} onChange={(e) => setPreview({ ...preview, source: e.target.value })} />
          </Field>
          <ul className="space-y-1.5 text-sm">
            <li>{st.rows} שורות נקראו מהקובץ.</li>
            <li>
              <b>{st.priced}</b> מוצרים מתוך {st.products} במאגר יקבלו מחיר{st.withDisk ? ` (${st.withDisk} מהם רק בגרסה עם דיסק)` : ""}.
            </li>
            {st.noted > 0 && <li>{st.noted} מוצרים מופיעים בלי מחיר (למשל ״שאל את סוכן המכירות״).</li>}
            {st.removed > 0 && <li className="text-amber-700">ל-{st.removed} מוצרים היה מחיר מהמחירון הקודם, והם לא נמצאו בחדש: המחיר שלהם יימחק.</li>}
            <li className="text-xs text-slate-500">המחירים במחירון לפני מע״מ. הם נראים רק לבעל החשבון.</li>
          </ul>
          {st.unmatched.length > 0 && (
            <details className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <summary className="cursor-pointer">{st.unmatched.length} שורות במחירון שאין להן מוצר במאגר</summary>
              <p className="ltr mt-1 text-start text-xs text-slate-500">{st.unmatched.join(" · ")}</p>
            </details>
          )}
        </Modal>
      )}
    </div>
  );
}

function ProductCard({ p }: { p: ProductSummary }) {
  return (
    <Link href={`/admin/catalog/${p.id}`} className="flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200 transition hover:shadow-md active:bg-slate-50">
      <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-50">
        {p.imageId ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by our API with the session cookie
          <img src={`/api/catalog/images/${p.imageId}?w=160`} alt="" loading="lazy" className="size-full object-contain" />
        ) : (
          <Package size={24} className="text-slate-300" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="ltr truncate font-semibold">{p.model}</span>
          {p.status !== "active" && <Badge color={p.status === "review" ? "amber" : "slate"}>{p.status === "review" ? "לבדיקה" : "לא באתר"}</Badge>}
        </span>
        <span className="line-clamp-2 text-xs text-slate-500">{p.name}</span>
        <CostTag p={p} />
        <span className="mt-1.5 flex flex-wrap items-center gap-1">
          <BoxIcons icons={p.boxIcons} />
          <GeneralBadges compact badges={generalBadges(p.category, p.params, p.boxIcons).slice(0, p.boxIcons.length ? 4 : 8)} />
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          {paramChips(p.category, p.params)
            .slice(0, 6)
            .map((c) => (
              <span key={c} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                {c}
              </span>
            ))}
        </span>
      </span>
    </Link>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx("flex h-9 items-center rounded-full px-3 text-sm ring-1 sm:h-8", active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200")}
    >
      {children}
    </button>
  );
}
