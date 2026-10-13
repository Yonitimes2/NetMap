"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Eye, Layers, MapPin, Plus, Trash2, UserPlus } from "lucide-react";
import { AppShell } from "./AppShell";
import { Badge, Button, Empty, Field, Input, Modal, Select, cx } from "./ui";
import { useApp } from "@/lib/store";
import { askConfirm } from "./dialogs";
import { ROLE_LABEL, can, useRole } from "@/lib/access";
import type { Role } from "@/lib/types";

export function AccountScreen() {
  const { accountId } = useParams<{ accountId: string }>();
  return <AccountInner accountId={accountId} />;
}

function AccountInner({ accountId }: { accountId: string }) {
  const account = useApp((s) => s.accounts.find((a) => a.id === accountId));
  const allowed = can.view(useRole(accountId));
  return (
    <AppShell crumbs={allowed ? [{ label: account?.name ?? "" }] : []}>
      <AccountBody accountId={accountId} />
    </AppShell>
  );
}

function AccountBody({ accountId }: { accountId: string }) {
  const account = useApp((s) => s.accounts.find((a) => a.id === accountId));
  const role = useRole(accountId);
  const [tab, setTab] = useState<"sites" | "users" | "audit" | "details">("sites");

  if (!account || !can.view(role)) {
    return (
      <div className="p-6">
        <Empty>אין לך גישה לחשבון הזה, או שהוא לא קיים.</Empty>
      </div>
    );
  }

  const tabs = [
    { id: "sites" as const, label: "אתרים" },
    ...(can.manageUsers(role)
      ? [
          { id: "users" as const, label: "משתמשים והרשאות" },
          { id: "audit" as const, label: "יומן צפייה בסיסמאות" },
        ]
      : []),
    { id: "details" as const, label: "פרטי העסק" },
  ];

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{account.name}</h1>
        {role && <Badge color={role === "admin" ? "blue" : role === "super" ? "amber" : "slate"}>{ROLE_LABEL[role]}</Badge>}
      </div>
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
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
  const createSite = useApp((s) => s.createSite);
  const role = useRole(accountId);
  const sites = allSites.filter((s) => s.accountId === accountId);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  return (
    <>
      <div className="mb-3 flex justify-end">
        {can.manageSites(role) && (
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={16} /> אתר / סניף חדש
          </Button>
        )}
      </div>
      {sites.length === 0 ? (
        <Empty>עדיין אין אתרים. הוסף אתר כדי להתחיל למפות.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sites.map((s) => {
            const fl = floors.filter((f) => f.siteId === s.id);
            const dv = devices.filter((d) => d.siteId === s.id);
            const cams = dv.filter((d) => d.type.startsWith("cam-")).length;
            return (
              <Link
                key={s.id}
                href={`/a/${accountId}/s/${s.id}`}
                className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 transition hover:shadow-md"
              >
                <div className="font-semibold">{s.name}</div>
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
                  <Badge color="red">{cams} מצלמות</Badge>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {adding && (
        <Modal
          title="אתר חדש"
          onClose={() => setAdding(false)}
          footer={
            <Button
              variant="primary"
              disabled={!name.trim()}
              onClick={() => {
                createSite(accountId, name.trim(), address);
                setAdding(false);
                setName("");
                setAddress("");
              }}
            >
              הוסף אתר
            </Button>
          }
        >
          <Field label="שם האתר">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="סניף ראשי, מחסן…" autoFocus />
          </Field>
          <Field label="כתובת">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
        </Modal>
      )}
    </>
  );
}

function UsersTab({ accountId }: { accountId: string }) {
  const memberships = useApp((s) => s.memberships);
  const users = useApp((s) => s.users);
  const currentUserId = useApp((s) => s.currentUserId);
  const addMember = useApp((s) => s.addMember);
  const setMemberRole = useApp((s) => s.setMemberRole);
  const removeMember = useApp((s) => s.removeMember);
  const members = memberships.filter((m) => m.accountId === accountId);
  const [inviting, setInviting] = useState(false);
  const [f, setF] = useState({ name: "", email: "", role: "technician" as Role });
  const adminCount = members.filter((m) => m.role === "admin").length;

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          <b>מנהל</b>: גישה מלאה וניהול משתמשים. <b>טכנאי</b>: עריכת המיפוי וצפייה בסיסמאות, בלי ניהול משתמשים.
        </p>
        <Button variant="primary" onClick={() => setInviting(true)}>
          <UserPlus size={16} /> הזמן משתמש
        </Button>
      </div>
      <div className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
        {members.map((m) => {
          const u = users.find((x) => x.id === m.userId);
          const lastAdmin = m.role === "admin" && adminCount === 1;
          return (
            <div key={m.userId} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {u?.name} {m.userId === currentUserId && <span className="text-xs text-slate-400">(אתה)</span>}
                </div>
                <div className="ltr text-xs text-slate-500">{u?.email}</div>
              </div>
              <Select
                className="w-40"
                value={m.role}
                disabled={lastAdmin}
                onChange={(e) => setMemberRole(accountId, m.userId, e.target.value as Role)}
              >
                <option value="admin">{ROLE_LABEL.admin}</option>
                <option value="technician">{ROLE_LABEL.technician}</option>
              </Select>
              <Button
                variant="danger"
                size="sm"
                disabled={lastAdmin}
                title={lastAdmin ? "חייב להישאר לפחות מנהל אחד" : "הסר גישה"}
                onClick={async () =>
                  (await askConfirm({ title: "הסרת גישה", message: `להסיר את הגישה של ${u?.name} לחשבון?`, danger: true, okLabel: "הסר" })) &&
                  removeMember(accountId, m.userId)
                }
              >
                <Trash2 size={14} /> הסר
              </Button>
            </div>
          );
        })}
      </div>
      {inviting && (
        <Modal
          title="הזמנת משתמש לחשבון"
          onClose={() => setInviting(false)}
          footer={
            <Button
              variant="primary"
              disabled={!f.name.trim() || !/\S+@\S+/.test(f.email)}
              onClick={() => {
                addMember(accountId, { name: f.name.trim(), email: f.email.trim() }, f.role);
                setInviting(false);
                setF({ name: "", email: "", role: "technician" });
              }}
            >
              שלח הזמנה
            </Button>
          }
        >
          <Field label="שם">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
          </Field>
          <Field label="אימייל">
            <Input type="email" className="ltr text-end" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="תפקיד">
            <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
              <option value="technician">{ROLE_LABEL.technician}</option>
              <option value="admin">{ROLE_LABEL.admin}</option>
            </Select>
          </Field>
          <p className="text-xs text-slate-500">בגרסת הדמו המשתמש נוסף מיד. אחרי החיבור לשרת תישלח הזמנה במייל.</p>
        </Modal>
      )}
    </>
  );
}

function AuditTab({ accountId }: { accountId: string }) {
  const audit = useApp((s) => s.audit);
  const users = useApp((s) => s.users);
  const devices = useApp((s) => s.devices);
  const rows = audit.filter((a) => a.accountId === accountId);
  if (!rows.length) return <Empty>עדיין לא נצפו סיסמאות בחשבון הזה.</Empty>;
  return (
    <div className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
          <Eye size={16} className="text-slate-400" />
          <div className="flex-1">
            <b>{users.find((u) => u.id === r.userId)?.name}</b> {r.action}{" "}
            <span className="text-slate-600">{devices.find((d) => d.id === r.target)?.label}</span>
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
