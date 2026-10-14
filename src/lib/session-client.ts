"use client";

import { create } from "zustand";
import type { AuthRole } from "./auth/policy";

export { AUTH_ROLE_LABEL, PASSWORD_MIN } from "./auth/policy";

/** The signed-in user as the server sends it (see /api/auth/me). */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: AuthRole;
  createdAt: string;
}

interface SessionState {
  user: SessionUser | null;
  loaded: boolean;
  setUser: (u: SessionUser | null) => void;
  load: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  loaded: false,
  setUser: (user) => set({ user, loaded: true }),
  load: async () => {
    const res = await fetch("/api/auth/me", { cache: "no-store" }).catch(() => null);
    if (!res) return; // offline: keep what we have
    if (res.status === 401) return goToLogin();
    if (res.ok) set({ user: ((await res.json()) as { user: SessionUser }).user, loaded: true });
  },
}));

export function goToLogin() {
  const here = location.pathname + location.search;
  location.replace(here === "/" || here.startsWith("/login") ? "/login" : `/login?next=${encodeURIComponent(here)}`);
}

/** JSON request to the auth API. Returns the parsed body, or throws an Error with the server's Hebrew message. */
export async function authApi<T>(url: string, method: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message || "משהו השתבש, נסו שוב");
  return data;
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  location.replace("/login?out=1");
}
