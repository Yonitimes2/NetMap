"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Cable, Copy, ExternalLink, Eye, EyeOff, Info, Link2, Package, Plus, RotateCcw, Share2, Sparkles, Trash2, TriangleAlert, Wrench } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { AppShell } from "../AppShell";
import { Button, Empty, Field, Input, Modal, Select, Textarea, cx } from "../ui";
import { askConfirm } from "../dialogs";
import { useApp, uid } from "@/lib/store";
import { can, useRole } from "@/lib/access";
import { useSync } from "@/lib/sync";
import { categoriesFor, productPatch, useCatalog } from "@/lib/products/client";
import { ProductPicker } from "../catalog/ProductPicker";
import { ProductModal } from "../catalog/ProductDetails";
import type { ProductSummary } from "@/lib/products/types";
import { matchKindOf, type MatchContext } from "@/lib/products/match";
import { MatchDialog } from "./MatchDialog";
import { useProjectFinance, versionText } from "./useFinance";
import type { Device } from "@/lib/types";
import { VAT, beforeVat, nis, withVat } from "@/lib/products/pricing";
import { deviceTypeById, layerById } from "@/lib/catalog";
import { authApi } from "@/lib/session-client";
import { toast } from "@/lib/toast";
import {
  DEFAULT_WASTE,
  SECTION_LABEL,
  buildQuote,
  carriesDefault,
  deviceLineKey,
  emptyDefaults,
  emptyFinance,
  type ExtraLine,
  type ProductPriceInfo,
  type ProjectFinance,
  type Quote,
  type QuoteDefaults,
  type QuoteLine,
  type QuoteSection,
} from "@/lib/quote";

/** A project's quote: the bill of quantities from its map, priced (for the account's owners), and links to send the customer. */
export function QuoteScreen() {
  const { accountId, siteId } = useParams<{ accountId: string; siteId: string }>();
  const account = useApp((s) => s.accounts.find((a) => a.id === accountId));
  const site = useApp((s) => s.sites.find((x) => x.id === siteId));
  const allowed = can.view(useRole(accountId));
  return (
    <AppShell
      crumbs={
        allowed
          ? [
              { label: account?.name ?? "", href: `/a/${accountId}` },
              { label: site?.name ?? "", href: `/a/${accountId}/s/${siteId}` },
              { label: "הצעת מחיר" },
            ]
          : []
      }
    >
      <QuoteBody accountId={accountId} siteId={siteId} />
    </AppShell>
  );
}

function QuoteBody({ accountId, siteId }: { accountId: string; siteId: string }) {
  const site = useApp((s) => s.sites.find((x) => x.id === siteId && x.accountId === accountId));
  const role = useRole(accountId);
  const syncReady = useSync((s) => s.ready);
  if (!site && !syncReady) return <p className="p-10 text-center text-slate-400">טוען…</p>;
  if (!site || !can.view(role)) {
    return (
      <div className="p-6">
        <Empty>אין לך גישה לפרויקט הזה, או שהוא לא קיים.</Empty>
      </div>
    );
  }
  return can.money(role) ? <PricedQuote accountId={accountId} siteId={siteId} /> : <QuantitiesOnly siteId={siteId} />;
}

/** The map, the catalog and the quote's settings, made into the quote. */
export function useQuote(siteId: string, finance: ProjectFinance, defaults: QuoteDefaults): Quote {
  const devices = useApp((s) => s.devices);
  const links = useApp((s) => s.links);
  const floors = useApp((s) => s.floors);
  const products = useCatalog((s) => s.products);
  const load = useCatalog((s) => s.load);
  useEffect(() => void load(), [load]);
  return useMemo(() => {
    const byId = new Map<string, ProductPriceInfo>((products ?? []).map((p) => [p.id, p]));
    return buildQuote({ siteId, devices, links, floors, products: byId, finance, defaults });
  }, [siteId, devices, links, floors, products, finance, defaults]);
}

// ---------------------------------------------------------------- without prices

