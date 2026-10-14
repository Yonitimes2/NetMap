import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { PASSWORD_MIN, type AuthRole } from "./policy";

/**
 * Sign-in users, kept on the server in one JSON file until NetMap moves to Supabase.
 * Passwords are stored only as scrypt hashes.
 *
 * Location: $NETMAP_DATA_DIR/users.json (default .netmap-data/ in the project, git-ignored).
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

export const dataDir = () => process.env.NETMAP_DATA_DIR || path.join(process.cwd(), ".netmap-data");
const file = () => path.join(dataDir(), "users.json");

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

// ---------- storage ----------

export async function readUsers(): Promise<AuthUser[]> {
  try {
    const parsed = JSON.parse(await readFile(file(), "utf8")) as { users?: AuthUser[] };
    return Array.isArray(parsed.users) ? parsed.users : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

async function writeUsers(users: AuthUser[]) {
  await mkdir(dataDir(), { recursive: true, mode: 0o700 });
  // write-then-rename, so a crash never leaves a half-written file
  const tmp = `${file()}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify({ users }, null, 2), { mode: 0o600 });
  await rename(tmp, file());
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Read-modify-write under a lock. `fn` returns the new list (or undefined to leave the file as is)
 * plus a result for the caller.
 */
export function updateUsers<T>(fn: (users: AuthUser[]) => Promise<{ users?: AuthUser[]; result: T }> | { users?: AuthUser[]; result: T }): Promise<T> {
  const run = queue.then(async () => {
    const { users, result } = await fn(await readUsers());
    if (users) await writeUsers(users);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

export async function findUser(id: string) {
  return (await readUsers()).find((u) => u.id === id);
}

export function newUser(fields: { email: string; name: string; role: AuthRole; hash: string }): AuthUser {
  const now = new Date().toISOString();
  return { id: randomUUID(), ...fields, sessionVersion: 1, createdAt: now, updatedAt: now };
}

export const adminCount = (users: AuthUser[]) => users.filter((u) => u.role === "admin").length;
