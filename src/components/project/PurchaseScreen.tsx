"use client";

import { useParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Check, CircleDashed, ClipboardList, FileText, HardHat, Package, Paperclip, Printer, Trash2, TriangleAlert, Upload } from "lucide-react";
import { AppShell } from "../AppShell";
import { Button, Empty, Field, Input, Modal, Select, cx } from "../ui";
import { askConfirm } from "../dialogs";
import { useQuote } from "./QuoteScreen";
import { useProjectFinance, versionText, type FinanceState } from "./useFinance";
import { useApp, uid } from "@/lib/store";
import { can, useRole } from "@/lib/access";
import { useSync } from "@/lib/sync";
import { beforeVat, nis, withVat } from "@/lib/products/pricing";
import { emptyDefaults, emptyFinance, type ProjectFinance, type Purchase, type Receipt } from "@/lib/quote";
import { purchaseSummary, receiptCheck, supplierOptions, type PurchaseLine } from "@/lib/purchase";
import { shrinkImage } from "@/lib/images";
import { toast } from "@/lib/toast";

/** A project's purchasing: what its quote needs, what was bought (from whom, for how much, on which receipt), and the real profit. */
export function PurchaseScreen() {
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
              { label: "רכש" },
            ]
          : []
      }
    >
      <PurchaseBody accountId={accountId} siteId={siteId} />
    </AppShell>
  );
}

function PurchaseBody({ accountId, siteId }: { accountId: string; siteId: string }) {
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
  if (!can.money(role)) {
    return (
      <div className="p-6">
        <Empty>הרכש, הספקים והעלויות גלויים רק לבעלי החשבון.</Empty>
      </div>
    );
  }
  return <Purchasing accountId={accountId} siteId={siteId} />;
}

const EMPTY_FINANCE = emptyFinance();
const EMPTY_DEFAULTS = emptyDefaults();
/** today, as a date field wants it */
const today = () => new Date().toLocaleDateString("sv-SE");
const shortDate = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "2-digit" }) : "");
const round2 = (n: number) => Math.round(n * 100) / 100;

type Editing = { line?: PurchaseLine; purchase?: Purchase; source: Purchase["source"] };

