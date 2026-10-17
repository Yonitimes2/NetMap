"use client";

import { useParams } from "next/navigation";
import { useSeesPrices } from "@/lib/access";
import { useEffect, useState } from "react";
import { AppShell } from "../AppShell";
import { Field, Select } from "../ui";
import { authApi, useSession } from "@/lib/session-client";
import { toast } from "@/lib/toast";
import { DEVICE_TYPES } from "@/lib/catalog";
import { ProductDetails } from "./ProductDetails";
import { CATEGORY_LABEL, type ProductFull } from "@/lib/products/types";

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
  const showPrices = useSeesPrices();
  return (
    <AppShell crumbs={[{ label: "מאגר מוצרים", href: "/admin/catalog" }, { label: product?.model ?? "" }]}>
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        {error ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        ) : !product ? (
          <p className="p-10 text-center text-slate-400">טוען…</p>
        ) : (
          <ProductDetails product={product} showPrices={showPrices} onSave={isAdmin ? save : undefined} side={isAdmin && <Placement product={product} onSave={save} />} />
        )}
      </div>
    </AppShell>
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
