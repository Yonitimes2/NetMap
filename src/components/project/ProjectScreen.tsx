"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Building2, Check, ChevronLeft, FileText, Layers, ShoppingCart, Map as MapIcon, MapPin, Pencil, Trash2 } from "lucide-react";
import { AppShell } from "../AppShell";
import { Button, Empty, Field, Input, Modal, Textarea, cx } from "../ui";
import { askConfirm } from "../dialogs";
import { StageBadge, StageBar } from "./Stages";
import { useApp } from "@/lib/store";
import { can, useRole } from "@/lib/access";
import { useSync } from "@/lib/sync";
import { equipmentSummary, stageDef, stageOf } from "@/lib/project";
import { useQuote } from "./QuoteScreen";
import { authApi } from "@/lib/session-client";
import { nis } from "@/lib/products/pricing";
import { emptyDefaults, emptyFinance, type ProjectFinance, type QuoteDefaults } from "@/lib/quote";
import { purchaseSummary, type PurchaseSummary } from "@/lib/purchase";
import type { Site } from "@/lib/types";

/** A project's own page: where it stands, what its map holds, and the way into the map. */
export function ProjectScreen() {
  const { accountId, siteId } = useParams<{
    accountId: string;
    siteId: string;
  }>();
  const account = useApp((s) => s.accounts.find((a) => a.id === accountId));
  const site = useApp((s) => s.sites.find((x) => x.id === siteId));
  const allowed = can.view(useRole(accountId));
  return (
    <AppShell crumbs={allowed ? [{ label: account?.name ?? "", href: `/a/${accountId}` }, { label: site?.name ?? "" }] : []}>
      <ProjectBody accountId={accountId} siteId={siteId} />
    </AppShell>
  );
}

