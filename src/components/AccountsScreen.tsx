"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "./AppShell";
import { Badge, Button, Empty, Field, Input, Modal } from "./ui";
import { useApp } from "@/lib/store";
import { ROLE_LABEL, useCurrentUser, useVisibleAccounts } from "@/lib/access";
import { useSync } from "@/lib/sync";
import { ImportLocalData } from "./ImportLocalData";

export function AccountsScreen() {
  return (
    <AppShell>
      <AccountsList />
    </AppShell>
  );
}

function AccountsList() {
  const user = useCurrentUser();
  const accounts = useVisibleAccounts();
  const sites = useApp((s) => s.sites);
  const devices = useApp((s) => s.devices);
  const meta = useApp((s) => s.meta);
  const syncReady = useSync((s) => s.ready);
  const [creating, setCreating] = useState(false);
  const isAdmin = user?.role === "admin";

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">שלום, {user?.name}</h1>
          <p className="text-sm text-slate-500">
            {isAdmin ? "כל חשבונות העסקים בפלטפורמה" : "בחר את העסק שתרצה לנהל"}
          </p>
        </div>
        {isAdmin && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> חשבון עסק חדש
          </Button>
        )}
      </div>

      {isAdmin && <ImportLocalData />}

      {accounts.length === 0 ? (
        !syncReady ? (
          <p className="p-10 text-center text-slate-400">טוען…</p>
        ) : (
          <Empty>{isAdmin ? "עדיין אין עסקים. פתחו חשבון עסק חדש." : "אין לך עדיין גישה לחשבון עסק. בקש ממנהל המערכת להוסיף אותך."}</Empty>
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => {
            const accSites = sites.filter((s) => s.accountId === a.id);
            const siteIds = new Set(accSites.map((s) => s.id));
            const devCount = devices.filter((d) => siteIds.has(d.siteId)).length;
            const role = meta[a.id]?.role;
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
                  {role && role !== "super" && <Badge color={role === "admin" ? "blue" : "slate"}>{ROLE_LABEL[role]}</Badge>}
                </div>
                {a.address && (
                  <div className="mt-3 flex items-center gap-1 text-xs text-slate-500">
                    <MapPin size={12} /> {a.address}
                  </div>
                )}
                <div className="mt-3 flex gap-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <span>
                    <b className="text-slate-900">{accSites.length}</b> אתרים
                  </span>
                  <span>
                    <b className="text-slate-900">{devCount}</b> רכיבים ממופים
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {creating && <NewAccountModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewAccountModal({ onClose }: { onClose: () => void }) {
  const createAccount = useApp((s) => s.createAccount);
  const createSite = useApp((s) => s.createSite);
  const router = useRouter();
  const [f, setF] = useState({ name: "", businessType: "", address: "", phone: "" });
  const upd = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = () => {
    const id = createAccount({ name: f.name.trim(), businessType: f.businessType, address: f.address, phone: f.phone });
    createSite(id, "אתר ראשי", f.address);
    router.push(`/a/${id}`);
  };

  return (
    <Modal
      title="חשבון עסק חדש"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" disabled={!f.name.trim()} onClick={submit}>
            צור חשבון
          </Button>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
        </>
      }
    >
      <Field label="שם העסק *">
        <Input value={f.name} onChange={upd("name")} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="סוג עסק">
          <Input value={f.businessType} onChange={upd("businessType")} placeholder="מסעדה, משרד…" />
        </Field>
        <Field label="טלפון">
          <Input value={f.phone} onChange={upd("phone")} className="ltr text-end" />
        </Field>
      </div>
      <Field label="כתובת">
        <Input value={f.address} onChange={upd("address")} />
      </Field>
      <p className="text-xs text-slate-500">
        את בעל העסק מוסיפים בסוף, כשהמיפוי מוכן למסירה (לא חובה), בלשונית ״משתמשים והרשאות״. לא נשלח לו שום מייל.
      </p>
    </Modal>
  );
}