function Purchasing({ accountId, siteId }: { accountId: string; siteId: string }) {
  const { state, error, saving, change, saveDefaults } = useProjectFinance(accountId, siteId, "הרכש עודכן");
  const quote = useQuote(siteId, state?.finance ?? EMPTY_FINANCE, state?.defaults ?? EMPTY_DEFAULTS);
  const site = useApp((s) => s.sites.find((x) => x.id === siteId));
  const updateSite = useApp((s) => s.updateSite);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [uploading, setUploading] = useState(false);
  const sum = useMemo(() => purchaseSummary(quote, state?.finance ?? EMPTY_FINANCE), [quote, state?.finance]);

  if (error) return <p className="m-4 rounded-xl bg-red-50 p-4 text-sm text-red-700 sm:m-6">{error}</p>;
  if (!state) return <p className="p-10 text-center text-slate-400">טוען את הרכש…</p>;

  const suppliers = supplierOptions(state.finance, state.defaults.suppliers);

  /** a receipt's file goes up (a photo made lighter first); its details are part of the project's purchasing */
  const uploadReceipt = async (file: File, preset: Partial<Receipt> = {}): Promise<Receipt | undefined> => {
    setUploading(true);
    try {
      const pdf = file.type === "application/pdf";
      const body = pdf ? file : (await shrinkImage(file, 2200, 0.85)).blob;
      const res = await fetch(`/api/accounts/${accountId}/projects/${siteId}/receipts`, { method: "POST", headers: { "Content-Type": pdf ? "application/pdf" : "image/jpeg" }, body });
      const data = (await res.json().catch(() => ({}))) as { fileId?: string; mime?: string; error?: { message?: string } };
      if (!res.ok || !data.fileId) throw new Error(data.error?.message ?? "ההעלאה נכשלה");
      const r: Receipt = { id: uid(), fileId: data.fileId, mime: data.mime ?? "image/jpeg", date: today(), ...preset };
      change((f) => ({ ...f, receipts: [...(f.receipts ?? []), r] }));
      return r;
    } catch (e) {
      toast(e instanceof TypeError ? "אין חיבור לשרת: הקבלה לא הועלתה" : (e as Error).message, "error");
    } finally {
      setUploading(false);
    }
  };

  const savePurchase = (p: Purchase) => {
    change((f) => {
      const list = f.purchases ?? [];
      return { ...f, purchases: list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p] };
    });
    // a new supplier is offered in the account's next purchases too
    if (p.supplier && !(state.defaults.suppliers ?? []).includes(p.supplier)) {
      void saveDefaults({ ...state.defaults, suppliers: [p.supplier, ...(state.defaults.suppliers ?? [])].slice(0, 60) });
    }
  };
  const deletePurchase = (id: string) => change((f) => ({ ...f, purchases: (f.purchases ?? []).filter((x) => x.id !== id) }));
  const saveReceipt = (r: Receipt) => change((f) => ({ ...f, receipts: (f.receipts ?? []).map((x) => (x.id === r.id ? r : x)) }));
  const deleteReceipt = (id: string) =>
    change((f) => ({
      ...f,
      receipts: (f.receipts ?? []).filter((x) => x.id !== id),
      purchases: (f.purchases ?? []).map((p) => (p.receiptId === id ? { ...p, receiptId: undefined } : p)),
    }));

  const stage = site?.stage ?? "quote";
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold">רכש</h1>
            <span className={cx("rounded-full px-2 py-0.5 text-xs", saving ? "bg-slate-100 text-slate-500" : "bg-green-50 text-green-700")}>{versionText(state, saving)}</span>
          </div>
          <p className="text-sm text-slate-500">מה הפרויקט צריך, ממי נקנה ובכמה. הסכומים כולל מע״מ.</p>
        </div>
        <a
          href={`/a/${accountId}/s/${siteId}/purchase/order`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-white px-4 text-sm font-medium text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 sm:h-10"
        >
          <Printer size={16} /> דף הזמנה לספק
        </a>
      </div>

      {/* in hand or not, before going on site */}
      {sum.total === 0 ? (
        <Empty>אין עדיין מה לקנות: הציוד והכבלים מגיעים מהמפה ומההצעה.</Empty>
      ) : sum.ready ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-green-600 p-4 text-white">
          <Check size={26} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold">הכל נרכש: מוכן לשטח</div>
            <div className="text-sm text-green-100">{sum.total === 1 ? "הפריט בידיים" : `${sum.total} פריטים, כולם בידיים`}</div>
          </div>
          {(stage === "quote" || stage === "purchase") && (
            <Button onClick={() => updateSite(siteId, { stage: "install", stageAt: Date.now() })} className="shrink-0">
              <HardHat size={16} /> מעבר לשלב ביצוע
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="font-semibold">
              נרכשו {sum.done} מתוך {sum.total}
            </span>
            <span className="text-sm text-slate-500">עוד {sum.total - sum.done} לפני שיוצאים לשטח</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${(sum.done / sum.total) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          {sum.total > 0 && (
            <section className="rounded-2xl bg-white ring-1 ring-slate-200">
              <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 font-semibold">
                <ClipboardList size={16} className="text-slate-400" /> מה צריך לקנות
              </h2>
              <div className="divide-y divide-slate-100">
                {sum.lines.map((pl) => (
                  <LineRow
                    key={pl.line.key}
                    pl={pl}
                    receipts={state.finance.receipts ?? []}
                    onAdd={(source) => setEditing({ line: pl, source })}
                    onEdit={(p) => setEditing({ line: pl, purchase: p, source: p.source })}
                  />
                ))}
              </div>
            </section>
          )}
          {sum.orphans.length > 0 && (
            <section className="rounded-2xl bg-white ring-1 ring-slate-200">
              <h2 className="border-b border-slate-100 px-4 py-2.5 font-semibold">
                נקנו לשורות שכבר לא בהצעה <span className="text-xs font-normal text-slate-400">· העלות שלהן עדיין נספרת</span>
              </h2>
              <ul className="space-y-1 p-3 text-xs">
                {sum.orphans.map((p) => (
                  <PurchaseChip key={p.id} p={p} unit="יח׳" receipts={state.finance.receipts ?? []} onClick={() => setEditing({ purchase: p, source: p.source })} withName />
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-4">
          <ProfitCard sum={sum} />
          <ReceiptsCard state={state} uploading={uploading} onUpload={(f) => uploadReceipt(f).then((r) => r && setReceipt(r))} onOpen={setReceipt} />
        </div>
      </div>

      {editing && (
        <PurchaseEditor
          key={editing.purchase?.id ?? editing.line?.line.key}
          editing={editing}
          suppliers={suppliers}
          receipts={state.finance.receipts ?? []}
          onUpload={uploadReceipt}
          onSave={(p) => {
            savePurchase(p);
            setEditing(null);
          }}
          onDelete={
            editing.purchase
              ? () => {
                  deletePurchase(editing.purchase!.id);
                  setEditing(null);
                }
              : undefined
          }
          onClose={() => setEditing(null)}
        />
      )}
      {receipt && (
        <ReceiptEditor
          key={receipt.id}
          receipt={receipt}
          finance={state.finance}
          suppliers={suppliers}
          onSave={(r) => {
            saveReceipt(r);
            setReceipt(null);
          }}
          onDelete={async () => {
            const ok = await askConfirm({ title: "מחיקת הקבלה", message: "הקבלה תימחק מהפרויקט. הרכישות שקושרו אליה נשארות, בלי קבלה.", danger: true, okLabel: "מחיקה" });
            if (!ok) return;
            deleteReceipt(receipt.id);
            setReceipt(null);
          }}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
}

const STATE_ICON = {
  done: { icon: Check, cls: "bg-green-100 text-green-700" },
  partial: { icon: CircleDashed, cls: "bg-amber-100 text-amber-700" },
  todo: { icon: Package, cls: "bg-slate-100 text-slate-500" },
} as const;

function LineRow({ pl, receipts, onAdd, onEdit }: { pl: PurchaseLine; receipts: Receipt[]; onAdd: (s: Purchase["source"]) => void; onEdit: (p: Purchase) => void }) {
  const { line } = pl;
  // the average a unit actually cost, over what's been bought or taken from stock
  const unitActual = pl.covered > 0 ? pl.actual / pl.covered : undefined;
  // the line's profit: the customer's price, less the real cost so far and the quote's for the rest
  const lineProfit = line.price !== undefined && (pl.covered > 0 || line.cost !== undefined) ? line.price * line.qty - pl.actual - pl.remaining : undefined;
  const st = STATE_ICON[pl.state];
  const Icon = st.icon;
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className={cx("grid size-8 shrink-0 place-items-center rounded-full", st.cls)}>
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{line.name}</div>
          {line.detail && (
            <div dir="auto" className="truncate text-right text-xs text-slate-500">
              {line.detail}
            </div>
          )}
          <div className="text-xs text-slate-500">
            צריך {line.qty} {line.unit}
            {pl.covered > 0 && pl.state !== "done" && <span className="text-amber-700"> · יש {pl.covered}</span>}
            {pl.state === "done" && <span className="text-green-700"> · נרכש</span>}
          </div>
          {/* what the customer agreed to pay for it, then what it costs (bought, or by the quote), then the profit */}
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
            {line.price !== undefined ? (
              <span>
                ללקוח <b className="font-semibold text-slate-900">{nis(withVat(line.price))}</b> ליח׳
              </span>
            ) : (
              <span className="text-amber-700">אין מחיר ללקוח בהצעה</span>
            )}
            {unitActual !== undefined ? (
              <span>עלות בפועל {nis(withVat(unitActual))}</span>
            ) : (
              line.cost !== undefined && <span>עלות בהצעה {nis(withVat(line.cost))}</span>
            )}
            {lineProfit !== undefined && <span className={lineProfit < 0 ? "text-red-600" : "text-green-700"}>(רווח {nis(lineProfit)} נטו)</span>}
          </div>
        </div>
        {pl.state !== "done" && (
          <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
            <Button size="sm" variant="primary" onClick={() => onAdd("bought")}>
              נרכש
            </Button>
            <Button size="sm" onClick={() => onAdd("stock")}>
              מהמלאי
            </Button>
          </div>
        )}
      </div>
      {pl.purchases.length > 0 && (
        <ul className="mt-2 space-y-1 ps-11 text-xs">
          {pl.purchases.map((p) => (
            <PurchaseChip key={p.id} p={p} unit={line.unit} receipts={receipts} onClick={() => onEdit(p)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PurchaseChip({ p, unit, receipts, onClick, withName }: { p: Purchase; unit: string; receipts: Receipt[]; onClick: () => void; withName?: boolean }) {
  const r = p.receiptId ? receipts.find((x) => x.id === p.receiptId) : undefined;
  return (
    <li>
      <button onClick={onClick} className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-start hover:bg-slate-100">
        {withName && <b className="font-medium text-slate-800">{p.name}</b>}
        <span className="font-medium text-slate-700">{p.source === "stock" ? "מהמלאי" : (p.supplier ?? "ספק לא צוין")}</span>
        <span className="text-slate-500">
          {p.qty} {unit}
        </span>
        <span className="text-slate-500">{p.unitCost !== undefined ? `${nis(withVat(p.unitCost))} ליח׳` : "בלי עלות"}</span>
        {p.date && <span className="text-slate-400">{shortDate(p.date)}</span>}
        {r && (
          <span className="flex items-center gap-0.5 text-blue-700">
            <Paperclip size={11} /> {r.number ? `קבלה ${r.number}` : "קבלה"}
          </span>
        )}
      </button>
    </li>
  );
}

function ProfitCard({ sum }: { sum: ReturnType<typeof purchaseSummary> }) {
  const diff = sum.profit - sum.quotedProfit;
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="mb-2 font-semibold">
        רווח הפרויקט <span className="text-xs font-normal text-slate-400">· כולל מע״מ</span>
      </h2>
      <div className="space-y-1 text-sm">
        <Line label="סה״כ ללקוח" value={nis(withVat(sum.net))} />
        <Line label="עלות בפועל (מה שנקנה)" value={nis(withVat(sum.actualCost))} />
        {sum.remainingCost > 0 && <Line label="עלות צפויה (מה שנשאר)" value={nis(withVat(sum.remainingCost))} />}
        {sum.laborCost > 0 && <Line label="עלות עבודה" value={nis(withVat(sum.laborCost))} />}
      </div>
      <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
        <Line
          label={`רווח ${sum.ready ? "בפועל" : "צפוי"} (נטו)`}
          strong
          value={
            <span className={sum.profit < 0 ? "text-red-600" : "text-green-700"}>
              {nis(sum.profit)} <span className="text-xs">({Math.round(sum.marginPct)}%)</span>
            </span>
          }
        />
        {Math.abs(diff) >= 1 && (
          <p className={cx("mt-1 text-xs", diff > 0 ? "text-green-700" : "text-red-600")}>
            {diff > 0 ? `${nis(diff)} יותר` : `${nis(-diff)} פחות`} ממה שתוכנן בהצעה ({nis(sum.quotedProfit)})
          </p>
        )}
        {!sum.ready && sum.remainingCost > 0 && <p className="mt-1 text-xs text-slate-400">מה שעוד לא נקנה נספר לפי העלות בהצעה</p>}
      </div>
    </section>
  );
}

function Line({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-3", strong && "font-semibold")}>
      <span className={strong ? "text-slate-800" : "text-slate-500"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** A file picker for a receipt: on a phone it offers the camera too. */
function UploadButton({ onFile, busy, label = "העלאת קבלה", className }: { onFile: (f: File) => void; busy: boolean; label?: string; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button size="sm" onClick={() => ref.current?.click()} disabled={busy} className={className}>
        <Upload size={14} /> {busy ? "מעלה…" : label}
      </Button>
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </>
  );
}

function ReceiptsCard({ state, uploading, onUpload, onOpen }: { state: FinanceState; uploading: boolean; onUpload: (f: File) => void; onOpen: (r: Receipt) => void }) {
  const receipts = state.finance.receipts ?? [];
  return (
    <section className="rounded-2xl bg-white ring-1 ring-slate-200">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <h2 className="min-w-0 flex-1 font-semibold">
          קבלות <span className="text-xs font-normal text-slate-400">· רק לבעלי החשבון</span>
        </h2>
        <UploadButton onFile={onUpload} busy={uploading} />
      </div>
      {receipts.length ? (
        <ul className="divide-y divide-slate-100">
          {receipts.map((r) => {
            const check = receiptCheck(r, state.finance);
            return (
              <li key={r.id}>
                <button onClick={() => onOpen(r)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-slate-50">
                  <ReceiptThumb r={r} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {r.supplier ?? "ספק לא צוין"}
                      {r.number && <span className="font-normal text-slate-500"> · {r.number}</span>}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {shortDate(r.date)}
                      {r.totalWithVat !== undefined && ` · ${nis(r.totalWithVat)}`}
                      {" · "}
                      {check.purchases.length ? (
                        check.purchases.length === 1 ? "פריט אחד" : `${check.purchases.length} פריטים`
                      ) : (
                        <span className="text-amber-700">לא קושרו פריטים</span>
                      )}
                    </span>
                  </span>
                  {check.matches === true && <Check size={16} className="shrink-0 text-green-600" />}
                  {check.matches === false && <TriangleAlert size={16} className="shrink-0 text-amber-600" />}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 py-3 text-sm text-slate-500">מצלמים או מעלים את הקבלה מהספק, ומקשרים אליה את הפריטים שנקנו בה.</p>
      )}
    </section>
  );
}

function ReceiptThumb({ r, large }: { r: Receipt; large?: boolean }) {
  if (r.mime === "application/pdf") {
    return (
      <span className={cx("grid shrink-0 place-items-center rounded-lg bg-red-50 text-red-700", large ? "size-16" : "size-10")}>
        <FileText size={large ? 26 : 18} />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- a private file, served by our API with the session cookie
  return <img src={`/api/files/${r.fileId}`} alt="" className={cx("shrink-0 rounded-lg bg-slate-50 object-cover ring-1 ring-slate-200", large ? "size-16" : "size-10")} />;
}

function PurchaseEditor({
  editing,
  suppliers,
  receipts,
  onUpload,
  onSave,
  onDelete,
  onClose,
}: {
  editing: Editing;
  suppliers: string[];
  receipts: Receipt[];
  onUpload: (f: File, preset?: Partial<Receipt>) => Promise<Receipt | undefined>;
  onSave: (p: Purchase) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { line, purchase } = editing;
  const left = line ? Math.max(1, line.line.qty - line.covered) : 1;
  const estimate = line?.line.cost;
  const gross = (v?: number) => (v === undefined ? "" : String(round2(withVat(v))));
  const [f, setF] = useState(() => ({
    source: editing.source,
    qty: String(purchase?.qty ?? left),
    // bought at the quote's cost unless told otherwise; stock has no cost unless given one
    cost: purchase ? gross(purchase.unitCost) : editing.source === "bought" ? gross(estimate) : "",
    supplier: purchase?.supplier ?? suppliers[0] ?? "",
    date: purchase?.date ?? today(),
    receiptId: purchase?.receiptId ?? "",
  }));
  const [uploading, setUploading] = useState(false);
  const bought = f.source === "bought";
  const qty = Number(f.qty.replace(",", "."));
  const cost = f.cost.trim() === "" ? undefined : Number(f.cost.replace(",", "."));
  const valid = qty > 0 && (cost === undefined || cost >= 0);
  const unit = line?.line.unit ?? "יח׳";

  const save = () =>
    onSave({
      id: purchase?.id ?? uid(),
      lineKey: purchase?.lineKey ?? line!.line.key,
      name: line?.line.name ?? purchase?.name ?? "",
      qty,
      source: f.source,
      supplier: bought ? f.supplier.trim() || undefined : undefined,
      unitCost: cost === undefined ? undefined : beforeVat(cost),
      date: f.date || undefined,
      receiptId: bought ? f.receiptId || undefined : undefined,
    });

  return (
    <Modal
      title={purchase ? "רכישה" : bought ? "נרכש" : "מהמלאי"}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={save} disabled={!valid}>
            שמירה
          </Button>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <span className="flex-1 max-sm:hidden" />
          {onDelete && (
            <Button variant="danger" onClick={onDelete}>
              <Trash2 size={15} /> מחיקה
            </Button>
          )}
        </>
      }
    >
      <div>
        <div className="font-medium">{line?.line.name ?? purchase?.name}</div>
        {line?.line.detail && (
          <div dir="auto" className="text-right text-xs text-slate-500">
            {line.line.detail}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {(
          [
            ["bought", "נקנה מספק"],
            ["stock", "מהמלאי שלנו"],
          ] as const
        ).map(([v, label]) => (
          <button key={v} onClick={() => setF({ ...f, source: v })} className={cx("h-9 rounded-lg text-sm", f.source === v ? "bg-white font-medium shadow-sm" : "text-slate-500")}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`כמות (${unit})${line ? ` · צריך ${line.line.qty}` : ""}`}>
          <Input value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} inputMode="decimal" className="ltr text-center" />
        </Field>
        <Field label={bought ? "עלות ליחידה (כולל מע״מ)" : "עלות ליחידה (לא חובה)"}>
          <Input
            value={f.cost}
            onChange={(e) => setF({ ...f, cost: e.target.value })}
            inputMode="decimal"
            className="ltr text-center"
            placeholder={estimate !== undefined ? String(Math.round(withVat(estimate))) : ""}
          />
        </Field>
      </div>
      {bought && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ספק">
              <Input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} list="netmap-suppliers" placeholder="פיקוק, טלדור…" />
              <datalist id="netmap-suppliers">
                {suppliers.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="תאריך רכישה">
              <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            </Field>
          </div>
          <Field label="קבלה">
            <div className="flex gap-2">
              <Select value={f.receiptId} onChange={(e) => setF({ ...f, receiptId: e.target.value })} className="min-w-0 flex-1">
                <option value="">בלי קבלה (אפשר לקשר אחר כך)</option>
                {receipts.map((r) => (
                  <option key={r.id} value={r.id}>
                    {[r.supplier ?? "ספק לא צוין", r.number && `מס׳ ${r.number}`, shortDate(r.date)].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </Select>
              <UploadButton
                busy={uploading}
                label="חדשה"
                className="shrink-0"
                onFile={async (file) => {
                  setUploading(true);
                  const r = await onUpload(file, { supplier: f.supplier.trim() || undefined, date: f.date || undefined });
                  setUploading(false);
                  if (r) setF((cur) => ({ ...cur, receiptId: r.id }));
                }}
              />
            </div>
          </Field>
        </>
      )}
      {!bought && <p className="text-xs text-slate-500">ציוד שכבר היה במלאי (כבלים, מחברים…). עלות היא לא חובה: בלי עלות, הוא לא מוריד מהרווח.</p>}
    </Modal>
  );
}

function ReceiptEditor({
  receipt,
  finance,
  suppliers,
  onSave,
  onDelete,
  onClose,
}: {
  receipt: Receipt;
  finance: ProjectFinance;
  suppliers: string[];
  onSave: (r: Receipt) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [f, setF] = useState(() => ({
    supplier: receipt.supplier ?? "",
    number: receipt.number ?? "",
    date: receipt.date ?? "",
    total: receipt.totalWithVat === undefined ? "" : String(receipt.totalWithVat),
  }));
  const total = f.total.trim() === "" ? undefined : Number(f.total.replace(",", "."));
  const check = receiptCheck({ ...receipt, totalWithVat: total }, finance);
  const url = `/api/files/${receipt.fileId}`;
  return (
    <Modal
      title="קבלה"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="primary"
            disabled={total !== undefined && !(total >= 0)}
            onClick={() => onSave({ ...receipt, supplier: f.supplier.trim() || undefined, number: f.number.trim() || undefined, date: f.date || undefined, totalWithVat: total })}
          >
            שמירה
          </Button>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <span className="flex-1 max-sm:hidden" />
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={15} /> מחיקה
          </Button>
        </>
      }
    >
      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl p-2 ring-1 ring-slate-200 hover:bg-slate-50">
        <ReceiptThumb r={receipt} large />
        <span className="text-sm font-medium text-blue-700">{receipt.mime === "application/pdf" ? "פתיחת ה-PDF" : "פתיחת התמונה בגודל מלא"}</span>
      </a>
      <div className="grid grid-cols-2 gap-3">
        <Field label="ספק">
          <Input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} list="netmap-suppliers-r" />
          <datalist id="netmap-suppliers-r">
            {suppliers.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="מספר קבלה / חשבונית">
          <Input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} className="ltr text-center" />
        </Field>
        <Field label="תאריך">
          <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="סכום בקבלה (כולל מע״מ)">
          <Input value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} inputMode="decimal" className="ltr text-center" />
        </Field>
      </div>
      <div className="rounded-xl bg-slate-50 p-3 text-sm">
        <div className="mb-1 font-medium">מה נקנה בקבלה הזו</div>
        {check.purchases.length ? (
          <>
            <ul className="space-y-0.5 text-xs text-slate-600">
              {check.purchases.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {p.name} × {p.qty}
                  </span>
                  <span className="shrink-0 tabular-nums">{nis(withVat(p.qty * (p.unitCost ?? 0)))}</span>
                </li>
              ))}
            </ul>
            <div className="mt-1.5 flex justify-between border-t border-slate-200 pt-1.5 text-xs font-medium">
              <span>סה״כ הפריטים</span>
              <span className="tabular-nums">{nis(check.sumWithVat)}</span>
            </div>
            {check.matches === false && (
              <p className="mt-1.5 flex gap-1.5 text-xs text-amber-800">
                <TriangleAlert size={14} className="shrink-0" /> לא תואם לסכום בקבלה ({nis(total ?? 0)}): בודקים כמויות ומחירים, או פריט שחסר בקישור.
              </p>
            )}
            {check.matches === true && (
              <p className="mt-1.5 flex gap-1.5 text-xs text-green-700">
                <Check size={14} className="shrink-0" /> תואם לסכום בקבלה
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-slate-500">עדיין לא קושרו פריטים. בכל פריט ב״נרכש״ בוחרים את הקבלה הזו.</p>
        )}
      </div>
    </Modal>
  );
}