function ProjectBody({ accountId, siteId }: { accountId: string; siteId: string }) {
  const site = useApp((s) => s.sites.find((x) => x.id === siteId && x.accountId === accountId));
  const account = useApp((s) => s.accounts.find((a) => a.id === accountId));
  const updateSite = useApp((s) => s.updateSite);
  const role = useRole(accountId);
  const syncReady = useSync((s) => s.ready);
  const [editing, setEditing] = useState(false);

  if (!site && !syncReady) return <p className="p-10 text-center text-slate-400">טוען…</p>;
  if (!site || !account || !can.view(role)) {
    return (
      <div className="p-6">
        <Empty>אין לך גישה לפרויקט הזה, או שהוא לא קיים.</Empty>
      </div>
    );
  }

  const stage = stageOf(site);
  const def = stageDef(stage);
  const mapHref = `/a/${accountId}/s/${siteId}/map`;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold">{site.name}</h1>
            <StageBadge stage={stage} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <Link href={`/a/${accountId}`} className="flex items-center gap-1 hover:text-slate-900">
              <Building2 size={14} /> {account.name}
            </Link>
            {site.address && (
              <span className="flex items-center gap-1">
                <MapPin size={14} /> {site.address}
              </span>
            )}
          </div>
        </div>
        {can.manageSites(role) && (
          <Button onClick={() => setEditing(true)} className="shrink-0" aria-label="עריכת פרטי הפרויקט">
            <Pencil size={15} /> <span className="max-sm:hidden">עריכה</span>
          </Button>
        )}
      </div>

      <StageBar stage={stage} onPick={can.runProject(role) ? (s) => updateSite(siteId, { stage: s, stageAt: Date.now() }) : undefined} />
      <p className="px-1 text-sm text-slate-500">
        <b className="text-slate-700">{def.label}:</b> {def.about}
      </p>

      <div className="grid items-start gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <MapCard siteId={siteId} href={mapHref} />
          <QuoteCard accountId={accountId} siteId={siteId} owner={can.money(role)} />
        </div>
        <EquipmentCard siteId={siteId} href={mapHref} />
      </div>

      {site.notes && (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <h2 className="mb-1 font-semibold">הערות</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{site.notes}</p>
        </section>
      )}

      {editing && <EditProject site={site} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** The way into the quote (for the account's owners, with its total and estimated profit) and into purchasing. */
function QuoteCard({ accountId, siteId, owner }: { accountId: string; siteId: string; owner: boolean }) {
  const [state, setState] = useState<{
    finance: ProjectFinance;
    defaults: QuoteDefaults;
  } | null>(null);
  useEffect(() => {
    if (!owner) return;
    let alive = true;
    authApi<{ finance: ProjectFinance; defaults: QuoteDefaults }>(`/api/accounts/${accountId}/projects/${siteId}/finance`, "GET")
      .then((r) => alive && setState(r))
      .catch(() => undefined); // a project that isn't on the server yet: the card shows no numbers
    return () => {
      alive = false;
    };
  }, [accountId, siteId, owner]);
  const quote = useQuote(siteId, state?.finance ?? NO_FINANCE, state?.defaults ?? NO_DEFAULTS);
  const t = quote.totals;
  return (
    <>
      <Link
        href={`/a/${accountId}/s/${siteId}/quote`}
        className="group flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 transition hover:shadow-md"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700">
          <FileText size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{owner ? "הצעת מחיר" : "כתב כמויות"}</span>
          {owner && state && quote.lines.length > 0 ? (
            <span className="block text-sm text-slate-500">
              {nis(t.total)} כולל מע״מ ·{" "}
              <span className={t.profit < 0 ? "text-red-600" : "text-green-700"}>
                רווח {nis(t.profit)} נטו ({Math.round(t.marginPct)}%)
              </span>
              {t.noPrice > 0 && <span className="text-amber-700"> · {t.noPrice} בלי מחיר</span>}
            </span>
          ) : (
            <span className="block text-sm text-slate-500">{owner ? "תמחור, הנחה, תנאים ושליחה ללקוח" : "מה הפרויקט צריך, לפי המפה"}</span>
          )}
        </span>
        <ChevronLeft size={20} className="text-slate-300 transition group-hover:-translate-x-0.5" />
      </Link>
      {owner && <PurchaseCard href={`/a/${accountId}/s/${siteId}/purchase`} sum={state ? purchaseSummary(quote, state.finance) : null} />}
    </>
  );
}

/** The way into purchasing: how much is in hand, and the profit with the real costs so far. */
function PurchaseCard({ href, sum }: { href: string; sum: PurchaseSummary | null }) {
  return (
    <Link href={href} className="group flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 transition hover:shadow-md">
      <span className={cx("grid size-12 shrink-0 place-items-center rounded-xl", sum?.ready ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700")}>
        {sum?.ready ? <Check size={22} /> : <ShoppingCart size={22} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">רכש</span>
        <span className="block text-sm text-slate-500">
          {!sum || !sum.total ? (
            "מה נקנה, ממי ובכמה, וקבלות"
          ) : (
            <>
              {sum.ready ? <span className="text-green-700">הכל נרכש: מוכן לשטח</span> : `נרכשו ${sum.done} מתוך ${sum.total}`} ·{" "}
              <span className={sum.profit < 0 ? "text-red-600" : "text-green-700"}>
                רווח {sum.ready ? "בפועל" : "צפוי"} {nis(sum.profit)} נטו
              </span>
            </>
          )}
        </span>
      </span>
      <ChevronLeft size={20} className="text-slate-300 transition group-hover:-translate-x-0.5" />
    </Link>
  );
}

const NO_FINANCE = emptyFinance();
const NO_DEFAULTS = emptyDefaults();

function MapCard({ siteId, href }: { siteId: string; href: string }) {
  const floors = useApp((s) => s.floors);
  const n = floors.filter((f) => f.siteId === siteId).length;
  return (
    <Link href={href} className="group flex items-center gap-4 rounded-2xl bg-slate-900 p-5 text-white transition hover:bg-slate-800">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/10">
        <MapIcon size={24} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold">פתיחת המפה</span>
        <span className="flex items-center gap-1 text-sm text-white/70">
          <Layers size={14} /> {n === 1 ? "קומה אחת" : `${n} קומות`} · תכנון, ציוד וכבלים
        </span>
      </span>
      <ChevronLeft size={20} className="text-white/60 transition group-hover:-translate-x-0.5" />
    </Link>
  );
}

/** What the project's map holds now, by type: the start of its bill of quantities. */
function EquipmentCard({ siteId, href }: { siteId: string; href: string }) {
  const devices = useApp((s) => s.devices);
  const links = useApp((s) => s.links);
  const floors = useApp((s) => s.floors);
  const sum = useMemo(() => equipmentSummary(siteId, devices, links, floors), [siteId, devices, links, floors]);
  const MAX = 8;
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="font-semibold">
        ציוד בפרויקט <span className="text-sm font-normal text-slate-400">· {sum.fresh === 1 ? "פריט אחד" : `${sum.fresh} פריטים`}</span>
      </h2>
      {sum.existing > 0 && (
        <p className="text-xs text-slate-500">
          {sum.existing === 1 ? "ועוד פריט אחד שכבר היה" : `ועוד ${sum.existing} פריטים שכבר היו`} אצל הלקוח (לא חלק מהפרויקט)
        </p>
      )}
      {!sum.total ? (
        <p className="mt-3 text-sm text-slate-500">
          עדיין אין ציוד.{" "}
          <Link href={href} className="font-medium text-blue-700 hover:underline">
            מתחילים במפה
          </Link>
          : מניחים מצלמות, נקודות רשת וכבלים.
        </p>
      ) : (
        <>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {sum.types.slice(0, MAX).map(({ def, n, color }) => {
              const Icon = def.icon;
              return (
                <li key={def.id} className="flex min-w-0 items-center gap-2">
                  <Icon size={15} className="shrink-0" style={{ color }} />
                  <span className="min-w-0 flex-1 truncate">{def.label}</span>
                  <b className="tabular-nums">{n}</b>
                </li>
              );
            })}
          </ul>
          {sum.types.length > MAX && <p className="mt-1 text-xs text-slate-500">ועוד {sum.types.length - MAX} סוגים</p>}
          {sum.cables.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
              {sum.cables.map((c) => (
                <div key={c.def.id} className="flex items-center gap-2">
                  <span className="h-1 w-4 shrink-0 rounded" style={{ background: c.def.color }} />
                  <span className="min-w-0 flex-1 truncate">{c.def.label}</span>
                  <span className="tabular-nums text-slate-700">
                    {c.m ? `${meters(c.m)} מ׳` : ""}
                    {c.unmeasured ? (
                      <span className="text-xs text-slate-400">
                        {" "}
                        {c.m ? "+ " : ""}
                        {c.unmeasured} בלי אורך
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

const meters = (m: number) => (m >= 10 ? Math.round(m) : Math.max(0.1, Math.round(m * 10) / 10)).toLocaleString("he-IL");

function EditProject({ site, onClose }: { site: Site; onClose: () => void }) {
  const updateSite = useApp((s) => s.updateSite);
  const deleteSite = useApp((s) => s.deleteSite);
  const devices = useApp((s) => s.devices);
  const router = useRouter();
  const [f, setF] = useState({
    name: site.name,
    address: site.address ?? "",
    notes: site.notes ?? "",
  });

  const remove = async () => {
    const n = devices.filter((d) => d.siteId === site.id).length;
    const ok = await askConfirm({
      title: "מחיקת הפרויקט",
      message: `למחוק את "${site.name}" עם המפה שלו${n ? ` ו-${n} פריטי הציוד שעליה` : ""}? אפשר לבטל מיד אחר כך (Ctrl+Z).`,
      danger: true,
      okLabel: "מחיקה",
    });
    if (!ok) return;
    onClose();
    router.push(`/a/${site.accountId}`);
    deleteSite(site.id);
  };

  return (
    <Modal
      title="פרטי הפרויקט"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="primary"
            disabled={!f.name.trim()}
            onClick={() => {
              updateSite(site.id, {
                name: f.name.trim(),
                address: f.address.trim() || undefined,
                notes: f.notes.trim() || undefined,
              });
              onClose();
            }}
          >
            שמירה
          </Button>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <span className="flex-1" />
          <Button variant="danger" onClick={remove}>
            <Trash2 size={15} /> מחיקה
          </Button>
        </>
      }
    >
      <Field label="שם הפרויקט">
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
      </Field>
      <Field label="כתובת האתר">
        <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
      </Field>
      <Field label="הערות">
        <Textarea rows={4} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="גישה לאתר, שעות עבודה, איש קשר במקום…" />
      </Field>
    </Modal>
  );
}
