"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, Layers, MapPin, Plus, Trash2, UserPlus, Wand2 } from "lucide-react";
import { AppShell } from "./AppShell";
import { Badge, Button, Empty, Field, Input, Modal, Select, cx } from "./ui";
import { useApp } from "@/lib/store";
import { askConfirm } from "./dialogs";
import { ROLE_LABEL, can, useCurrentUser, useRole } from "@/lib/access";
import { PASSWORD_MIN, authApi } from "@/lib/session-client";
import { useSync } from "@/lib/sync";
import { toast } from "@/lib/toast";
import { PasswordInput, randomPassword } from "./auth/PasswordInput";
import { StageBadge } from "./project/Stages";
import { stageOf } from "@/lib/project";
import type { Role } from "@/lib/types";

export function AccountScreen() {
  const { accountId } = useParams<{ accountId: string }>();
  return <AccountInner accountId={accountId} />;
}

function AccountInner({ accountId }: { accountId: string }) {
  const account = useApp((s) => s.accounts.find((a) => a.id === accountId));
  const allowed = can.view(useRole(accountId));
  return (
    <AppShell crumbs={allowed ? [{ label: "לקוחות", href: "/" }, { label: account?.name ?? "" }] : []}>
      <AccountBody accountId={accountId} />
    </AppShell>
  );
}

function AccountBody({ accountId }: { accountId: string }) {
  const account = useApp((s) => s.accounts.find((a) => a.id === accountId));
  const role = useRole(accountId);
  const [tab, setTab] = useState<"sites" | "users" | "audit" | "details">("sites");
  const org = useApp((s) => s.orgs.find((o) => o.id === account?.orgId));
  const syncReady = useSync((s) => s.ready);

  if (!account && !syncReady) return <p className="p-10 text-center text-slate-400">טוען…</p>;
  if (!account || !can.view(role)) {
    return (
      <div className="p-6">
        <Empty>אין לך גישה ללקוח הזה, או שהוא לא קיים.</Empty>
      </div>
    );
  }

  const tabs = [
    { id: "sites" as const, label: "פרויקטים" },
    ...(can.manageUsers(role)
      ? [
          { id: "users" as const, label: "משתמשים והרשאות" },
          { id: "audit" as const, label: "יומן צפייה בסיסמאות" },
        ]
      : []),
    { id: "details" as const, label: "פרטי הלקוח" },
  ];

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-2xl font-bold">{account.name}</h1>
        {role && <Badge color={role === "owner" || role === "admin" ? "blue" : role === "super" ? "amber" : "slate"}>{ROLE_LABEL[role]}</Badge>}
        {org && org.role === "super" && <span className="text-sm text-slate-500">לקוח של {org.name}</span>}
      </div>
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm",
              tab === t.id ? "border-slate-900 font-semibold text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "sites" && <SitesTab accountId={accountId} />}
      {tab === "users" && <UsersTab accountId={accountId} />}
      {tab === "audit" && <AuditTab accountId={accountId} />}
      {tab === "details" && <DetailsTab accountId={accountId} />}
    </div>
  );
}

