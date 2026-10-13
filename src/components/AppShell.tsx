"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, MapPinned, RotateCcw, UserRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useApp, useHydrated } from "@/lib/store";
import { ROLE_LABEL } from "@/lib/access";
import { DialogHost, askConfirm } from "./dialogs";
import { useHistory, useUndoShortcuts } from "@/lib/history";

export interface Crumb {
  label: string;
  href?: string;
}

export function AppShell({
  crumbs = [],
  actions,
  children,
  fullBleed,
}: {
  crumbs?: Crumb[];
  actions?: ReactNode;
  children: ReactNode;
  fullBleed?: boolean;
}) {
  const ready = useHydrated();
  useUndoShortcuts();
  return (
    <div className="flex h-dvh flex-col">
      <header className="z-30 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-slate-900">
          <span className="grid size-8 place-items-center rounded-lg bg-slate-900 text-white">
            <MapPinned size={18} />
          </span>
          <span className="hidden sm:inline">NetMap</span>
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm text-slate-500">
          {crumbs.map((c, i) => (
            <span key={i} className="flex min-w-0 items-center gap-1">
              <ChevronLeft size={14} className="shrink-0 text-slate-300" />
              {c.href ? (
                <Link href={c.href} className="truncate hover:text-slate-900">
                  {c.label}
                </Link>
              ) : (
                <span className="truncate font-medium text-slate-900">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
        {actions}
        {ready && <UserSwitcher />}
      </header>
      <main className={fullBleed ? "relative flex min-h-0 flex-1" : "min-h-0 flex-1 overflow-auto"}>
        {ready ? children : <div className="grid flex-1 place-items-center p-10 text-slate-400">טוען…</div>}
      </main>
      <DialogHost />
      <UndoFlash />
    </div>
  );
}

/** Short message after undo / redo, e.g. "בוטל: שינוי קירות". */
function UndoFlash() {
  const flash = useHistory((s) => s.flash);
  const [hidden, setHidden] = useState<number | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setHidden(flash.n), 1800);
    return () => clearTimeout(t);
  }, [flash]);
  if (!flash || hidden === flash.n) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900/90 px-4 py-2 text-sm text-white shadow-lg">
      {flash.text}
    </div>
  );
}

/** Demo-only: switch between users to test what each role sees. */
function UserSwitcher() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const users = useApp((s) => s.users);
  const memberships = useApp((s) => s.memberships);
  const accounts = useApp((s) => s.accounts);
  const currentUserId = useApp((s) => s.currentUserId);
  const setCurrentUser = useApp((s) => s.setCurrentUser);
  const resetDemo = useApp((s) => s.resetDemo);
  const current = users.find((u) => u.id === currentUserId);

  const describe = (userId: string) => {
    const u = users.find((x) => x.id === userId);
    const roles = memberships
      .filter((m) => m.userId === userId)
      .map((m) => `${ROLE_LABEL[m.role]} · ${accounts.find((a) => a.id === m.accountId)?.name ?? ""}`);
    return [u?.superAdmin ? ROLE_LABEL.super : null, ...roles].filter(Boolean).join("\n");
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded-lg px-2 text-sm hover:bg-slate-100"
      >
        <span className="grid size-7 place-items-center rounded-full bg-blue-100 text-blue-700">
          <UserRound size={16} />
        </span>
        <span className="hidden max-w-32 truncate md:inline">{current?.name}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 top-11 z-50 w-80 rounded-xl bg-white p-2 shadow-xl ring-1 ring-slate-200">
            <div className="px-2 py-1 text-xs font-medium text-amber-700">מצב דמו: החלפת משתמש לבדיקת הרשאות</div>
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  setCurrentUser(u.id);
                  setOpen(false);
                  router.push("/");
                }}
                className={`block w-full rounded-lg px-2 py-2 text-start hover:bg-slate-50 ${u.id === currentUserId ? "bg-blue-50" : ""}`}
              >
                <div className="text-sm font-medium">{u.name}</div>
                <div className="whitespace-pre-line text-xs text-slate-500">{describe(u.id) || "ללא חשבונות"}</div>
              </button>
            ))}
            <button
              onClick={async () => {
                setOpen(false);
                if (await askConfirm({ title: "איפוס נתוני דמו", message: "כל השינויים שעשית יימחקו והדמו יחזור למצב ההתחלתי.", danger: true, okLabel: "אפס" })) {
                  resetDemo();
                  router.push("/");
                }
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-500 hover:bg-slate-50"
            >
              <RotateCcw size={14} /> איפוס נתוני דמו
            </button>
          </div>
        </>
      )}
    </div>
  );
}