/** Technicians and the customer's people: what the project needs, without money. */
function QuantitiesOnly({ siteId }: { siteId: string }) {
  const quote = useQuote(siteId, EMPTY_FINANCE, EMPTY_DEFAULTS);
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">כתב כמויות</h1>
        <p className="text-sm text-slate-500">מה שהפרויקט צריך, לפי המפה. המחירים גלויים רק לבעלי החשבון.</p>
      </div>
      {(["equipment", "cables", "labor"] as QuoteSection[]).map((sec) => {
        const lines = quote.lines.filter((l) => l.section === sec && !l.extra && !l.hidden);
        if (!lines.length) return null;
        return (
          <section key={sec} className="rounded-2xl bg-white ring-1 ring-slate-200">
            <h2 className="border-b border-slate-100 px-4 py-2.5 font-semibold">{SECTION_LABEL[sec]}</h2>
            <div className="divide-y divide-slate-100">
              {lines.map((l) => (
                <div key={l.key} className="flex items-center gap-3 px-4 py-2.5">
                  <LineIcon line={l} />
                  <LineName line={l} />
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {l.qty} {l.unit}
                  </span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {!quote.lines.length && <Empty>עדיין אין ציוד במפה של הפרויקט.</Empty>}
    </div>
  );
}

const EMPTY_FINANCE = emptyFinance();
const EMPTY_DEFAULTS = emptyDefaults();

// ---------------------------------------------------------------- the owner's quote

function PricedQuote({ accountId, siteId }: { accountId: string; siteId: string }) {
  const { state, error, saving, change, saveDefaults } = useProjectFinance(accountId, siteId, "ההצעה עודכנה");
  const [editing, setEditing] = useState<QuoteLine | "new-equipment" | "new-labor" | null>(null);
  /** choosing from the catalog: a product to add, or the model of a line */
  const [picking, setPicking] = useState<{ line?: QuoteLine } | null>(null);
  /** matching a line's model to what the map knows */
  const [matching, setMatching] = useState<QuoteLine | null>(null);
  const updateDevice = useApp((s) => s.updateDevice);
  const siteDevices = useApp(useShallow((s) => s.devices.filter((d) => d.siteId === siteId)));
  const siteLinks = useApp(useShallow((s) => s.links.filter((l) => l.siteId === siteId)));
  const siteAreas = useApp(useShallow((s) => s.areas.filter((a) => a.siteId === siteId)));
  const siteFloors = useApp(useShallow((s) => s.floors.filter((f) => f.siteId === siteId)));
  const ctx = useMemo<MatchContext>(() => ({ siteDevices, links: siteLinks, areas: siteAreas, floors: siteFloors }), [siteDevices, siteLinks, siteAreas, siteFloors]);

  const quote = useQuote(siteId, state?.finance ?? EMPTY_FINANCE, state?.defaults ?? EMPTY_DEFAULTS);

  if (error) return <p className="m-4 rounded-xl bg-red-50 p-4 text-sm text-red-700 sm:m-6">{error}</p>;
  if (!state) return <p className="p-10 text-center text-slate-400">טוען את ההצעה…</p>;

  const pickProduct = (p: ProductSummary) => {
    const line = picking?.line;
    if (!line) {
      change((f) => ({ ...f, extras: [...f.extras, { id: uid(), section: "equipment", productId: p.id, name: "", qty: 1 }] }));
      toast(`${p.model} נוסף להצעה`);
    } else if (line.extra) {
      // a product added by hand: another product instead, at its own price
      const id = line.key.slice(2);
      change((f) => ({ ...f, extras: f.extras.map((x) => (x.id === id ? { ...x, productId: p.id, cost: undefined, price: undefined } : x)) }));
    } else {
      // the map's equipment on this line gets the model, as when it's chosen on the map
      const targets = useApp.getState().devices.filter((d) => d.siteId === siteId && !d.existing && deviceLineKey(d) === line.key);
      for (const d of targets) updateDevice(d.id, productPatch(d, p));
      toast(`נבחר דגם ${p.model} ל${targets.length === 1 ? "פריט אחד" : `-${targets.length} פריטים`} במפה`);
    }
    setPicking(null);
  };
  const openPicker = (line?: QuoteLine) => {
    setEditing(null);
    setPicking({ line });
  };
  /** the line's equipment on the map */
  const lineDevices = (line: QuoteLine) => siteDevices.filter((d) => !d.existing && deviceLineKey(d) === line.key);
  /** a model for equipment on the map, keeping where each camera is aimed (with the angle the model covers there) */
  const giveModel = (picks: { d: Device; p: ProductSummary; fov?: number }[]) => {
    for (const { d, p, fov } of picks) {
      const patch = productPatch(d, p);
      if (d.camera) patch.camera = { dir: d.camera.dir, range: d.camera.range, fov: fov ?? patch.camera?.fov ?? d.camera.fov };
      updateDevice(d.id, patch);
    }
    const models = [...new Set(picks.map((x) => x.p.model))];
    toast(models.length === 1 ? `נבחר דגם ${models[0]} ל${picks.length === 1 ? "פריט אחד" : `-${picks.length} פריטים`} במפה` : `נבחרו ${models.length} דגמים ל-${picks.length} מצלמות במפה`);
    setMatching(null);
  };

  const visible = quote.lines.filter((l) => !l.hidden);
  const hidden = quote.lines.filter((l) => l.hidden);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold">הצעת מחיר</h1>
            <span className={cx("rounded-full px-2 py-0.5 text-xs", saving ? "bg-slate-100 text-slate-500" : "bg-green-50 text-green-700")}>{versionText(state, saving)}</span>
          </div>
          <p className="text-sm text-slate-500">הכמויות מהמפה, העלויות מהמחירון שלך. לוחצים על שורה כדי לשנות כמות, עלות או מחיר.</p>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          {(["equipment", "cables", "labor"] as QuoteSection[]).map((sec) => (
            <SectionCard
              key={sec}
              section={sec}
              lines={visible.filter((l) => l.section === sec)}
              onEdit={setEditing}
              onAdd={sec === "cables" ? undefined : () => setEditing(sec === "labor" ? "new-labor" : "new-equipment")}
              onAddProduct={sec === "equipment" ? () => openPicker() : undefined}
              header={
                sec === "cables" ? (
                  <label className="flex items-center gap-1.5 text-xs font-normal text-slate-500">
                    פחת
                    <span className="w-14">
                      <NumInput value={state.finance.cableWastePct ?? quote.wastePct} onChange={(v) => change((f) => ({ ...f, cableWastePct: v ?? DEFAULT_WASTE }))} />
                    </span>
                    %
                  </label>
                ) : undefined
              }
            />
          ))}
          {hidden.length > 0 && (
            <details className="rounded-2xl bg-white ring-1 ring-slate-200">
              <summary className="cursor-pointer px-4 py-2.5 text-sm text-slate-500">לא בהצעה ({hidden.length})</summary>
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {hidden.map((l) => (
                  <div key={l.key} className="flex items-center gap-3 px-4 py-2 text-sm text-slate-500">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {l.name} · {l.qty} {l.unit}
                      </span>
                      <span className="block text-xs text-slate-400">{l.notSold && l.hidden ? notSoldWhy(l.type) : "הוסר מההצעה"}</span>
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => change((f) => ({ ...f, lines: { ...f.lines, [l.key]: { ...f.lines[l.key], hidden: false } } }))}>
                      <RotateCcw size={14} /> {l.notSold ? "למכור בכל זאת" : "החזרה"}
                    </Button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-4">
          <TotalsCard quote={quote} />
          <TermsCard finance={state.finance} quote={quote} defaults={state.defaults} onChange={change} onSaveDefaults={saveDefaults} />
          <ShareCard accountId={accountId} siteId={siteId} />
        </div>
      </div>

      {editing && (
        <LineEditor
          line={typeof editing === "string" ? null : editing}
          section={editing === "new-labor" ? "labor" : editing === "new-equipment" ? "equipment" : undefined}
          finance={state.finance}
          defaults={state.defaults}
          onChange={change}
          onSaveDefaults={saveDefaults}
          onPickModel={typeof editing !== "string" && canPickModel(editing) ? () => openPicker(editing) : undefined}
          onMatch={
            typeof editing !== "string" && !editing.extra && matchKindOf(editing.type) && lineDevices(editing).length
              ? () => {
                  setEditing(null);
                  setMatching(editing);
                }
              : undefined
          }
          onClose={() => setEditing(null)}
        />
      )}
      {matching && (
        <MatchDialog
          title={`התאמת דגם לפי המפה: ${matching.name}`}
          devices={lineDevices(matching)}
          ctx={ctx}
          onPick={(p, fovs) => giveModel(lineDevices(matching).map((d) => ({ d, p, fov: fovs?.[d.id] })))}
          onPickEach={giveModel}
          onClose={() => setMatching(null)}
        />
      )}
      {picking && (
        <ProductPicker
          deviceType={picking.line?.type}
          siteDevices={siteDevices}
          current={picking.line && lineProductId(picking.line, state.finance)}
          title={picking.line ? undefined : "הוספת מוצר מהמאגר להצעה"}
          onPick={pickProduct}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

/** Why equipment on the map isn't sold: work, the building's, or the customer's own. */
function notSoldWhy(type?: string) {
  if (type === "jack") return "עבודה, לא מוצר: נספרת בעבודה (התקנת נקודת רשת)";
  if (type === "elec-panel") return "של המבנה: לא נמכר";
  if (type === "router" || type === "modem") return "בדרך כלל של הלקוח (מספק האינטרנט)";
  return "של הלקוח: לא נמכר";
}

/** The catalog product a line is, if any. */
function lineProductId(line: QuoteLine, finance: ProjectFinance): string | undefined {
  if (line.key.startsWith("p:")) return line.key.slice(2);
  if (line.extra) return finance.extras.find((x) => x.id === line.key.slice(2))?.productId;
}

/** Lines whose model can be chosen from the catalog: the map's equipment of a kind the catalog has, and products added by hand. */
const canPickModel = (line: QuoteLine) =>
  line.key.startsWith("p:") || (line.extra && !!line.type) || (line.key.startsWith("t:") && !!line.type && !!categoriesFor(line.type));

const SECTION_ICON = { equipment: Package, cables: Cable, labor: Wrench } as const;

function SectionCard({
  section,
  lines,
  onEdit,
  onAdd,
  onAddProduct,
  header,
}: {
  section: QuoteSection;
  lines: QuoteLine[];
  onEdit: (l: QuoteLine) => void;
  onAdd?: () => void;
  /** a catalog product that isn't on the map */
  onAddProduct?: () => void;
  header?: React.ReactNode;
}) {
  const Icon = SECTION_ICON[section];
  const total = lines.reduce((s, l) => s + (l.price ?? 0) * l.qty, 0);
  if (!lines.length && !onAdd) return null;
  return (
    <section className="rounded-2xl bg-white ring-1 ring-slate-200">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <Icon size={16} className="text-slate-400" />
        <h2 className="font-semibold">{SECTION_LABEL[section]}</h2>
        {header}
        <span className="flex-1" />
        {total > 0 && <span className="text-sm font-semibold tabular-nums">{nis(withVat(total))}</span>}
      </div>
      {lines.length ? (
        <div className="divide-y divide-slate-100">
          {lines.map((l) => (
            <LineRow key={l.key} line={l} onClick={() => onEdit(l)} />
          ))}
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-slate-500">{section === "labor" ? "אין עדיין עבודות. הן נוספות מעצמן לפי הציוד במפה." : "אין עדיין ציוד במפה."}</p>
      )}
      {(onAdd || onAddProduct) && (
        <div className="flex flex-wrap border-t border-slate-100">
          {onAddProduct && (
            <button onClick={onAddProduct} className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-blue-700 hover:bg-slate-50">
              <Package size={15} /> מוצר מהמאגר
            </button>
          )}
          {onAdd && (
            <button onClick={onAdd} className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-blue-700 hover:bg-slate-50">
              <Plus size={15} /> {section === "labor" ? "עבודה נוספת" : "פריט חופשי (מחברים, קופסאות…)"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function LineIcon({ line }: { line: QuoteLine }) {
  if (line.imageId) {
    // eslint-disable-next-line @next/next/no-img-element -- served by our API with the session cookie
    return <img src={`/api/catalog/images/${line.imageId}?w=160`} alt="" className="size-10 shrink-0 rounded-lg bg-white object-contain ring-1 ring-slate-100" />;
  }
  const def = line.type ? deviceTypeById(line.type) : null;
  const Icon = def?.icon ?? SECTION_ICON[line.section];
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-50" style={def ? { color: layerById(def.layer).color } : undefined}>
      <Icon size={18} className={def ? undefined : "text-slate-400"} />
    </span>
  );
}

function LineName({ line }: { line: QuoteLine }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{line.name}</span>
      {/* a model name reads left to right, a description in Hebrew right to left: both on the right */}
      {line.detail && (
        <span dir="auto" className="block truncate text-right text-xs text-slate-500">
          {line.detail}
        </span>
      )}
      {line.included && <span className={cx("block text-xs font-medium", line.included === "בלי דיסק" ? "text-amber-700" : "text-blue-800")}>{line.included}</span>}
      {line.unmeasured ? <span className="block text-xs text-amber-700">{line.unmeasured} כבלים במפה בלי אורך: לא נספרו</span> : null}
    </span>
  );
}

/** A quote line: the customer's price on the side, then the cost and the profit under its name. With VAT; the profit is without it. */
function LineRow({ line: l, onClick }: { line: QuoteLine; onClick: () => void }) {
  const total = l.price !== undefined ? withVat(l.price * l.qty) : undefined;
  const profit = l.price !== undefined && l.cost !== undefined ? (l.price - l.cost) * l.qty : undefined;
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-slate-50">
      <LineIcon line={l} />
      <span className="min-w-0 flex-1">
        <LineName line={l} />
        <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
          <span>
            עלות{" "}
            {l.cost !== undefined ? (
              <b className="font-medium text-slate-700">{nis(withVat(l.cost))}</b>
            ) : l.section === "labor" ? (
              // the work's cost (a technician's wage) is optional
              "—"
            ) : (
              <span className="text-amber-700">{l.costNote ?? "לא ידועה"}</span>
            )}
          </span>
          {l.showModel && (
            <span className="flex items-center gap-0.5 text-blue-700">
              <Eye size={12} /> דגם גלוי ללקוח
            </span>
          )}
          {/* a recorder's disk is shown under its name */}
          {l.cost !== undefined && l.costNote && !l.included && <span>{l.costNote}</span>}
          {profit !== undefined && <span className={profit < 0 ? "text-red-600" : "text-green-700"}>(רווח {nis(profit)} נטו)</span>}
        </span>
      </span>
      <span className="shrink-0 text-end">
        <span className="block text-sm tabular-nums">
          {l.qty !== l.autoQty && l.autoQty !== undefined ? <span className="text-xs text-blue-700">(שונה) </span> : null}
          {l.qty} {l.unit} × {l.price !== undefined ? nis(withVat(l.price)) : <span className="text-amber-700">?</span>}
        </span>
        <b className="block text-sm tabular-nums">{total !== undefined ? nis(total) : <span className="text-xs font-normal text-amber-700">חסר מחיר</span>}</b>
      </span>
    </button>
  );
}

function TotalsCard({ quote }: { quote: Quote }) {
  const t = quote.totals;
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="mb-2 font-semibold">
        סיכום <span className="text-xs font-normal text-slate-400">· כולל מע״מ</span>
      </h2>
      <div className="space-y-1 text-sm">
        <Row label="ציוד וכבלים" value={nis(withVat(t.equipmentPrice))} />
        <Row label="עבודה" value={nis(withVat(t.laborPrice))} />
        {t.discount > 0 && <Row label="הנחה" value={`−${nis(withVat(t.discount))}`} />}
        <Row label="סה״כ ללקוח" value={nis(t.total)} strong big />
        <p className="text-end text-xs text-slate-400">
          {nis(t.net)} לפני מע״מ + {nis(t.vat)} מע״מ {Math.round(VAT * 100)}%
        </p>
      </div>
      <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
        <Row label="העלות שלך" value={nis(withVat(t.cost))} />
        <Row
          label="רווח משוער (נטו)"
          value={
            <span className={t.profit < 0 ? "text-red-600" : "text-green-700"}>
              {nis(t.profit)} <span className="text-xs">({Math.round(t.marginPct)}%)</span>
            </span>
          }
          strong
        />
        <p className="text-xs text-slate-400">הרווח בלי המע״מ, שעובר למס</p>
      </div>
      {(t.noPrice > 0 || t.noCost > 0) && (
        <div className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
          <TriangleAlert size={15} className="shrink-0" />
          <span>
            {t.noPrice > 0 && `${t.noPrice === 1 ? "שורה אחת" : `${t.noPrice} שורות`} בלי מחיר ללקוח (לא נכנסו לסכום). `}
            {t.noCost > 0 && `${t.noCost === 1 ? "שורת ציוד אחת" : `${t.noCost} שורות ציוד`} בלי עלות, אז הרווח גבוה מהאמת.`}
          </span>
        </div>
      )}
    </section>
  );
}

function Row({ label, value, strong, big }: { label: string; value: React.ReactNode; strong?: boolean; big?: boolean }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-3", strong && "font-semibold", big && "text-base")}>
      <span className={strong ? "text-slate-800" : "text-slate-500"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function TermsCard({
  finance,
  quote,
  defaults,
  onChange,
  onSaveDefaults,
}: {
  finance: ProjectFinance;
  quote: Quote;
  defaults: QuoteDefaults;
  onChange: (fn: (f: ProjectFinance) => ProjectFinance) => void;
  onSaveDefaults: (d: QuoteDefaults) => void;
}) {
  const d = finance.discount;
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="font-semibold">הנחה ותנאים</h2>
      <Field label="הנחה">
        <div className="flex gap-2">
          {/* an amount is typed with VAT and kept without it, like every price */}
          <NumInput
            value={d && (d.kind === "amount" ? round2(withVat(d.value)) : d.value)}
            onChange={(v) => onChange((f) => ({ ...f, discount: v ? { kind: d?.kind ?? "pct", value: (d?.kind ?? "pct") === "amount" ? beforeVat(v) : v } : undefined }))}
          />
          <span className="w-28 shrink-0">
            <Select
              value={d?.kind ?? "pct"}
              onChange={(e) =>
                onChange((f) => {
                  if (!f.discount) return f;
                  const kind = e.target.value as "pct" | "amount";
                  // the number typed stays as it is, in the new unit
                  const shown = f.discount.kind === "amount" ? round2(withVat(f.discount.value)) : f.discount.value;
                  return { ...f, discount: { kind, value: kind === "amount" ? beforeVat(shown) : shown } };
                })
              }
            >
              <option value="pct">%</option>
              <option value="amount">₪ כולל מע״מ</option>
            </Select>
          </span>
        </div>
      </Field>
      <Field label="תוקף ההצעה (ימים)">
        <NumInput value={finance.validDays ?? quote.validDays} onChange={(v) => onChange((f) => ({ ...f, validDays: v }))} />
      </Field>
      <Field label="תנאים והערות ללקוח">
        <Textarea
          rows={4}
          value={finance.terms ?? quote.terms ?? ""}
          onChange={(e) => onChange((f) => ({ ...f, terms: e.target.value }))}
          placeholder="תנאי תשלום, אחריות, מה לא כלול…"
        />
      </Field>
      {(finance.terms ?? "") !== (defaults.terms ?? "") && finance.terms !== undefined && (
        <button className="text-xs text-blue-700 hover:underline" onClick={() => onSaveDefaults({ ...defaults, terms: finance.terms })}>
          להשתמש בתנאים האלה בכל ההצעות הבאות
        </button>
      )}
    </section>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A number field that keeps what's typed and reports a number (or nothing, when empty). */
function NumInput({ value, onChange, placeholder }: { value?: number; onChange: (v: number | undefined) => void; placeholder?: string }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    // changed from outside (not by typing here)
    setPrev(value);
    if (Number(text.replace(",", ".")) !== value) setText(value === undefined ? "" : String(value));
  }
  return (
    <Input
      value={text}
      inputMode="decimal"
      placeholder={placeholder}
      className="ltr text-center"
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const n = Number(t.replace(",", "."));
        const v = t.trim() === "" ? undefined : Number.isFinite(n) && n >= 0 ? n : undefined;
        setPrev(v);
        if (t.trim() === "" || v !== undefined) onChange(v);
      }}
    />
  );
}

const SOURCE: Record<string, string> = {
  catalog: "מהמחירון",
  default: "ברירת המחדל שלך",
  site: "מחיר לצרכן באתר היצרן",
  markup: "עלות + אחוז הרווח",
  project: "שינית בפרויקט הזה",
};

function LineEditor({
  line,
  section,
  finance,
  defaults,
  onChange,
  onSaveDefaults,
  onPickModel,
  onMatch,
  onClose,
}: {
  line: QuoteLine | null;
  section?: "equipment" | "labor";
  finance: ProjectFinance;
  defaults: QuoteDefaults;
  onChange: (fn: (f: ProjectFinance) => ProjectFinance) => void;
  onSaveDefaults: (d: QuoteDefaults) => void;
  /** choose (or change) the line's catalog model */
  onPickModel?: () => void;
  /** a model matched to what the map knows about the line's equipment */
  onMatch?: () => void;
  onClose: () => void;
}) {
  const [details, setDetails] = useState(false);
  const extraId = line?.extra ? line.key.slice(2) : null;
  const extra = extraId ? finance.extras.find((x) => x.id === extraId) : undefined;
  const edit = line && !line.extra ? (finance.lines[line.key] ?? {}) : {};
  // prices are typed with VAT, and kept without it
  const gross = (v?: number) => (v === undefined ? undefined : round2(withVat(v)));
  const net = (v?: number) => (v === undefined ? undefined : beforeVat(v));
  const [f, setF] = useState({
    name: extra?.name ?? edit.name ?? "",
    qty: extra?.qty ?? edit.qty,
    unit: extra?.unit ?? "",
    cost: gross(extra?.cost ?? edit.cost),
    price: gross(extra?.price ?? edit.price),
    showModel: !!(extra?.showModel ?? edit.showModel),
  });
  const [keep, setKeep] = useState(false);
  const isNew = !line;
  const sec = section ?? line?.section;
  const productId = line ? lineProductId(line, finance) : undefined;
  const canKeep = !!line && !line.extra && carriesDefault(line.key);

  const save = () => {
    if (isNew || extra) {
      const x: ExtraLine = {
        id: extra?.id ?? uid(),
        section: sec === "labor" ? "labor" : "equipment",
        productId: extra?.productId,
        // a catalog product is called by its kind unless named here
        name: f.name.trim() || (extra?.productId ? "" : sec === "labor" ? "עבודה" : "פריט"),
        qty: f.qty ?? 1,
        unit: f.unit.trim() || undefined,
        cost: net(f.cost),
        price: net(f.price),
        showModel: f.showModel || undefined,
      };
      onChange((fin) => ({ ...fin, extras: extra ? fin.extras.map((e) => (e.id === x.id ? x : e)) : [...fin.extras, x] }));
    } else if (line) {
      onChange((fin) => ({
        ...fin,
        lines: {
          ...fin.lines,
          [line.key]: { ...fin.lines[line.key], name: f.name.trim() || undefined, qty: f.qty, cost: net(f.cost), price: net(f.price), showModel: f.showModel || undefined },
        },
      }));
      if (keep && canKeep && (f.cost !== undefined || f.price !== undefined)) {
        const cur = defaults.prices[line.key] ?? {};
        onSaveDefaults({ ...defaults, prices: { ...defaults.prices, [line.key]: { cost: net(f.cost) ?? cur.cost, price: net(f.price) ?? cur.price } } });
      }
    }
    onClose();
  };

  const remove = async () => {
    if (extra) {
      onChange((fin) => ({ ...fin, extras: fin.extras.filter((e) => e.id !== extra.id) }));
      return onClose();
    }
    if (!line) return;
    const ok = await askConfirm({ title: "הסרה מההצעה", message: `להוציא את "${line.name}" מההצעה? הציוד נשאר במפה, ואפשר להחזיר את השורה.`, okLabel: "הסרה" });
    if (!ok) return;
    onChange((fin) => ({ ...fin, lines: { ...fin.lines, [line.key]: { ...fin.lines[line.key], hidden: true } } }));
    onClose();
  };

  return (
    <Modal
      title={isNew ? (sec === "labor" ? "עבודה נוספת" : "פריט נוסף") : line!.name}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={save} disabled={isNew && !f.name.trim()}>
            שמירה
          </Button>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <span className="flex-1 max-sm:hidden" />
          {!isNew && (
            <Button variant="danger" onClick={remove}>
              <Trash2 size={15} /> {extra ? "מחיקה" : "הסרה"}
            </Button>
          )}
        </>
      }
    >
      {line?.detail && (
        <p dir="auto" className="text-right text-sm text-slate-500">
          {line.detail}
        </p>
      )}
      {line?.description && <p className="text-xs text-slate-500">{line.description}</p>}
      {(onPickModel || onMatch || productId) && (
        <div className="flex flex-wrap gap-2">
          {onMatch && (
            <Button size="sm" variant="primary" onClick={onMatch}>
              <Sparkles size={15} /> התאמה לפי המפה
            </Button>
          )}
          {onPickModel && (
            <Button size="sm" onClick={onPickModel}>
              <Package size={15} /> {productId ? "החלפת דגם" : "בחירת דגם מהמאגר"}
            </Button>
          )}
          {productId && (
            <Button size="sm" variant="ghost" onClick={() => setDetails(true)}>
              <Info size={15} /> פרטי המוצר
            </Button>
          )}
        </div>
      )}
      {onPickModel && line && !line.extra && line.autoQty !== undefined && (
        <p className="text-xs text-slate-500">הדגם ייבחר גם במפה, ל{line.autoQty === 1 ? "פריט" : `-${line.autoQty} הפריטים`} שבשורה הזו.</p>
      )}
      {details && productId && <ProductModal id={productId} onClose={() => setDetails(false)} />}
      <Field label={isNew || extra ? "שם" : "שם בהצעה (לא חובה)"}>
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={line?.name} autoFocus={isNew} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={line?.autoQty !== undefined ? `כמות (במפה: ${line.autoQty})` : "כמות"}>
          <NumInput value={f.qty} onChange={(v) => setF({ ...f, qty: v })} placeholder={String(line?.autoQty ?? 1)} />
        </Field>
        {(isNew || extra) && (
          <Field label="יחידה">
            <Input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="יח׳, מ׳, שעה…" />
          </Field>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="מחיר ללקוח ליחידה (כולל מע״מ)">
          <NumInput value={f.price} onChange={(v) => setF({ ...f, price: v })} placeholder={line?.price !== undefined && f.price === undefined ? String(Math.round(withVat(line.price))) : ""} />
        </Field>
        <Field label="עלות ליחידה (כולל מע״מ)">
          <NumInput value={f.cost} onChange={(v) => setF({ ...f, cost: v })} placeholder={line?.cost !== undefined && f.cost === undefined ? String(Math.round(withVat(line.cost))) : ""} />
        </Field>
      </div>
      {line && !line.extra && (
        <p className="text-xs text-slate-500">
          {line.costFrom && `העלות: ${SOURCE[line.costFrom]}. `}
          {line.priceFrom && `המחיר: ${SOURCE[line.priceFrom]}. `}
          {line.costNote && `במחירון: ${line.costNote}. `}
          שדה ריק = חוזר לברירת המחדל.
        </p>
      )}
      {line && line.section === "equipment" && (line.productId || (line.detail && !line.generic)) && (
        <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-2.5 text-sm">
          <input type="checkbox" checked={f.showModel} onChange={(e) => setF({ ...f, showModel: e.target.checked })} className="mt-0.5 size-4 shrink-0 accent-slate-900" />
          <span>
            להציג ללקוח את הדגם
            <span className="block text-xs text-slate-500">בלי סימון הלקוח רואה רק מה המוצר עושה (רזולוציה, טווח, אנליטיקות), בלי יצרן, דגם ותמונה.</span>
          </span>
        </label>
      )}
      {canKeep && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="size-4 accent-slate-900" />
          להשתמש בעלות ובמחיר האלה גם בפרויקטים הבאים
        </label>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- links for the customer

interface ShareLink {
  id: string;
  token: string;
  showPrices: boolean;
  expiresAt?: number;
  revokedAt?: number;
  views: number;
  lastViewAt?: number;
  createdAt: number;
}

/** Links the customer opens the project's page with: the planned equipment on their plan, with or without the prices. */
function ShareCard({ accountId, siteId }: { accountId: string; siteId: string }) {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const base = `/api/accounts/${accountId}/projects/${siteId}/links`;

  useEffect(() => {
    let alive = true;
    authApi<{ links: ShareLink[] }>(base, "GET")
      .then((r) => alive && setLinks(r.links))
      .catch((e: Error) => toast(e.message, "error"));
    return () => {
      alive = false;
    };
  }, [base]);

  const create = async (showPrices: boolean) => {
    setBusy(true);
    try {
      setLinks((await authApi<{ links: ShareLink[] }>(base, "POST", { showPrices, days: Number(days) || undefined })).links);
      toast("נוצר קישור חדש");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (l: ShareLink) => {
    const ok = await askConfirm({ title: "ביטול הקישור", message: "מי שיפתח את הקישור הזה יראה שהוא כבר לא בתוקף. אי אפשר להחזיר אותו (אפשר ליצור חדש).", danger: true, okLabel: "ביטול הקישור" });
    if (!ok) return;
    try {
      setLinks((await authApi<{ links: ShareLink[] }>(`${base}/${l.id}`, "DELETE")).links);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  // the server lists the links that still work
  const active = links ?? [];
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <div>
        <h2 className="font-semibold">שליחה ללקוח</h2>
        <p className="text-xs text-slate-500">קישור לדף עם תכנית הנכס, הציוד המתוכנן ורשימת הציוד. בלי כניסה למערכת, לצפייה בלבד, בלי כתובות IP וסיסמאות.</p>
      </div>
      <Field label="תוקף הקישור">
        <Select value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="7">שבוע</option>
          <option value="30">30 יום</option>
          <option value="90">3 חודשים</option>
          <option value="0">עד שאבטל</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => create(true)} disabled={busy}>
          <Link2 size={15} /> עם מחירים
        </Button>
        <Button onClick={() => create(false)} disabled={busy}>
          <EyeOff size={15} /> בלי מחירים
        </Button>
      </div>
      {active.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
          {active.map((l) => (
            <LinkRow key={l.id} link={l} onRevoke={() => revoke(l)} />
          ))}
        </div>
      )}
    </section>
  );
}

function LinkRow({ link: l, onRevoke }: { link: ShareLink; onRevoke: () => void }) {
  const url = typeof location === "undefined" ? `/q/${l.token}` : `${location.origin}/q/${l.token}`;
  const share = async () => {
    if (navigator.share) {
      await navigator.share({ url, title: "הצעת מחיר" }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url);
    toast("הקישור הועתק");
  };
  return (
    <div className="space-y-1.5 p-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-500">
        <b className="text-slate-800">{l.showPrices ? "עם מחירים" : "בלי מחירים"}</b>
        <span>{new Date(l.createdAt).toLocaleDateString("he-IL")}</span>
        <span>{l.expiresAt ? `עד ${new Date(l.expiresAt).toLocaleDateString("he-IL")}` : "בלי תאריך תפוגה"}</span>
        <span className="flex items-center gap-0.5">
          <Eye size={12} /> {l.views ? `נצפה ${l.views} פעמים` : "עוד לא נצפה"}
        </span>
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" variant="primary" className="flex-1" onClick={share}>
          {typeof navigator !== "undefined" && "share" in navigator ? <Share2 size={14} /> : <Copy size={14} />} שליחה / העתקה
        </Button>
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 sm:h-8" title="פתיחה כמו שהלקוח רואה">
          <ExternalLink size={14} />
        </a>
        <Button size="sm" variant="danger" onClick={onRevoke} title="ביטול הקישור">
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  );
}
