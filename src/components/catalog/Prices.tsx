"use client";

import { cx } from "../ui";
import { DEFAULT_MARKUP, VAT, customerPrice, nis, priceListName } from "@/lib/products/pricing";
import type { ProductFull, ProductSummary } from "@/lib/products/types";

/**
 * The cost on a product card. Only the account holder ever has prices (the server removes them
 * for everyone else), so for anyone else this shows nothing.
 */
export function CostTag({ p, className }: { p: Pick<ProductSummary, "cost" | "costNote">; className?: string }) {
  if (p.cost === undefined && !p.costNote) return null;
  return (
    <span className={cx("inline-block text-[11px] text-slate-500", className)}>
      {p.cost !== undefined ? (
        <>
          עלות <b className="font-semibold text-slate-700">{nis(p.cost)}</b> + מע״מ{p.costNote ? ` · ${p.costNote}` : ""}
        </>
      ) : (
        `מחיר: ${p.costNote}`
      )}
    </span>
  );
}

/** Prices in a product's full details: the cost, the maker's retail price, a customer price and the margin. */
export function PricesSection({ product }: { product: ProductFull }) {
  const { cost, msrp, costNote } = product;
  if (cost === undefined && msrp === undefined && !costNote) return null;
  const markup = product.markupPct ?? DEFAULT_MARKUP;
  const offer = customerPrice(product, markup);
  const margin = offer && cost !== undefined ? offer.net - cost : undefined;
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="mb-1 font-semibold">
        מחירים <span className="text-xs font-normal text-slate-400">· רק לבעל החשבון</span>
      </h2>
      <div className="divide-y divide-slate-100 text-sm">
        <Line
          label="עלות"
          value={cost !== undefined ? `${nis(cost)} + מע״מ` : (costNote ?? "אין במחירון")}
          sub={[cost !== undefined ? costNote : undefined, product.costSource && priceListName(product.costSource), product.costAt && new Date(product.costAt).toLocaleDateString("he-IL")].filter(Boolean).join(" · ")}
        />
        {msrp !== undefined && <Line label="מחיר לצרכן באתר היצרן" value={`${nis(msrp)} כולל מע״מ`} />}
        {offer && (
          <Line
            label="מחיר מוצע ללקוח"
            strong
            value={`${nis(offer.net)} + מע״מ`}
            sub={`${nis(offer.net * (1 + VAT))} כולל מע״מ · ${
              offer.source === "site" ? "לפי המחיר באתר היצרן" : `${offer.siteBelowCost ? "המחיר באתר נמוך מהעלות, לכן " : "הערכה: "}עלות + ${markup}%`
            }`}
          />
        )}
        {margin !== undefined && cost && <Line label="רווח" value={`${nis(margin)} (${Math.round((margin / cost) * 100)}%)`} />}
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
