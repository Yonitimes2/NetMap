import { cookies } from "next/headers";
import { findUser, type AuthUser } from "./users";
import { SESSION_COOKIE, cookieOptions, createToken, readToken } from "./session";

export function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

/** The signed-in user, checked against the user file (removed users and old passwords are rejected). */
export async function currentUser(): Promise<AuthUser | null> {
  const p = await readToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!p) return null;
  const user = await findUser(p.u);
  return user && user.sessionVersion === p.v ? user : null;
}

/** For route handlers: the user, or a ready 401/403 response. */
export async function requireUser(opts: { admin?: boolean } = {}): Promise<{ user: AuthUser } | { error: Response }> {
  const user = await currentUser();
  if (!user) return { error: jsonError(401, "unauthorized", "צריך להתחבר מחדש") };
  if (opts.admin && user.role !== "admin") return { error: jsonError(403, "forbidden", "רק מנהל מערכת יכול לעשות את זה") };
  return { user };
}

export async function startSession(user: AuthUser) {
  const { value, expires } = await createToken(user.id, user.sessionVersion);
  (await cookies()).set(SESSION_COOKIE, value, cookieOptions(expires));
}

export async function endSession() {
  (await cookies()).set(SESSION_COOKIE, "", cookieOptions(new Date(0)));
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ---------- failed sign-in throttle (in memory; one server process) ----------

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;
const fails = new Map<string, number[]>();

const recent = (key: string) => (fails.get(key) ?? []).filter((t) => t > Date.now() - WINDOW_MS);

export function clientIp(req: Request) {
  // Apache in front of the app adds X-Forwarded-For; the app itself listens on 127.0.0.1 only
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/** Minutes until the next attempt is allowed, or 0 when not throttled. */
export function throttled(keys: string[]): number {
  let until = 0;
  for (const k of keys) {
    const r = recent(k);
    if (r.length >= MAX_FAILS) until = Math.max(until, r[0] + WINDOW_MS);
  }
  return until ? Math.ceil((until - Date.now()) / 60000) : 0;
}

export function recordFail(keys: string[]) {
  for (const k of keys) fails.set(k, [...recent(k), Date.now()]);
  if (fails.size > 5000) for (const [k] of fails) if (!recent(k).length) fails.delete(k);
}

export function clearFails(keys: string[]) {
  for (const k of keys) fails.delete(k);
}
