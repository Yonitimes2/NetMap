import { randomBytes } from "node:crypto";
import { db, type Row } from ".";
import type { AuthUser } from "../auth/users";
import type { Org, OrgRole } from "../types";

/**
 * Accounts (the installer's business, a tenant): its customers are the rows of "accounts", its
 * people are in org_members. Owners see and manage everything in it, money included; technicians
 * work on every customer and project, without prices or user management.
 */

export type OrgMemberRole = Exclude<OrgRole, "super">;

/** The accounts the user works in; system admins see every account. */
export async function listOrgsFor(user: AuthUser): Promise<Org[]> {
  const [rows] = await (await db()).query<Row[]>(
    `SELECT o.id, o.name, om.role FROM orgs o LEFT JOIN org_members om ON om.org_id = o.id AND om.user_id = ?
      ${user.role === "admin" ? "" : "WHERE om.user_id IS NOT NULL"} ORDER BY o.created_at`,
    [user.id],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, role: (r.role as OrgMemberRole | null) ?? "super" }));
}

/** The user's role in an account, or null without access ("super": a system admin who isn't in it). */
export async function orgRole(user: AuthUser, orgId: string): Promise<OrgRole | null> {
  const conn = await db();
  const [rows] = await conn.query<Row[]>("SELECT role FROM org_members WHERE org_id = ? AND user_id = ?", [orgId, user.id]);
  if (rows[0]) return rows[0].role as OrgMemberRole;
  if (user.role !== "admin") return null;
  const [org] = await conn.query<Row[]>("SELECT 1 FROM orgs WHERE id = ?", [orgId]);
  return org.length ? "super" : null;
}

export const canManageOrg = (r: OrgRole | null) => r === "owner" || r === "super";

/**
 * Whose prices the user sees: the account they own (the first, if more than one). Only owners see
 * costs, customer prices and profit; everyone else gets products without prices.
 */
export async function priceOrg(user: AuthUser): Promise<string | null> {
  const [rows] = await (await db()).query<Row[]>(
    "SELECT om.org_id FROM org_members om JOIN orgs o ON o.id = om.org_id WHERE om.user_id = ? AND om.role = 'owner' ORDER BY o.created_at LIMIT 1",
    [user.id],
  );
  return (rows[0]?.org_id as string | undefined) ?? null;
}

export async function getOrg(id: string): Promise<{ id: string; name: string; createdAt: number } | null> {
  const [rows] = await (await db()).query<Row[]>("SELECT id, name, created_at FROM orgs WHERE id = ?", [id]);
  return rows[0] ? { id: rows[0].id, name: rows[0].name, createdAt: (rows[0].created_at as Date).getTime() } : null;
}

export async function createOrg(name: string): Promise<string> {
  const id = randomBytes(9).toString("base64url");
  const now = new Date();
  await (await db()).query("INSERT INTO orgs (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)", [id, name, now, now]);
  return id;
}

export async function renameOrg(id: string, name: string) {
  await (await db()).query("UPDATE orgs SET name = ?, updated_at = ? WHERE id = ?", [name, new Date(), id]);
}

/** Every account with its numbers, for the system admin's page. */
export async function listAllOrgs() {
  const [rows] = await (await db()).query<Row[]>(
    `SELECT o.id, o.name, o.created_at,
        (SELECT COUNT(*) FROM accounts a WHERE a.org_id = o.id) AS customers,
        (SELECT COUNT(*) FROM org_members m WHERE m.org_id = o.id) AS members,
        (SELECT GROUP_CONCAT(u.name ORDER BY m.created_at SEPARATOR ', ') FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = o.id AND m.role = 'owner') AS owners
      FROM orgs o ORDER BY o.created_at`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    createdAt: (r.created_at as Date).getTime(),
    customers: Number(r.customers),
    members: Number(r.members),
    owners: (r.owners as string | null) ?? "",
  }));
}

// ---------- people ----------

export interface OrgMember {
  userId: string;
  name: string;
  email: string;
  role: OrgMemberRole;
}

export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const [rows] = await (await db()).query<Row[]>(
    "SELECT u.id, u.name, u.email, m.role FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY m.created_at",
    [orgId],
  );
  return rows.map((r) => ({ userId: r.id, name: r.name, email: r.email, role: r.role }));
}

/** Adds the user to the account, or changes their role there. */
export async function setOrgMember(orgId: string, userId: string, role: OrgMemberRole) {
  await (await db()).query(
    "INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)",
    [orgId, userId, role, new Date()],
  );
}

export async function removeOrgMember(orgId: string, userId: string) {
  await (await db()).query("DELETE FROM org_members WHERE org_id = ? AND user_id = ?", [orgId, userId]);
}
