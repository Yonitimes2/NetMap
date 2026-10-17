"use client";

import Link from "next/link";
import { Building, ChevronLeft, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { Button, Field, Input } from "./ui";
import { AddPersonModal } from "./OrgScreen";
import { authApi, useSession } from "@/lib/session-client";
import { pull } from "@/lib/sync";

interface OrgRow {
  id: string;
  name: string;
  createdAt: number;
  customers: number;
  members: number;
  owners: string;
}

/** System admin: every account on the platform (an installer's business each), and opening a new one. */
export function OrgsAdminScreen() {
  const me = useSession((s) => s.user);
  return (
    <AppShell crumbs={[{ label: "לקוחות", href: "/" }, { label: "ניהול חשבונות" }]}>
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        {!me ? (
          <p className="p-10 text-center text-slate-400">טוען…</p>
        ) : me.role !== "admin" ? (
          <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">רק מנהל מערכת יכול לנהל חשבונות.</p>
        ) : (
          <OrgsList />
        )}
      </div>
    </AppShell>
  );
}

function OrgsList() {
  const [orgs, setOrgs] = useState<OrgRow[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    let alive = true;
    authApi<{ orgs: OrgRow[] }>("/api/admin/orgs", "GET")
      .then((r) => alive && setOrgs(r.orgs))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!orgs) return <p className="p-10 text-center text-slate-400">טוען…</p>;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">חשבונות</h1>
          <p className="text-sm text-slate-500">כל חשבון הוא עסק של מתקין, עם הלקוחות, הפרויקטים, המשתמשים והמחירונים שלו. מאגר המוצרים משותף לכולם.</p>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Plus size={16} /> חשבון חדש
        </Button>
      </div>
      <div className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
        {orgs.map((o) => (
          <Link key={o.id} href={`/o/${o.id}`} className="flex items-center gap-3 p-3 hover:bg-slate-50">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
              <Building size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{o.name}</span>
              <span className="block truncate text-xs text-slate-500">
                {o.customers} לקוחות · {o.members} משתמשים{o.owners && ` · בעלים: ${o.owners}`}
              </span>
            </span>
            <ChevronLeft size={18} className="shrink-0 text-slate-300" />
          </Link>
        ))}
      </div>
      {adding && (
        <AddPersonModal
          title="חשבון חדש"
          submitLabel="פתיחת החשבון"
          onClose={() => setAdding(false)}
          onAdd={async (owner) => {
            if (!name.trim()) throw new Error("צריך שם עסק");
            const r = await authApi<{ orgs: OrgRow[] }>("/api/admin/orgs", "POST", { name: name.trim(), owner });
            setOrgs(r.orgs);
            setName("");
            void pull();
          }}
        >
          <Field label="שם העסק של החשבון">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: מערכות אבטחה בע״מ" />
          </Field>
          <p className="text-xs font-medium text-slate-600">בעל החשבון:</p>
        </AddPersonModal>
      )}
    </>
  );
}
