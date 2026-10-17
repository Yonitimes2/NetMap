import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { db, tx, type Row } from ".";
import { serverKey } from "../server-keys";
import type { AccountDoc, AccountRole } from "../account-doc";
import type { AuthUser } from "../auth/users";
import type { Device, Role } from "../types";

/**
 * Customers (the "accounts" table, named before there were accounts above them): one row per
 * customer holding its whole doc and the account it belongs to (org_id), plus the people given
 * access to just this customer (memberships) and the audit log.
 */

// ---------- equipment passwords: encrypted inside the stored doc ----------

const dataKey = () => serverKey("NETMAP_DATA_KEY", "data.key");

async function encrypt(text: string): Promise<string> {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", await dataKey(), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

async function decrypt(value: string): Promise<string> {
  const [v, iv, tag, enc] = value.split(".");
  if (v !== "v1") throw new Error("unknown encryption version");
  const d = createDecipheriv("aes-256-gcm", await dataKey(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}

type StoredDevice = Omit<Device, "creds"> & { creds?: Device["creds"]; credsEnc?: string };

async function sealDoc(doc: AccountDoc) {
  const devices: StoredDevice[] = [];
  for (const d of doc.devices) {
    const { creds, ...rest } = d;
    devices.push(creds && Object.values(creds).some(Boolean) ? { ...rest, credsEnc: await encrypt(JSON.stringify(creds)) } : { ...rest, creds: {} });
  }
  return { ...doc, devices };
}

async function openDoc(stored: AccountDoc & { devices: StoredDevice[] }): Promise<AccountDoc> {
  const devices: Device[] = [];
  for (const d of stored.devices) {
    const { credsEnc, ...rest } = d;
    devices.push({ ...rest, creds: credsEnc ? JSON.parse(await decrypt(credsEnc)) : (rest.creds ?? {}) } as Device);
  }
  return { ...stored, devices };
}

// ---------- access ----------

/** People of the customer's account come first, then system admins, then people given access to just this customer. */
function pickRole(user: AuthUser, orgRole: string | null, customerRole: Role | null): AccountRole | null {
  if (orgRole) return orgRole === "owner" ? "owner" : "technician";
  if (user.role === "admin") return "super";
  return customerRole;
}

/** The user's role in a customer, or null without access. */
export async function roleIn(user: AuthUser, accountId: string): Promise<AccountRole | null> {
  const [rows] = await (await db()).query<Row[]>(
    `SELECT om.role AS org_role, m.role AS customer_role FROM accounts a
      LEFT JOIN org_members om ON om.org_id = a.org_id AND om.user_id = ?
      LEFT JOIN memberships m ON m.account_id = a.id AND m.user_id = ?
      WHERE a.id = ?`,
    [user.id, user.id, accountId],
  );
  if (!rows[0]) return user.role === "admin" ? "super" : null;
  return pickRole(user, rows[0].org_role, rows[0].customer_role);
}

/** Who manages the people given access to a customer: the account's owners, the customer's own business owner, system admins. */
export const canManageUsers = (r: AccountRole | null) => r === "owner" || r === "admin" || r === "super";

/** Customers the user can see, with the current revision, the account they're in and the user's role. */
export async function visibleAccounts(user: AuthUser): Promise<{ id: string; rev: number; orgId: string | null; role: AccountRole }[]> {
  const [rows] = await (await db()).query<Row[]>(
    `SELECT a.id, a.rev, a.org_id, om.role AS org_role, m.role AS customer_role FROM accounts a
      LEFT JOIN org_members om ON om.org_id = a.org_id AND om.user_id = ?
      LEFT JOIN memberships m ON m.account_id = a.id AND m.user_id = ?
      ${user.role === "admin" ? "" : "WHERE om.user_id IS NOT NULL OR m.user_id IS NOT NULL"}
      ORDER BY a.created_at`,
    [user.id, user.id],
  );
  return rows.map((r) => ({ id: r.id, rev: r.rev, orgId: r.org_id, role: pickRole(user, r.org_role, r.customer_role)! }));
}

export async function loadDocs(ids: string[]): Promise<{ id: string; rev: number; doc: AccountDoc }[]> {
  if (!ids.length) return [];
  const [rows] = await (await db()).query<Row[]>("SELECT id, rev, org_id, doc FROM accounts WHERE id IN (?)", [ids]);
  return Promise.all(
    rows.map(async (r) => {
      const doc = await openDoc(r.doc);
      // the server's record of the account it's in is the one that counts
      return { id: r.id, rev: r.rev, doc: { ...doc, account: { ...doc.account, orgId: r.org_id ?? undefined } } };
    }),
  );
}

/**
 * Stores a customer's doc. Creates the customer, in the account its doc names, when it doesn't exist
 * yet (callers check that the user works in that account). A customer never moves to another account.
 * The last save wins: `overwritten` tells the caller that someone else saved since `baseRev`.
 */
export async function saveDoc(user: AuthUser, id: string, baseRev: number, doc: AccountDoc) {
  return tx(async (c) => {
    const [rows] = await c.query<Row[]>("SELECT rev, org_id FROM accounts WHERE id = ? FOR UPDATE", [id]);
    const now = new Date();
    if (!rows.length) {
      const sealed = JSON.stringify(await sealDoc(doc));
      await c.query("INSERT INTO accounts (id, org_id, name, rev, doc, created_at, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?, ?, ?)", [
        id,
        doc.account.orgId,
        doc.account.name,
        sealed,
        new Date(doc.account.createdAt || now),
        now,
        user.id,
      ]);
      return { rev: 1, overwritten: false, created: true };
    }
    const sealed = JSON.stringify(await sealDoc({ ...doc, account: { ...doc.account, orgId: rows[0].org_id ?? undefined } }));
    const rev = rows[0].rev + 1;
    await c.query("UPDATE accounts SET name = ?, rev = ?, doc = ?, updated_at = ?, updated_by = ? WHERE id = ?", [doc.account.name, rev, sealed, now, user.id, id]);
    return { rev, overwritten: rows[0].rev !== baseRev, created: false };
  });
}

export async function accountExists(id: string) {
  const [rows] = await (await db()).query<Row[]>("SELECT 1 FROM accounts WHERE id = ?", [id]);
  return rows.length > 0;
}

// ---------- members ----------

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

export async function listMembers(accountId: string): Promise<Member[]> {
  const [rows] = await (await db()).query<Row[]>(
    "SELECT u.id, u.name, u.email, m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.account_id = ? ORDER BY m.created_at",
    [accountId],
  );
  return rows.map((r) => ({ userId: r.id, name: r.name, email: r.email, role: r.role }));
}

/** Adds the user to the account, or changes their role there. */
export async function setMember(accountId: string, userId: string, role: Role) {
  await (await db()).query(
    "INSERT INTO memberships (account_id, user_id, role, created_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)",
    [accountId, userId, role, new Date()],
  );
}

export async function removeMember(accountId: string, userId: string) {
  await (await db()).query("DELETE FROM memberships WHERE account_id = ? AND user_id = ?", [accountId, userId]);
}

// ---------- audit log ----------

export async function addAudit(accountId: string, user: AuthUser, action: string, target?: string) {
  await (await db()).query("INSERT INTO audit (account_id, user_id, user_name, at, action, target) VALUES (?, ?, ?, ?, ?, ?)", [
    accountId,
    user.id,
    user.name,
    new Date(),
    action.slice(0, 200),
    target?.slice(0, 64) ?? null,
  ]);
}

export async function listAudit(accountId: string) {
  const [rows] = await (await db()).query<Row[]>(
    "SELECT id, user_id, user_name, at, action, target FROM audit WHERE account_id = ? ORDER BY at DESC LIMIT 500",
    [accountId],
  );
  return rows.map((r) => ({ id: String(r.id), userId: r.user_id, userName: r.user_name, at: (r.at as Date).getTime(), action: r.action, target: r.target ?? undefined }));
}
