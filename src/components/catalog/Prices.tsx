"use client";

import { cx } from "../ui";
import { DEFAULT_MARKUP, customerPrice, nis, priceListName, withVat } from "@/lib/products/pricing";
import type { ProductFull, ProductSummary } from "@/lib/products/types";

/**
 * Prices on a product card, with VAT: the customer's price, then the cost, then the profit (before
 * VAT, which isn't income). Only the account's owners have prices (the server removes them for
 * everyone else), so for anyone else this shows nothing.
 */
export function CostTag({
  p,
  className,
  hideDisk,
}: {
  p: Pick<ProductSummary, "cost" | "costNote" | "msrp" | "markupPct">;
  className?: string;
  /** a recorder's disk is shown on its own next to it */
  hideDisk?: boolean;
}) {
  const note = hideDisk && p.costNote?.startsWith("כולל דיסק") ? undefined : p.costNote;
  const offer = customerPrice(p, p.markupPct ?? DEFAULT_MARKUP);
  if (p.cost === undefined && !p.costNote && !offer) return null;
  const profit = offer && p.cost !== undefined ? offer.net - p.cost : undefined;
  return (
    <span className={cx("inline-block text-[11px] text-slate-500", className)}>
      {offer && (
        <>
          ללקוח <b className="font-semibold text-slate-900">{nis(withVat(offer.net))}</b>
          {" · "}
        </>
      )}
      {p.cost !== undefined ? (
        <>
          עלות <b className="font-semibold text-slate-700">{nis(withVat(p.cost))}</b>
        </>
      ) : (
        `עלות: ${p.costNote ?? "לא ידועה"}`
      )}
      {profit !== undefined && <span className={profit < 0 ? "text-red-600" : "text-green-700"}> (רווח {nis(profit)} נטו)</span>}
      {" · כולל מע״מ"}
      {p.cost !== undefined && note ? ` · ${note}` : ""}
    </span>
  );
}

/** Prices in a product's full details: the cost, the maker's retail price, a customer price and the margin. */
export function PricesSection({ product }: { product: ProductFull }) {
  const { cost, msrp, costNote } = product;
  if (cost === undefined && msrp === undefined && !costNote) {
    return (
      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <h2 className="mb-1 font-semibold">
          מחירים <span className="text-xs font-normal text-slate-400">· רק לבעל החשבון</span>
        </h2>
        <p className="text-sm text-slate-500">
          אין מחיר למוצר הזה: אין לו עלות ממחירון, ובאתר היצרן אין לו מחיר. מחירון מייבאים במאגר המוצרים.
        </p>
      </section>
    );
  }
  const markup = product.markupPct ?? DEFAULT_MARKUP;
  const offer = customerPrice(product, markup);
  const margin = offer && cost !== undefined ? offer.net - cost : undefined;
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="mb-1 font-semibold">
        מחירים <span className="text-xs font-normal text-slate-400">· רק לבעל החשבון</span>
      </h2>
      <div className="divide-y divide-slate-100 text-sm">
        {offer && (
          <Line
            label="מחיר ללקוח"
            strong
            value={`${nis(withVat(offer.net))} כולל מע״מ`}
            sub={`${nis(offer.net)} לפני מע״מ · ${
              offer.source === "site" ? "לפי המחיר באתר היצרן" : `${offer.siteBelowCost ? "המחיר באתר נמוך מהעלות, לכן " : "הערכה: "}עלות + ${markup}%`
            }`}
          />
        )}
        <Line
          label="עלות"
          value={cost !== undefined ? `${nis(withVat(cost))} כולל מע״מ` : (costNote ?? "אין במחירון")}
          sub={[
            cost !== undefined && `${nis(cost)} לפני מע״מ`,
            cost !== undefined && costNote,
            product.costSource && priceListName(product.costSource),
            product.costAt && new Date(product.costAt).toLocaleDateString("he-IL"),
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        {margin !== undefined && cost ? (
          <Line label="רווח" value={`${nis(margin)} (${Math.round((margin / cost) * 100)}% על העלות)`} sub="נטו: בלי המע״מ, שעובר למס" />
        ) : null}
        {msrp !== undefined && <Line label="מחיר לצרכן באתר היצרן" value={`${nis(msrp)} כולל מע״מ`} />}
      </div>
    </section>
  );
}

function Line({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="flex items-start gap-2 py-2">
      <span className="w-36 shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 flex-1">
        <span className={strong ? "font-semibold text-slate-900" : "font-medium"}>{value}</span>
        {sub && <span className="block text-xs text-slate-400">{sub}</span>}
      </span>
    </div>
  );
}
