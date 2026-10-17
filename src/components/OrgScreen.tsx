"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Trash2, UserPlus, Wand2 } from "lucide-react";
import { AppShell } from "./AppShell";
import { Button, Empty, Field, Input, Modal, Select } from "./ui";
import { askConfirm } from "./dialogs";
import { PasswordInput, randomPassword } from "./auth/PasswordInput";
import { ORG_ROLE_LABEL, can, useCurrentUser } from "@/lib/access";
import { PASSWORD_MIN, authApi } from "@/lib/session-client";
import { useApp } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { OrgRole } from "@/lib/types";

type MemberRole = Exclude<OrgRole, "super">;
interface Member {
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
}
interface OrgInfo {
  id: string;
  name: string;
  createdAt: number;
  role: OrgRole;
}

/** An account's settings: the business name, and its people (owners and technicians). */
export function OrgScreen() {
  const { orgId } = useParams<{ orgId: string }>();
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    authApi<{ org: OrgInfo; members: Member[] | null }>(`/api/orgs/${orgId}`, "GET")
      .then((r) => {
        if (!alive) return;
        setOrg(r.org);
        setMembers(r.members);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [orgId]);

  return (
    <AppShell crumbs={[{ label: "לקוחות", href: "/" }, { label: "הגדרות החשבון" }]}>
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        {error ? (
          <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
        ) : !org ? (
          <p className="p-10 text-center text-slate-400">טוען…</p>
        ) : (
          <>
            <h1 className="text-2xl font-bold">הגדרות החשבון</h1>
            <OrgDetails org={org} onSaved={(name) => setOrg({ ...org, name })} />
            {can.manageOrg(org.role) && members && <OrgMembers orgId={org.id} members={members} setMembers={setMembers} canOverride={org.role === "super"} />}
          </>
        )}
      </div>
    </AppShell>
  );
}

function OrgDetails({ org, onSaved }: { org: OrgInfo; onSaved: (name: string) => void }) {
  const [name, setName] = useState(org.name);
  const [busy, setBusy] = useState(false);
  const editable = can.manageOrg(org.role);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await authApi<{ org: { name: string } }>(`/api/orgs/${org.id}`, "PATCH", { name: name.trim() });
      // the home page shows it right away; the next sync brings the same
      useApp.setState((s) => ({ orgs: s.orgs.map((o) => (o.id === org.id ? { ...o, name: r.org.name } : o)) }));
      onSaved(r.org.name);
      toast("נשמר");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="mb-3 font-semibold">פרטי העסק</h2>
      <Field label="שם העסק">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} className="min-w-0 flex-1" />
          {editable && (
            <Button type="submit" variant="primary" disabled={busy || !name.trim() || name.trim() === org.name} className="shrink-0">
              שמירה
            </Button>
          )}
        </div>
      </Field>
      <p className="mt-2 text-xs text-slate-500">השם מופיע בדף הבית, ובהמשך גם על הצעות המחיר והדפים שהלקוחות מקבלים.</p>
    </form>
  );
}

