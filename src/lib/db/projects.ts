import { randomBytes } from "node:crypto";
import type { ResultSetHeader } from "mysql2";
import { db, type Row } from ".";
import type { AuthUser } from "../auth/users";
import type { AccountDoc } from "../account-doc";
import { cleanDefaults, cleanFinance, emptyDefaults, emptyFinance, type ProjectFinance, type QuoteDefaults } from "../quote";
import type { Site } from "../types";

/**
 * A project's money (the quote's prices and the owner's changes) and the links its customer opens
 * the quote with. Both live apart from the customer's doc, which syncs to everyone with access to
 * the customer: only the account's owners read and change them.
 */

/** The project, when it's a site of that customer: with the account the customer is in. */
export async function projectOf(accountId: string, siteId: string): Promise<{ orgId: string | null; site: Site } | null> {
  const [rows] = await (await db()).query<Row[]>("SELECT org_id, JSON_EXTRACT(doc, '$.sites') AS sites FROM accounts WHERE id = ?", [accountId]);
  const r = rows[0];
  if (!r) return null;
  const sites = (typeof r.sites === "string" ? JSON.parse(r.sites) : r.sites) as Site[] | null;
  const site = sites?.find((s) => s.id === siteId);
  return site ? { orgId: r.org_id, site } : null;
}

/** A quote's version: counted on each save (0: never saved), and when that was. */
export interface QuoteVersion {
  rev: number;
  updatedAt?: number;
}

export async function getFinance(siteId: string): Promise<{ finance: ProjectFinance } & QuoteVersion> {
  const [rows] = await (await db()).query<Row[]>("SELECT doc, rev, updated_at FROM project_finance WHERE site_id = ?", [siteId]);
  const r = rows[0];
  return r ? { finance: cleanFinance(r.doc), rev: r.rev, updatedAt: (r.updated_at as Date).getTime() } : { finance: emptyFinance(), rev: 0 };
}

export async function saveFinance(user: AuthUser, accountId: string, siteId: string, finance: ProjectFinance): Promise<QuoteVersion> {
  const now = new Date();
  await (await db()).query(
    `INSERT INTO project_finance (site_id, account_id, doc, rev, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)
      ON DUPLICATE KEY UPDATE doc = VALUES(doc), rev = rev + 1, updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)`,
    [siteId, accountId, JSON.stringify(finance), now, user.id],
  );
  const [rows] = await (await db()).query<Row[]>("SELECT rev FROM project_finance WHERE site_id = ?", [siteId]);
  return { rev: rows[0]?.rev ?? 1, updatedAt: now.getTime() };
}

export async function getQuoteDefaults(orgId: string | null): Promise<QuoteDefaults> {
  if (!orgId) return emptyDefaults();
  const [rows] = await (await db()).query<Row[]>("SELECT quote_defaults FROM orgs WHERE id = ?", [orgId]);
  return rows[0]?.quote_defaults ? cleanDefaults(rows[0].quote_defaults) : emptyDefaults();
}

export async function setQuoteDefaults(orgId: string, d: QuoteDefaults) {
  await (await db()).query("UPDATE orgs SET quote_defaults = ?, updated_at = ? WHERE id = ?", [JSON.stringify(d), new Date(), orgId]);
}

// ---------- links for the customer ----------

export interface ShareLink {
  id: string;
  token: string;
  showPrices: boolean;
  expiresAt?: number;
  revokedAt?: number;
  views: number;
  lastViewAt?: number;
  createdAt: number;
}

const linkFromRow = (r: Row): ShareLink => ({
  id: r.id,
  token: r.token,
  showPrices: !!r.show_prices,
  expiresAt: (r.expires_at as Date | null)?.getTime(),
  revokedAt: (r.revoked_at as Date | null)?.getTime(),
  views: Number(r.views),
  lastViewAt: (r.last_view_at as Date | null)?.getTime(),
  createdAt: (r.created_at as Date).getTime(),
});

/** The project's links that still work (not revoked, not expired). */
export async function listLinks(siteId: string): Promise<ShareLink[]> {
  const [rows] = await (await db()).query<Row[]>(
    "SELECT * FROM share_links WHERE site_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 50",
    [siteId, new Date()],
  );
  return rows.map(linkFromRow);
}

/** A new link to the project's page for the customer; `days` until it stops working (none: until revoked). */
export async function createLink(user: AuthUser, accountId: string, siteId: string, showPrices: boolean, days?: number) {
  const now = new Date();
  await (await db()).query(
    "INSERT INTO share_links (id, token, account_id, site_id, show_prices, expires_at, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      randomBytes(9).toString("base64url"),
      randomBytes(24).toString("base64url"),
      accountId,
      siteId,
      showPrices ? 1 : 0,
      days ? new Date(now.getTime() + days * 86_400_000) : null,
      now,
      user.id,
    ],
  );
}

export async function revokeLink(siteId: string, linkId: string) {
  const [res] = await (await db()).query<ResultSetHeader>("UPDATE share_links SET revoked_at = ? WHERE id = ? AND site_id = ? AND revoked_at IS NULL", [
    new Date(),
    linkId,
    siteId,
  ]);
  return res.affectedRows > 0;
}

const validToken = (t: string) => /^[A-Za-z0-9_-]{32}$/.test(t);

/** The link behind a token, while it works (not revoked, not expired). */
export async function openLink(token: string): Promise<(ShareLink & { accountId: string; siteId: string }) | null> {
  if (!validToken(token)) return null;
  const [rows] = await (await db()).query<Row[]>("SELECT * FROM share_links WHERE token = ?", [token]);
  const r = rows[0];
  if (!r || r.revoked_at || (r.expires_at && (r.expires_at as Date).getTime() < Date.now())) return null;
  return { ...linkFromRow(r), accountId: r.account_id, siteId: r.site_id };
}

export async function countView(linkId: string) {
  await (await db()).query("UPDATE share_links SET views = views + 1, last_view_at = ? WHERE id = ?", [new Date(), linkId]);
}

/** The customer's doc as stored, for the customer's page: only plain map data is read from it (never passwords). */
export async function customerDoc(accountId: string): Promise<{ orgId: string | null; doc: AccountDoc } | null> {
  const [rows] = await (await db()).query<Row[]>("SELECT org_id, doc FROM accounts WHERE id = ?", [accountId]);
  return rows[0] ? { orgId: rows[0].org_id, doc: rows[0].doc as AccountDoc } : null;
}

export async function orgName(orgId: string | null): Promise<string> {
  if (!orgId) return "";
  const [rows] = await (await db()).query<Row[]>("SELECT name FROM orgs WHERE id = ?", [orgId]);
  return (rows[0]?.name as string | undefined) ?? "";
}
