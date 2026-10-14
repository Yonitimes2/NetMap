import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { PASSWORD_MIN, type AuthRole } from "./policy";
import { db, type Conn, type Row } from "../db";

/**
 * Sign-in users, in the MySQL "users" table. Passwords are stored only as scrypt hashes.
 * $NETMAP_DATA_DIR (default .netmap-data/ in the project, git-ignored) holds the session and
 * data keys and uploaded files.
 */

export { AUTH_ROLE_LABEL, PASSWORD_MIN, type AuthRole } from "./policy";

export const isRole = (v: unknown): v is AuthRole => v === "admin" || v === "member";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: AuthRole;
  /** scrypt$N$r$p$salt$hash */
  hash: string;
  /** bumped when the password changes: signs out every other session */
  sessionVersion: number;
  createdAt: string;
  updatedAt: string;
}

/** What leaves the server. */
export type PublicUser = Pick<AuthUser, "id" | "email" | "name" | "role" | "createdAt">;

export const publicUser = (u: AuthUser): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  createdAt: u.createdAt,
});


// ---------- validation ----------

export const normEmail = (v: unknown) => String(v ?? "").trim().toLowerCase();
export const validEmail = (e: string) => e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
/** Hebrew error message, or null when the password is acceptable. */
export function passwordProblem(p: unknown): string | null {
  if (typeof p !== "string" || p.length < PASSWORD_MIN) return `הסיסמה צריכה להיות באורך ${PASSWORD_MIN} תווים לפחות`;
  if (p.length > 200) return "הסיסמה ארוכה מדי";
  return null;
}
export const normName = (v: unknown) => String(v ?? "").trim().slice(0, 60);

// ---------- hashing ----------

const N = 1 << 16;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scryptAsync(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: 256 * n * r }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, key] = stored.split("$");
  if (alg !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Spends the same time as a real check, so a missing email can't be told apart by timing. */
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string) {
  dummyHash ??= hashPassword(randomUUID());
  await verifyPassword(password, await dummyHash);
}

// ---------- storage (MySQL table "users") ----------

type UserRow = Row & {
  id: string;
  email: string;
  name: string;
  role: AuthRole;
  hash: string;
  session_version: number;
  created_at: Date;
  updated_at: Date;
};

const fromRow = (r: UserRow): AuthUser => ({
  id: r.id,
  email: r.email,
  name: r.name,
  role: r.role,
  hash: r.hash,
  sessionVersion: r.session_version,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

const COLS = "id, email, name, role, hash, session_version, created_at, updated_at";

export async function readUsers(c?: Conn): Promise<AuthUser[]> {
  const [rows] = await (c ?? (await db())).query<UserRow[]>(`SELECT ${COLS} FROM users ORDER BY created_at`);
  return rows.map(fromRow);
}

export async function findUser(id: string) {
  const [rows] = await (await db()).query<UserRow[]>(`SELECT ${COLS} FROM users WHERE id = ?`, [id]);
  return rows[0] ? fromRow(rows[0]) : undefined;
}

export async function findUserByEmail(email: string) {
  const [rows] = await (await db()).query<UserRow[]>(`SELECT ${COLS} FROM users WHERE email = ?`, [email]);
  return rows[0] ? fromRow(rows[0]) : undefined;
}

/**
 * Read-modify-write of the whole (small) user list in one transaction, one writer at a time,
 * so rules like "keep at least one admin" hold. `fn` returns the new list (or undefined to leave
 * it as is) plus a result for the caller.
 */
export async function updateUsers<T>(fn: (users: AuthUser[]) => Promise<{ users?: AuthUser[]; result: T }> | { users?: AuthUser[]; result: T }): Promise<T> {
  const c = await (await db()).getConnection();
  try {
    // serializes user changes across requests (and server processes); released after the commit
    await c.query("SELECT GET_LOCK('netmap_users', 10)");
    await c.beginTransaction();
    const before = await readUsers(c);
    const { users, result } = await fn(before);
    if (users) await writeChanges(c, before, users);
    await c.commit();
    return result;
  } catch (e) {
    await c.rollback().catch(() => {});
    throw e;
  } finally {
    await c.query("SELECT RELEASE_LOCK('netmap_users')").catch(() => {});
    c.release();
  }
}

async function writeChanges(c: Conn, before: AuthUser[], after: AuthUser[]) {
  const old = new Map(before.map((u) => [u.id, u]));
  const now = new Set(after.map((u) => u.id));
  for (const u of before) if (!now.has(u.id)) await c.query("DELETE FROM users WHERE id = ?", [u.id]);
  for (const u of after) {
    const prev = old.get(u.id);
    if (prev === u) continue;
    const vals = [u.email, u.name, u.role, u.hash, u.sessionVersion, new Date(u.createdAt), new Date(u.updatedAt)];
    if (!prev) {
      await c.query("INSERT INTO users (id, email, name, role, hash, session_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [u.id, ...vals]);
    } else {
      await c.query("UPDATE users SET email = ?, name = ?, role = ?, hash = ?, session_version = ?, created_at = ?, updated_at = ? WHERE id = ?", [...vals, u.id]);
    }
  }
}

export function newUser(fields: { email: string; name: string; role: AuthRole; hash: string }): AuthUser {
  const now = new Date().toISOString();
  return { id: randomUUID(), ...fields, sessionVersion: 1, createdAt: now, updatedAt: now };
}

export const adminCount = (users: AuthUser[]) => users.filter((u) => u.role === "admin").length;
