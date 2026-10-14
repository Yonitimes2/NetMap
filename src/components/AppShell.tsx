"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Cloud, CloudOff, LoaderCircle, LogOut, MapPinned, Settings, TriangleAlert, UserRound, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useHydrated } from "@/lib/store";
import { DialogHost } from "./dialogs";
import { useUndoShortcuts } from "@/lib/history";
import { useToast } from "@/lib/toast";
import { AUTH_ROLE_LABEL, useSession } from "@/lib/session-client";
import { signOut, startSync, useSync } from "@/lib/sync";

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
  const loadSession = useSession((s) => s.load);
  const userId = useSession((s) => s.user?.id);
  useEffect(() => {
    loadSession();
  }, [loadSession]);
  // once this browser's copy is loaded and we know who's signed in, keep it in step with the server
  useEffect(() => {
    if (ready && userId) void startSync(userId);
  }, [ready, userId]);
  // phones show a back arrow (to the nearest level above) and the current title instead of the path
  const back = crumbs.length ? ([...crumbs].reverse().find((c) => c.href)?.href ?? "/") : null;
  const title = crumbs[crumbs.length - 1]?.label;
  return (
    <div className="flex h-dvh flex-col">
      <header className="pt-safe z-30 shrink-0 border-b border-slate-200 bg-white">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
          {back !== null && (
            <Link href={back} className="-ms-1 grid size-10 shrink-0 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 md:hidden" aria-label="חזרה">
              <ChevronRight size={22} />
            </Link>
          )}
          <Link href="/" className={`flex items-center gap-2 font-bold text-slate-900 ${back !== null ? "max-md:hidden" : ""}`}>
            <span className="grid size-8 place-items-center rounded-lg bg-slate-900 text-white">
              <MapPinned size={18} />
            </span>
            <span className="hidden sm:inline">NetMap</span>
          </Link>
          <div className="min-w-0 flex-1 truncate font-semibold md:hidden">{title ?? "NetMap"}</div>
          <nav className="hidden min-w-0 flex-1 items-center gap-1 text-sm text-slate-500 md:flex">
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
          {ready && <SyncBadge />}
          {ready && <UserMenu />}
        </div>
      </header>
      <main className={fullBleed ? "relative flex min-h-0 flex-1" : "min-h-0 flex-1 overflow-auto"}>
        {ready ? children : <div className="grid flex-1 place-items-center p-10 text-slate-400">טוען…</div>}
      </main>
      <DialogHost />
      <Toast />
    </div>
  );
}

/** Short message at the bottom, e.g. "בוטל: שינוי קירות" or "הוכנס לארון…". */
function Toast() {
  const { text, tone, n } = useToast();
  const [hidden, setHidden] = useState(0);
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => setHidden(n), 2600);
    return () => clearTimeout(t);
  }, [text, n]);
  if (!text || hidden === n) return null;
  return (
    <div
      className={`pointer-events-none fixed bottom-24 left-1/2 z-50 max-w-[90vw] text-center md:bottom-6 -translate-x-1/2 rounded-full px-4 py-2 text-sm text-white shadow-lg ${tone === "error" ? "bg-red-600/95" : "bg-slate-900/90"}`}
    >
      {text}
    </div>
  );
}

/** Whether everything is saved on the server. */
function SyncBadge() {
  const status = useSync((s) => s.status);
  const view = {
    loading: { icon: <LoaderCircle size={16} className="animate-spin" />, text: "טוען…", cls: "text-slate-400" },
    saving: { icon: <LoaderCircle size={16} className="animate-spin" />, text: "שומר…", cls: "text-slate-500" },
    saved: { icon: <Cloud size={16} />, text: "נשמר", cls: "text-slate-400" },
    offline: { icon: <CloudOff size={16} />, text: "אין חיבור, נשמר בדפדפן", cls: "text-amber-600" },
    error: { icon: <TriangleAlert size={16} />, text: "שגיאת שמירה", cls: "text-red-600" },
  }[status];
  return (
    <span className={`flex shrink-0 items-center gap-1 text-xs ${view.cls}`} title={view.text} role="status">
      {view.icon}
      <span className="hidden lg:inline">{view.text}</span>
    </span>
  );
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  const me = useSession((s) => s.user);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex h-9 items-center gap-2 rounded-lg px-2 text-sm hover:bg-slate-100">
        <span className="grid size-7 place-items-center rounded-full bg-blue-100 text-blue-700">
          <UserRound size={16} />
        </span>
        <span className="hidden max-w-32 truncate md:inline">{me?.name}</span>
      </button>
      {open && me && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 top-11 z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl bg-white p-2 shadow-xl ring-1 ring-slate-200">
            <div className="px-2 pt-1 text-sm font-semibold">{me.name}</div>
            <div className="truncate px-2 pb-1 text-xs text-slate-500">
              {me.email} · {AUTH_ROLE_LABEL[me.role]}
            </div>
            <Link href="/me" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50">
              <Settings size={15} className="text-slate-400" /> החשבון שלי: אימייל וסיסמה
            </Link>
            {me.role === "admin" && (
              <Link href="/admin/users" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50">
                <Users size={15} className="text-slate-400" /> ניהול משתמשים
              </Link>
            )}
            <button
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50"
            >
              <LogOut size={15} className="text-slate-400" /> יציאה
            </button>
          </div>
        </>
      )}
    </div>
  );
}
