"use client";

import Link from "next/link";
import { KeyRound, LogOut, UserRound, Users } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { AppShell } from "../AppShell";
import { Badge, Button, Field, Input } from "../ui";
import { PasswordInput } from "./PasswordInput";
import { toast } from "@/lib/toast";
import { AUTH_ROLE_LABEL, PASSWORD_MIN, authApi, logout, useSession, type SessionUser } from "@/lib/session-client";

/** "החשבון שלי": change my name, email and password. */
export function MyAccountScreen() {
  const user = useSession((s) => s.user);
  return (
    <AppShell crumbs={[{ label: "החשבון שלי" }]}>
      <div className="mx-auto max-w-xl space-y-4 p-4 sm:p-6">
        {!user ? (
          <p className="p-10 text-center text-slate-400">טוען…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">החשבון שלי</h1>
                <p className="text-sm text-slate-500">
                  {user.email} · <Badge color={user.role === "admin" ? "blue" : "slate"}>{AUTH_ROLE_LABEL[user.role]}</Badge>
                </p>
              </div>
              <div className="flex gap-2">
                {user.role === "admin" && (
                  <Link
                    href="/admin/users"
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-white px-4 text-sm font-medium ring-1 ring-slate-200 hover:bg-slate-50"
                  >
                    <Users size={16} /> ניהול משתמשים
                  </Link>
                )}
                <Button onClick={logout}>
                  <LogOut size={16} /> יציאה
                </Button>
              </div>
            </div>
            <DetailsForm key={user.id} user={user} />
            <PasswordForm />
          </>
        )}
      </div>
    </AppShell>
  );
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

function DetailsForm({ user }: { user: SessionUser }) {
  const setUser = useSession((s) => s.setUser);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [current, setCurrent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const emailChanged = email.trim().toLowerCase() !== user.email;
  const dirty = name.trim() !== user.name || emailChanged;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { user: next } = await authApi<{ user: SessionUser }>("/api/auth/me", "PATCH", {
        name,
        email,
        ...(emailChanged && { currentPassword: current }),
      });
      setUser(next);
      setName(next.name);
      setEmail(next.email);
      setCurrent("");
      toast(emailChanged ? "האימייל עודכן. מעכשיו נכנסים איתו." : "הפרטים נשמרו");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card icon={<UserRound size={18} className="text-slate-400" />} title="פרטים">
      <form onSubmit={save} className="space-y-3">
        <Field label="שם">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="name" />
        </Field>
        <Field label="אימייל (משמש לכניסה)">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            dir="ltr"
            className="text-right"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
        {emailChanged && (
          <Field label="הסיסמה הנוכחית (לאישור שינוי האימייל)">
            <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
          </Field>
        )}
        {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
        <Button type="submit" variant="primary" disabled={!dirty || busy}>
          {busy ? "שומר…" : "שמירה"}
        </Button>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const setUser = useSession((s) => s.setUser);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [n, setN] = useState(0);

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    setError("");
    if (get("next") !== get("confirm")) return setError("הסיסמאות החדשות לא זהות");
    setBusy(true);
    try {
      const { user } = await authApi<{ user: SessionUser }>("/api/auth/me", "PATCH", {
        currentPassword: get("current"),
        newPassword: get("next"),
      });
      setUser(user);
      setN((x) => x + 1); // clears the fields
      toast("הסיסמה עודכנה. מכשירים אחרים שהיו מחוברים נותקו.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card icon={<KeyRound size={18} className="text-slate-400" />} title="שינוי סיסמה">
      <form key={n} onSubmit={save} className="space-y-3">
        <Field label="הסיסמה הנוכחית">
          <PasswordInput name="current" required autoComplete="current-password" />
        </Field>
        <Field label={`סיסמה חדשה (לפחות ${PASSWORD_MIN} תווים)`}>
          <PasswordInput name="next" required minLength={PASSWORD_MIN} autoComplete="new-password" />
        </Field>
        <Field label="הסיסמה החדשה שוב">
          <PasswordInput name="confirm" required minLength={PASSWORD_MIN} autoComplete="new-password" />
        </Field>
        {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "מעדכן…" : "עדכון סיסמה"}
        </Button>
      </form>
    </Card>
  );
}
