"use client";

import { KeyRound, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../AppShell";
import { askConfirm } from "../dialogs";
import { Badge, Button, Field, Input, Modal, Select } from "../ui";
import { PasswordInput, randomPassword } from "./PasswordInput";
import { toast } from "@/lib/toast";
import { AUTH_ROLE_LABEL, PASSWORD_MIN, authApi, useSession, type SessionUser } from "@/lib/session-client";

type Editing = { kind: "add" } | { kind: "edit"; user: SessionUser } | { kind: "password"; user: SessionUser } | null;

/** System admin: who can sign in to NetMap. */
export function UsersAdminScreen() {
  const me = useSession((s) => s.user);
  return (
    <AppShell crumbs={[{ label: "החשבון שלי", href: "/me" }, { label: "ניהול משתמשים" }]}>
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        {!me ? (
          <p className="p-10 text-center text-slate-400">טוען…</p>
        ) : me.role !== "admin" ? (
          <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">רק מנהל מערכת יכול לנהל משתמשים.</p>
        ) : (
          <UsersList me={me} />
        )}
      </div>
    </AppShell>
  );
}

function UsersList({ me }: { me: SessionUser }) {
  const [users, setUsers] = useState<SessionUser[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [n, setN] = useState(0);
  const reload = () => setN((x) => x + 1);

  useEffect(() => {
    let alive = true;
    authApi<{ users: SessionUser[] }>("/api/admin/users", "GET")
      .then((r) => alive && setUsers(r.users))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [n]);

  const remove = async (u: SessionUser) => {
    const ok = await askConfirm({
      title: `למחוק את ${u.name}?`,
      message: `${u.email} לא יוכל יותר להיכנס למערכת. אפשר להוסיף אותו מחדש אחר כך.`,
      danger: true,
      okLabel: "מחק",
    });
    if (!ok) return;
    try {
      await authApi(`/api/admin/users/${u.id}`, "DELETE");
      toast(`${u.name} נמחק`);
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">ניהול משתמשים</h1>
          <p className="text-sm text-slate-500">מי יכול להיכנס ל-NetMap. כל משתמש יכול לשנות את האימייל והסיסמה שלו ב״החשבון שלי״.</p>
        </div>
        <Button variant="primary" onClick={() => setEditing({ kind: "add" })}>
          <Plus size={16} /> משתמש חדש
        </Button>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!users ? (
        !error && <p className="p-10 text-center text-slate-400">טוען…</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {u.name}
                  {u.id === me.id && <span className="text-xs font-normal text-slate-400">(אני)</span>}
                  <Badge color={u.role === "admin" ? "blue" : "slate"}>{AUTH_ROLE_LABEL[u.role]}</Badge>
                </div>
                <div className="truncate text-sm text-slate-500" dir="ltr" style={{ textAlign: "right" }}>
                  {u.email}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: "edit", user: u })} title="עריכת פרטים">
                  <Pencil size={15} /> <span className="hidden sm:inline">עריכה</span>
                </Button>
                {u.id !== me.id && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: "password", user: u })} title="קביעת סיסמה חדשה">
                      <KeyRound size={15} /> <span className="hidden sm:inline">סיסמה חדשה</span>
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => remove(u)} title="מחיקה">
                      <Trash2 size={15} />
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing?.kind === "add" && <UserModal onClose={() => setEditing(null)} onDone={reload} />}
      {editing?.kind === "edit" && <UserModal user={editing.user} isMe={editing.user.id === me.id} onClose={() => setEditing(null)} onDone={reload} />}
      {editing?.kind === "password" && <PasswordModal user={editing.user} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Add a user (with a first password), or edit name / email / role. */
function UserModal({ user, isMe, onClose, onDone }: { user?: SessionUser; isMe?: boolean; onClose: () => void; onDone: () => void }) {
  const setSessionUser = useSession((s) => s.setUser);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<SessionUser["role"]>(user?.role ?? "member");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (user) {
        const r = await authApi<{ user: SessionUser }>(`/api/admin/users/${user.id}`, "PATCH", { name, email, role });
        if (isMe) setSessionUser(r.user);
        toast("הפרטים נשמרו");
      } else {
        await authApi("/api/admin/users", "POST", { name, email, role, password });
        toast(`${name.trim()} נוסף. מסרו לו את האימייל והסיסמה.`);
      }
      onDone();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={user ? `עריכת ${user.name}` : "משתמש חדש"}
      onClose={onClose}
      footer={
        <>
          <Button type="submit" form="user-form" variant="primary" disabled={busy}>
            {busy ? "שומר…" : user ? "שמירה" : "הוספה"}
          </Button>
          <Button onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <form id="user-form" onSubmit={save} className="space-y-3">
        <Field label="שם">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoFocus />
        </Field>
        <Field label="אימייל (משמש לכניסה)">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            dir="ltr"
            className="text-right"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
        <Field label="הרשאה">
          <Select value={role} onChange={(e) => setRole(e.target.value as SessionUser["role"])} disabled={isMe}>
            <option value="member">{AUTH_ROLE_LABEL.member}</option>
            <option value="admin">{AUTH_ROLE_LABEL.admin} (גם מנהל משתמשים)</option>
          </Select>
        </Field>
        {!user && (
          <Field label={`סיסמה ראשונה (לפחות ${PASSWORD_MIN} תווים)`}>
            <div className="flex gap-2">
              <div className="flex-1">
                <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required minLength={PASSWORD_MIN} autoComplete="new-password" />
              </div>
              <Button type="button" onClick={() => setPassword(randomPassword())} title="יצירת סיסמה אקראית">
                <Wand2 size={15} /> אקראית
              </Button>
            </div>
            <p className="mt-1 text-xs text-slate-500">מסרו אותה למשתמש. הוא יוכל להחליף אותה ב״החשבון שלי״.</p>
          </Field>
        )}
        {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
      </form>
    </Modal>
  );
}

/** Set a new password for someone who forgot theirs. */
function PasswordModal({ user, onClose }: { user: SessionUser; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await authApi(`/api/admin/users/${user.id}`, "PATCH", { password });
      toast(`נקבעה סיסמה חדשה ל${user.name}`);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`סיסמה חדשה ל${user.name}`}
      onClose={onClose}
      footer={
        <>
          <Button type="submit" form="password-form" variant="primary" disabled={busy}>
            {busy ? "שומר…" : "קביעת סיסמה"}
          </Button>
          <Button onClick={onClose}>ביטול</Button>
        </>
      }
    >
      <form id="password-form" onSubmit={save} className="space-y-3">
        <p className="text-sm text-slate-600">הסיסמה הישנה תפסיק לעבוד ו{user.name} ינותק מכל המכשירים.</p>
        <Field label={`סיסמה חדשה (לפחות ${PASSWORD_MIN} תווים)`}>
          <div className="flex gap-2">
            <div className="flex-1">
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required minLength={PASSWORD_MIN} autoComplete="new-password" autoFocus />
            </div>
            <Button type="button" onClick={() => setPassword(randomPassword())} title="יצירת סיסמה אקראית">
              <Wand2 size={15} /> אקראית
            </Button>
          </div>
        </Field>
        {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
      </form>
    </Modal>
  );
}
