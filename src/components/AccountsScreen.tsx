"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, MapPin, Plus, Settings } from "lucide-react";
import { useState } from "react";
import { AppShell } from "./AppShell";
import { Badge, Button, Empty, Field, Input, Modal } from "./ui";
import { StageBadge } from "./project/Stages";
import { useApp } from "@/lib/store";
import { ORG_ROLE_LABEL, ROLE_LABEL, can, useCurrentUser, useOrgs, useVisibleAccounts } from "@/lib/access";
import { useSync } from "@/lib/sync";
import { STAGES, stageOf } from "@/lib/project";
import { ImportLocalData } from "./ImportLocalData";
import { InstallApp } from "./InstallApp";
import type { Account, Org } from "@/lib/types";

/** Home: the customers of each account the user works in, and businesses they were given access to. */
export function AccountsScreen() {
  return (
    <AppShell>
      <Home />
    </AppShell>
  );
}

function Home() {
  const user = useCurrentUser();
  const accounts = useVisibleAccounts();
  const orgs = useOrgs();
  const syncReady = useSync((s) => s.ready);
  const [creatingIn, setCreatingIn] = useState<Org | null>(null);
  const isAdmin = user?.role === "admin";

  // the accounts the user is in first; a system admin also sees every other account, after them
  const sorted = [...orgs].sort((a, b) => Number(a.role === "super") - Number(b.role === "super"));
  const orgIds = new Set(orgs.map((o) => o.id));
  // businesses the user was given access to directly (as their owner, or a technician for just them)
  const own = accounts.filter((a) => !a.orgId || !orgIds.has(a.orgId));

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">שלום, {user?.name}</h1>
        <p className="text-sm text-slate-500">{orgs.length ? "הלקוחות והפרויקטים שלך" : "בחר את העסק שתרצה לראות"}</p>
      </div>

      <InstallApp variant="banner" />
      {isAdmin && <ImportLocalData />}

      {!syncReady && !accounts.length && !orgs.length ? (
        <p className="p-10 text-center text-slate-400">טוען…</p>
      ) : !orgs.length && !own.length ? (
        <Empty>אין לך עדיין גישה ללקוחות. בקש מבעל החשבון להוסיף אותך.</Empty>
      ) : (
        <div className="space-y-8">
          {sorted.map((org) => (
            <OrgSection key={org.id} org={org} customers={accounts.filter((a) => a.orgId === org.id)} onNew={() => setCreatingIn(org)} showName={sorted.length > 1} />
          ))}
          {own.length > 0 && (
            <section>
              {orgs.length > 0 && <h2 className="mb-3 text-lg font-semibold">עסקים שקיבלת אליהם גישה</h2>}
              <CustomerGrid customers={own} />
            </section>
          )}
        </div>
      )}
      {creatingIn && <NewCustomerModal org={creatingIn} onClose={() => setCreatingIn(null)} />}
    </div>
  );
}

function OrgSection({ org, customers, onNew, showName }: { org: Org; customers: Account[]; onNew: () => void; showName: boolean }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 text-lg font-semibold">
          {showName ? org.name : "לקוחות"} <span className="text-sm font-normal text-slate-400">· {customers.length}</span>
        </h2>
        {showName && <Badge color={org.role === "owner" ? "blue" : org.role === "super" ? "amber" : "slate"}>{ORG_ROLE_LABEL[org.role]}</Badge>}
        <span className="flex-1" />
        {can.manageOrg(org.role) && (
          <Link href={`/o/${org.id}`} className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-slate-600 hover:bg-slate-100">
            <Settings size={15} /> <span className="max-sm:hidden">הגדרות החשבון</span>
          </Link>
        )}
        {can.addCustomers(org.role) && (
          <Button variant="primary" onClick={onNew}>
            <Plus size={16} /> לקוח חדש
          </Button>
        )}
      </div>
      {customers.length ? <CustomerGrid customers={customers} /> : <Empty>עדיין אין לקוחות. פתחו לקוח חדש כדי להתחיל פרויקט.</Empty>}
    </section>
  );
}

function CustomerGrid({ customers }: { customers: Account[] }) {
  const sites = useApp((s) => s.sites);
  const meta = useApp((s) => s.meta);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {customers.map((a) => {
        const projects = sites.filter((s) => s.accountId === a.id);
        const role = meta[a.id]?.role;
        const stages = STAGES.map((st) => ({ id: st.id, n: projects.filter((p) => stageOf(p) === st.id).length })).filter((x) => x.n);
        return (
          <Link
            key={a.id}
            href={`/a/${a.id}`}
            className="group rounded-2xl bg-white p-4 ring-1 ring-slate-200 transition hover:shadow-md hover:ring-slate-300"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 group-hover:bg-slate-900 group-hover:text-white">
                <Building2 size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{a.name}</div>
                <div className="truncate text-xs text-slate-500">{a.businessType}</div>
              </div>
              {(role === "admin" || role === "technician") && <Badge color={role === "admin" ? "blue" : "slate"}>{ROLE_LABEL[role]}</Badge>}
            </div>
            {a.address && (
              <div className="mt-3 flex items-center gap-1 text-xs text-slate-500">
                <MapPin size={12} /> {a.address}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
              <span className="me-1">
                <b className="text-slate-900">{projects.length}</b> {projects.length === 1 ? "פרויקט" : "פרויקטים"}
              </span>
              {stages.map((x) => (
                <span key={x.id} className="inline-flex items-center gap-1">
                  <StageBadge stage={x.id} />
                  {x.n > 1 && <span className="text-slate-400">×{x.n}</span>}
                </span>
              ))}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function NewCustomerModal({ org, onClose }: { org: Org; onClose: () => void }) {
  const createAccount = useApp((s) => s.createAccount);
  const createSite = useApp((s) => s.createSite);
  const router = useRouter();
  const [f, setF] = useState({ name: "", businessType: "", contactName: "", phone: "", address: "", project: "פרויקט ראשון" });
  const upd = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = () => {
    const id = createAccount({ orgId: org.id, name: f.name.trim(), businessType: f.businessType, contactName: f.contactName, phone: f.phone, address: f.address });
    const siteId = createSite(id, f.project.trim() || "פרויקט ראשון", f.address);
    router.push(`/a/${id}/s/${siteId}`);
  };

  return (
    <Modal
      title="לקוח חדש"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" disabled={!f.name.trim()} onClick={submit}>
            פתיחת לקוח ופרויקט
          </Button>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
        </>
      }
    >
      <Field label="שם העסק / הלקוח *">
        <Input value={f.name} onChange={upd("name")} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="סוג עסק">
          <Input value={f.businessType} onChange={upd("businessType")} placeholder="מסעדה, משרד…" />
        </Field>
        <Field label="איש קשר">
          <Input value={f.contactName} onChange={upd("contactName")} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="טלפון">
          <Input value={f.phone} onChange={upd("phone")} className="ltr text-end" inputMode="tel" />
        </Field>
        <Field label="כתובת">
          <Input value={f.address} onChange={upd("address")} />
        </Field>
      </div>
      <Field label="הפרויקט הראשון">
        <Input value={f.project} onChange={upd("project")} />
      </Field>
      <p className="text-xs text-slate-500">
        כל פרויקט הוא אתר עם מפה משלו. לבעל העסק אפשר לתת גישה בסוף, במסירה (לא חובה). לא נשלח לו שום מייל.
      </p>
    </Modal>
  );
}
