"use client";

import { Check, CircleAlert, Info, Package, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Modal, cx } from "../ui";
import { CostTag } from "../catalog/Prices";
import { ProductModal } from "../catalog/ProductDetails";
import { useCatalog } from "@/lib/products/client";
import { bestPerCamera, matchCameras, matchKindOf, matchNvr, matchSwitch, type Match, type MatchContext } from "@/lib/products/match";
import { NIGHTS, PURPOSES, type Night, type Purpose } from "@/lib/products/suggest";
import type { ProductSummary } from "@/lib/products/types";
import type { Device } from "@/lib/types";

const LEVEL = {
  good: { label: "מתאימה", cls: "bg-green-50 text-green-700" },
  ok: { label: "מתאימה, עם הערות", cls: "bg-amber-50 text-amber-700" },
  weak: { label: "חלקית", cls: "bg-red-50 text-red-700" },
} as const;

/**
 * A model for a quote line's equipment, matched to what the map knows about it: cameras by their
 * spots and cones (and what they have to show), a recorder by the site's cameras, a switch by what's
 * cabled to it. Choosing one gives the model to all the line's equipment on the map.
 */
export function MatchDialog({
  title,
  devices,
  ctx,
  onPick,
  onPickEach,
  onClose,
}: {
  title: string;
  /** the line's equipment on the map */
  devices: Device[];
  ctx: MatchContext;
  /** `fovs`: cameras get the angle the model covers for them */
  onPick: (p: ProductSummary, fovs?: Record<string, number>) => void;
  onPickEach: (picks: { d: Device; p: ProductSummary; fov?: number }[]) => void;
  onClose: () => void;
}) {
  const { products, load, error } = useCatalog();
  useEffect(() => void load(), [load]);
  const kind = matchKindOf(devices[0]?.type);
  const [purpose, setPurpose] = useState<Purpose>("observe");
  const [night, setNight] = useState<Night>("bw");
  const [details, setDetails] = useState<string | null>(null);

  const result = useMemo(() => {
    if (!products || !kind) return null;
    if (kind === "camera") return matchCameras(products, devices, ctx, purpose, night);
    if (kind === "nvr") return matchNvr(products, devices, ctx);
    return matchSwitch(products, devices, ctx);
  }, [products, kind, devices, ctx, purpose, night]);
  const each = useMemo(
    () => (products && kind === "camera" && devices.length > 1 ? bestPerCamera(products, devices, ctx, purpose, night) : null),
    [products, kind, devices, ctx, purpose, night],
  );
  const eachDiffers = !!each && new Set(each.map((x) => x.m?.p.id ?? "")).size > 1;

  return (
    <Modal wide title={title} onClose={onClose}>
      {error ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>
      ) : !result ? (
        <p className="p-6 text-center text-sm text-slate-400">טוען את מאגר המוצרים…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-50 p-2.5 text-xs">
            <span className="font-medium text-slate-600">ידוע מהמפה:</span>
            {result.facts.map((f) => (
              <span key={f} className="rounded-full bg-white px-2 py-0.5 text-slate-700 ring-1 ring-slate-200">
                {f}
              </span>
            ))}
          </div>

          {kind === "camera" && (
            <div className="space-y-2">
              <div>
                <div className="mb-1 text-xs font-medium text-slate-600">מה צריך לראות בקצה הטווח?</div>
                <Chips>
                  {PURPOSES.map((p) => (
                    <Chip key={p.id} active={purpose === p.id} onClick={() => setPurpose(p.id)}>
                      {p.short}
                    </Chip>
                  ))}
                </Chips>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-slate-600">ראייה בלילה</div>
                <Chips>
                  {NIGHTS.map((n) => (
                    <Chip key={n.id} active={night === n.id} onClick={() => setNight(n.id)}>
                      {n.label}
                    </Chip>
                  ))}
                </Chips>
              </div>
            </div>
          )}

          {result.list.length ? (
            <div className="space-y-2">
              {result.list.map((m) => (
                <MatchCard key={m.p.id} m={m} count={devices.length} onPick={() => onPick(m.p, m.fovs)} onDetails={() => setDetails(m.p.id)} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">אין במאגר דגם שיש לו את הנתונים לבדוק אותו מול מה שבמפה. אפשר לבחור דגם ידנית מהמאגר.</p>
          )}

          {eachDiffers && each && (
            <section className="space-y-2 rounded-xl p-3 ring-1 ring-slate-200">
              <div>
                <h3 className="text-sm font-semibold">או: לכל מצלמה את הדגם שהכי מתאים לה</h3>
                <p className="text-xs text-slate-500">המצלמות עומדות במקומות שונים, ולכן הדגם הטוב לכל אחת שונה.</p>
              </div>
              <div className="divide-y divide-slate-100 text-sm">
                {each.map(({ d, m }) => (
                  <div key={d.id} className="flex items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate">{d.label}</span>
                    {m ? (
                      <span className="shrink-0 text-end">
                        <span className="ltr block text-xs font-semibold">{m.p.model}</span>
                        <CostTag p={m.p} />
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-amber-700">אין דגם שמתאים לגמרי</span>
                    )}
                  </div>
                ))}
              </div>
              <Button
                className="w-full"
                onClick={() => onPickEach(each.filter((x) => x.m).map((x) => ({ d: x.d, p: x.m!.p, fov: x.fov })))}
                disabled={!each.some((x) => x.m)}
              >
                <Check size={15} /> לבחור לכל מצלמה את הדגם שלה
              </Button>
            </section>
          )}
        </>
      )}
      {details && <ProductModal id={details} onClose={() => setDetails(null)} />}
    </Modal>
  );
}

function MatchCard({ m, count, onPick, onDetails }: { m: Match; count: number; onPick: () => void; onDetails: () => void }) {
  const lv = LEVEL[m.level];
  return (
    <div className="rounded-xl p-3 ring-1 ring-slate-200">
      <div className="flex gap-3">
        <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-50">
          {m.p.imageId ? (
            // eslint-disable-next-line @next/next/no-img-element -- served by our API with the session cookie
            <img src={`/api/catalog/images/${m.p.imageId}?w=160`} alt="" loading="lazy" className="size-full object-contain" />
          ) : (
            <Package size={20} className="text-slate-300" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="ltr text-sm font-semibold">{m.p.model}</span>
            <span className="text-[11px] text-slate-400">{m.p.brandName}</span>
            <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", lv.cls)}>{lv.label}</span>
          </div>
          <div className="line-clamp-1 text-xs text-slate-500">{m.p.name}</div>
          <CostTag p={m.p} hideDisk />
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 text-xs">
        {m.pros.map((t) => (
          <li key={t} className="flex gap-1.5 text-green-800">
            <Check size={13} className="mt-0.5 shrink-0" /> {t}
          </li>
        ))}
        {m.notes.map((t) => (
          <li key={t} className="flex gap-1.5 text-amber-800">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" /> {t}
          </li>
        ))}
        {m.misses.map((t) => (
          <li key={t} className="flex gap-1.5 text-red-700">
            <CircleAlert size={13} className="mt-0.5 shrink-0" /> {t}
          </li>
        ))}
      </ul>
      {m.hardest && (
        <p className="mt-1 text-[11px] text-slate-500">
          {m.fit === count ? `מתאימה לכל ${count} המצלמות` : `מתאימה ל-${m.fit} מתוך ${count} המצלמות`} · הפרטים לפי הקשה שבהן: {m.hardest}
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="primary" className="flex-1" onClick={onPick}>
          <Check size={14} /> בחירה{count > 1 ? ` לכל ${count}` : ""}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDetails}>
          <Info size={14} /> פרטים מלאים
        </Button>
      </div>
    </div>
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