function OrgMembers({
  orgId,
  members,
  setMembers,
  canOverride,
}: {
  orgId: string;
  members: Member[];
  setMembers: (m: Member[]) => void;
  canOverride: boolean;
}) {
  const me = useCurrentUser();
  const [adding, setAdding] = useState(false);
  const owners = members.filter((m) => m.role === "owner").length;
  const change = async (run: () => Promise<{ members: Member[] }>) => {
    try {
      setMembers((await run()).members);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  return (
    <section className="rounded-2xl bg-white ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">משתמשים</h2>
          <p className="text-sm text-slate-500">
            <b>בעלים</b>: הכל, כולל מחירים, רכש ורווח, וניהול המשתמשים. <b>טכנאי</b>: כל הלקוחות והפרויקטים, בלי מחירים ובלי ניהול משתמשים.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <UserPlus size={16} /> הוספת משתמש
        </Button>
      </div>
      {members.length ? (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {members.map((m) => {
            // the account always keeps an owner (a system admin may still change it)
            const locked = !canOverride && m.role === "owner" && owners === 1;
            return (
              <div key={m.userId} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {m.name} {m.userId === me?.id && <span className="text-xs text-slate-400">(אתה)</span>}
                  </div>
                  <div className="ltr truncate text-xs text-slate-500">{m.email}</div>
                </div>
                <span className="w-28 shrink-0">
                  <Select
                    value={m.role}
                    disabled={locked}
                    onChange={(e) => change(() => authApi(`/api/orgs/${orgId}/members/${m.userId}`, "PATCH", { role: e.target.value }))}
                  >
                    <option value="owner">{ORG_ROLE_LABEL.owner}</option>
                    <option value="technician">{ORG_ROLE_LABEL.technician}</option>
                  </Select>
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={locked}
                  title={locked ? "חייב להישאר לפחות בעלים אחד" : "הסרה מהחשבון"}
                  onClick={async () =>
                    (await askConfirm({ title: "הסרה מהחשבון", message: `להסיר את ${m.name} מהחשבון? הכניסה שלו למערכת נשארת.`, danger: true, okLabel: "הסר" })) &&
                    change(() => authApi(`/api/orgs/${orgId}/members/${m.userId}`, "DELETE"))
                  }
                >
                  <Trash2 size={14} /> הסר
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-4 pb-4">
          <Empty>אין עדיין משתמשים בחשבון.</Empty>
        </div>
      )}
      {adding && (
        <AddPersonModal
          title="הוספת משתמש לחשבון"
          roles={[
            ["technician", ORG_ROLE_LABEL.technician],
            ["owner", ORG_ROLE_LABEL.owner],
          ]}
          onClose={() => setAdding(false)}
          onAdd={async (body) => setMembers((await authApi<{ members: Member[] }>(`/api/orgs/${orgId}/members`, "POST", body)).members)}
        />
      )}
    </section>
  );
}

/** Name, email, role and a first password (only for someone without a login yet). Nothing is emailed. */
export function AddPersonModal({
  title,
  roles,
  onClose,
  onAdd,
  submitLabel = "הוספה",
  children,
}: {
  title: string;
  roles?: [string, string][];
  onClose: () => void;
  onAdd: (body: { name: string; email: string; role?: string; password?: string }) => Promise<void>;
  submitLabel?: string;
  /** fields above the person's (e.g. the new account's name) */
  children?: ReactNode;
}) {
  const [f, setF] = useState({ name: "", email: "", role: roles?.[0][0], password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onAdd({ name: f.name.trim(), email: f.email.trim(), role: f.role, password: f.password || undefined });
      toast(`${f.name.trim() || f.email.trim()} נוסף`);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <Button type="submit" form="person-form" variant="primary" disabled={busy || !/\S+@\S+/.test(f.email)}>
          {busy ? "רגע…" : submitLabel}
        </Button>
      }
    >
      <form id="person-form" onSubmit={save} className="space-y-3">
        {children}
        <Field label="שם">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        </Field>
        <Field label="אימייל (משמש לכניסה)">
          <Input type="email" className="ltr text-end" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        {roles && (
          <Field label="תפקיד">
            <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {roles.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={`סיסמה ראשונה (לפחות ${PASSWORD_MIN} תווים)`}>
          <div className="flex gap-2">
            <div className="flex-1">
              <PasswordInput value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
            </div>
            <Button type="button" onClick={() => setF({ ...f, password: randomPassword() })} title="יצירת סיסמה אקראית">
              <Wand2 size={15} /> אקראית
            </Button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            רק אם אין לו עדיין כניסה ל-NetMap. מסרו לו את האימייל והסיסמה בעצמכם: לא נשלח מייל. אם כבר יש לו כניסה, הסיסמה שלו לא משתנה.
          </p>
        </Field>
        {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
      </form>
    </Modal>
  );
}