function SitesTab({ accountId }: { accountId: string }) {
  const allSites = useApp((s) => s.sites);
  const floors = useApp((s) => s.floors);
  const devices = useApp((s) => s.devices);
  const account = useApp((s) => s.accounts.find((a) => a.id === accountId));
  const createSite = useApp((s) => s.createSite);
  const router = useRouter();
  const role = useRole(accountId);
  const sites = allSites.filter((s) => s.accountId === accountId).sort((a, b) => b.createdAt - a.createdAt);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">כל פרויקט הוא אתר עם מפה משלו, מהצעת המחיר ועד השירות.</p>
        {can.manageSites(role) && (
          <Button
            variant="primary"
            className="shrink-0"
            onClick={() => {
              setAddress(account?.address ?? "");
              setAdding(true);
            }}
          >
            <Plus size={16} /> פרויקט חדש
          </Button>
        )}
      </div>
      {sites.length === 0 ? (
        <Empty>עדיין אין פרויקטים. פתחו פרויקט כדי להתחיל לתכנן.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sites.map((s) => {
            const fl = floors.filter((f) => f.siteId === s.id);
            const dv = devices.filter((d) => d.siteId === s.id && !d.existing);
            const cams = dv.filter((d) => d.type.startsWith("cam-")).length;
            return (
              <Link key={s.id} href={`/a/${accountId}/s/${s.id}`} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 transition hover:shadow-md">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 font-semibold">{s.name}</div>
                  <StageBadge stage={stageOf(s)} />
                </div>
                {s.address && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <MapPin size={12} /> {s.address}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge>
                    <Layers size={12} className="me-1" /> {fl.length} קומות
                  </Badge>
                  <Badge color="blue">{dv.length} רכיבים</Badge>
                  {cams > 0 && <Badge color="red">{cams} מצלמות</Badge>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {adding && (
        <Modal
          title="פרויקט חדש"
          onClose={() => setAdding(false)}
          footer={
            <Button
              variant="primary"
              disabled={!name.trim()}
              onClick={() => {
                const id = createSite(accountId, name.trim(), address);
                setAdding(false);
                setName("");
                router.push(`/a/${accountId}/s/${id}`);
              }}
            >
              פתיחת הפרויקט
            </Button>
          }
        >
          <Field label="שם הפרויקט">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="מצלמות בסניף הראשי, הרחבת רשת…" autoFocus />
          </Field>
          <Field label="כתובת האתר">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
        </Modal>
      )}
    </>
  );
}

interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

/** People with access to this business. Kept on the server; nothing is emailed to anyone. */
function UsersTab({ accountId }: { accountId: string }) {
  const me = useCurrentUser();
  const myRole = useRole(accountId);
  const saved = useApp((s) => (s.meta[accountId]?.rev ?? 0) > 0);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState<null | "owner" | "member">(null);
  const adminCount = members?.filter((m) => m.role === "admin").length ?? 0;

  useEffect(() => {
    if (!saved) return;
    let alive = true;
    authApi<{ members: Member[] }>(`/api/accounts/${accountId}/members`, "GET")
      .then((r) => alive && setMembers(r.members))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [accountId, saved]);

  const change = async (run: () => Promise<{ members: Member[] }>) => {
    try {
      setMembers((await run()).members);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  if (!saved) return <p className="p-6 text-center text-sm text-slate-500">הלקוח עוד נשמר בשרת. אפשר יהיה להוסיף משתמשים בעוד רגע.</p>;
  if (error) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (!members) return <p className="p-6 text-center text-slate-400">טוען…</p>;

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          גישה ללקוח הזה בלבד. <b>בעל העסק</b>: רואה את הפרויקטים שלו ומנהל את האנשים שלו, בלי מחירים. <b>טכנאי</b>: עריכת המפות וצפייה בסיסמאות.
          הטכנאים של החשבון שלך רואים את כל הלקוחות, ולא צריך להוסיף אותם כאן.
        </p>
        <Button onClick={() => setAdding("member")}>
          <UserPlus size={16} /> הוספת משתמש
        </Button>
      </div>
      {adminCount === 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-medium">עדיין אין בעל עסק בחשבון</div>
            <div className="text-slate-500">לא חובה. מוסיפים אותו בסוף, כשהמיפוי מוכן למסירה. לא נשלח לו שום מייל.</div>
          </div>
          <Button variant="primary" onClick={() => setAdding("owner")}>
            <UserPlus size={16} /> הוספת בעל העסק
          </Button>
        </div>
      )}
      <div className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200 empty:hidden">
        {members.map((m) => {
          // a business admin can't remove the last admin role (they'd lock themselves out)
          const locked = myRole === "admin" && m.role === "admin" && adminCount === 1;
          return (
            <div key={m.userId} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {m.name} {m.userId === me?.id && <span className="text-xs text-slate-400">(אתה)</span>}
                </div>
                <div className="ltr text-xs text-slate-500">{m.email}</div>
              </div>
              <Select
                className="w-40"
                value={m.role}
                disabled={locked}
                onChange={(e) => change(() => authApi(`/api/accounts/${accountId}/members/${m.userId}`, "PATCH", { role: e.target.value }))}
              >
                <option value="admin">{ROLE_LABEL.admin}</option>
                <option value="technician">{ROLE_LABEL.technician}</option>
              </Select>
              <Button
                variant="danger"
                size="sm"
                disabled={locked}
                title={locked ? "חייב להישאר לפחות מנהל אחד" : "הסר גישה"}
                onClick={async () =>
                  (await askConfirm({ title: "הסרת גישה", message: `להסיר את הגישה של ${m.name} ללקוח? הכניסה שלו למערכת נשארת.`, danger: true, okLabel: "הסר" })) &&
                  change(() => authApi(`/api/accounts/${accountId}/members/${m.userId}`, "DELETE"))
                }
              >
                <Trash2 size={14} /> הסר
              </Button>
            </div>
          );
        })}
      </div>
      {adding && (
        <AddMemberModal
          owner={adding === "owner"}
          onClose={() => setAdding(null)}
          onAdd={async (body) => setMembers((await authApi<{ members: Member[] }>(`/api/accounts/${accountId}/members`, "POST", body)).members)}
        />
      )}
    </>
  );
}

function AddMemberModal({
  owner,
  onClose,
  onAdd,
}: {
  owner: boolean;
  onClose: () => void;
  onAdd: (body: { name: string; email: string; role: Role; password?: string }) => Promise<void>;
}) {
  const [f, setF] = useState({ name: "", email: "", role: (owner ? "admin" : "technician") as Role, password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onAdd({ name: f.name.trim(), email: f.email.trim(), role: f.role, password: f.password || undefined });
      toast(`${f.name.trim() || f.email.trim()} קיבל גישה`);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={owner ? "הוספת בעל העסק" : "גישה ללקוח הזה"}
      onClose={onClose}
      footer={
        <Button type="submit" form="member-form" variant="primary" disabled={busy || !/\S+@\S+/.test(f.email)}>
          {busy ? "מוסיף…" : "הוספה"}
        </Button>
      }
    >
      <form id="member-form" onSubmit={save} className="space-y-3">
        <Field label="שם">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        </Field>
        <Field label="אימייל (משמש לכניסה)">
          <Input type="email" className="ltr text-end" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="תפקיד">
          <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            <option value="technician">{ROLE_LABEL.technician}</option>
            <option value="admin">{ROLE_LABEL.admin}</option>
          </Select>
        </Field>
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

interface AuditRow {
  id: string;
  userName: string;
  at: number;
  action: string;
  target?: string;
}

function AuditTab({ accountId }: { accountId: string }) {
  const devices = useApp((s) => s.devices);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    authApi<{ entries: AuditRow[] }>(`/api/accounts/${accountId}/audit`, "GET")
      .then((r) => alive && setRows(r.entries))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [accountId]);
  if (error) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (!rows) return <p className="p-6 text-center text-slate-400">טוען…</p>;
  if (!rows.length) return <Empty>עדיין לא נצפו סיסמאות אצל הלקוח הזה.</Empty>;
  return (
    <div className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
          <Eye size={16} className="text-slate-400" />
          <div className="flex-1">
            <b>{r.userName}</b> {r.action} <span className="text-slate-600">{devices.find((d) => d.id === r.target)?.label}</span>
          </div>
          <div className="text-xs text-slate-400">{new Date(r.at).toLocaleString("he-IL")}</div>
        </div>
      ))}
    </div>
  );
}

function DetailsTab({ accountId }: { accountId: string }) {
  const account = useApp((s) => s.accounts.find((a) => a.id === accountId))!;
  const updateAccount = useApp((s) => s.updateAccount);
  const role = useRole(accountId);
  const readOnly = !can.manageUsers(role);
  const field = (k: "name" | "businessType" | "contactName" | "phone" | "address", label: string, ltr = false) => (
    <Field label={label}>
      <Input
        value={account[k] ?? ""}
        disabled={readOnly}
        className={ltr ? "ltr text-end" : ""}
        onChange={(e) => updateAccount(accountId, { [k]: e.target.value })}
      />
    </Field>
  );
  return (
    <div className="grid max-w-2xl gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:grid-cols-2">
      {field("name", "שם העסק")}
      {field("businessType", "סוג עסק")}
      {field("contactName", "איש קשר")}
      {field("phone", "טלפון", true)}
      <div className="sm:col-span-2">{field("address", "כתובת")}</div>
    </div>
  );
}
