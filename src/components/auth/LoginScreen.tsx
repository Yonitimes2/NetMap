"use client";

import { MapPinned } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { PASSWORD_MIN, authApi, useSession, type SessionUser } from "@/lib/session-client";

type Mode = "loading" | "login" | "setup";

/** Sign-in page. On a brand-new server (no users yet) it creates the first system admin instead. */
export function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const setUser = useSession((s) => s.setUser);
  const [mode, setMode] = useState<Mode>("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // only same-site paths, so a crafted link can't send people elsewhere after signing in
  const raw = params.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/login") ? raw : "/";

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        if (!alive) return;
        if (res.ok) return router.replace(next);
        const data = (await res.json().catch(() => ({}))) as { setup?: boolean };
        setMode(data.setup ? "setup" : "login");
      })
      .catch(() => alive && setMode("login"));
    return () => {
      alive = false;
    };
  }, [router, next]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    setError("");
    if (mode === "setup" && get("password") !== get("confirm")) return setError("הסיסמאות לא זהות");
    setBusy(true);
    try {
      const { user } =
        mode === "setup"
          ? await authApi<{ user: SessionUser }>("/api/auth/setup", "POST", { name: get("name"), email: get("email"), password: get("password") })
          : await authApi<{ user: SessionUser }>("/api/auth/login", "POST", { email: get("email"), password: get("password") });
      setUser(user);
      router.replace(next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-slate-100 p-4">
      <main className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-xl ring-1 ring-slate-200">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-slate-900 text-white">
            <MapPinned size={22} />
          </span>
          <div>
            <h1 className="text-xl font-bold">NetMap</h1>
            <p className="text-sm text-slate-500">מיפוי תשתיות תקשורת</p>
          </div>
        </div>

        {mode === "loading" ? (
          <p className="py-10 text-center text-sm text-slate-400">טוען…</p>
        ) : (
          <form key={mode} onSubmit={submit} className="space-y-4">
            {mode === "setup" && (
              <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
                <b>הגדרה ראשונה.</b> עדיין אין משתמשים במערכת. צרו את מנהל המערכת הראשון: אתם תוכלו להוסיף משתמשים נוספים אחר כך.
              </div>
            )}
            {params.has("out") && mode === "login" && !error && (
              <p className="rounded-xl bg-green-50 p-3 text-sm text-green-700" role="status">
                יצאת מהמערכת.
              </p>
            )}
            {error && (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
            {mode === "setup" && (
              <AuthField label="השם שלך">
                <input name="name" autoComplete="name" required maxLength={60} className={inputCls} />
              </AuthField>
            )}
            <AuthField label="אימייל">
              <input
                name="email"
                type="email"
                autoComplete={mode === "setup" ? "email" : "username"}
                autoCapitalize="none"
                spellCheck={false}
                required
                autoFocus
                dir="ltr"
                className={`${inputCls} text-right`}
              />
            </AuthField>
            <AuthField label="סיסמה" hint={mode === "setup" ? `לפחות ${PASSWORD_MIN} תווים` : undefined}>
              <input
                name="password"
                type="password"
                autoComplete={mode === "setup" ? "new-password" : "current-password"}
                required
                minLength={mode === "setup" ? PASSWORD_MIN : undefined}
                className={inputCls}
              />
            </AuthField>
            {mode === "setup" && (
              <AuthField label="הסיסמה שוב">
                <input name="confirm" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} className={inputCls} />
              </AuthField>
            )}
            <button
              type="submit"
              disabled={busy}
              className="h-12 w-full rounded-xl bg-slate-900 text-base font-bold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {busy ? "רגע…" : mode === "setup" ? "יצירת מנהל מערכת וכניסה" : "כניסה"}
            </button>
            {mode === "login" && <p className="text-center text-xs text-slate-400">שכחתם סיסמה? מנהל המערכת יכול לקבוע לכם סיסמה חדשה.</p>}
          </form>
        )}
      </main>
    </div>
  );
}

// 16px text stops iOS from zooming in on focus
const inputCls = "h-12 w-full rounded-xl bg-slate-50 px-3.5 text-base ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-blue-500";

function AuthField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-sm font-semibold text-slate-600">
        {label}
        {hint && <span className="text-xs font-normal text-slate-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
