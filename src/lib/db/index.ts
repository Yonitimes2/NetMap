import mysql from "mysql2/promise";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "../server-keys";

/**
 * MySQL connection pool and schema. Tables are created on first use, so a fresh database
 * only needs to exist (with a user that owns it) and DATABASE_URL pointing at it.
 */

const g = globalThis as unknown as { __netmapPool?: mysql.Pool; __netmapReady?: Promise<void>; __netmapSteps?: number };

function pool(): mysql.Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  g.__netmapPool ??= mysql.createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: 10,
    charset: "utf8mb4",
    timezone: "Z",
    // DATETIME values come back as JS Dates in UTC
    dateStrings: false,
  });
  return g.__netmapPool;
}

/** The pool, after the schema is in place. */
export async function db(): Promise<mysql.Pool> {
  const p = pool();
  // new schema steps (e.g. after a code change in development) are applied on the next use
  if (g.__netmapSteps !== STEPS.length) {
    g.__netmapSteps = STEPS.length;
    g.__netmapReady = undefined;
  }
  g.__netmapReady ??= migrate(p).catch((e) => {
    g.__netmapReady = undefined;
    throw e;
  });
  await g.__netmapReady;
  return p;
}

export type Row = mysql.RowDataPacket;
export type Conn = mysql.PoolConnection;

/** Runs `fn` in a transaction. */
export async function tx<T>(fn: (c: Conn) => Promise<T>): Promise<T> {
  const c = await (await db()).getConnection();
  try {
    await c.beginTransaction();
    const out = await fn(c);
    await c.commit();
    return out;
  } catch (e) {
    await c.rollback().catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const STEPS: string[][] = [
  // 1: users, business accounts and their data
  [
    `CREATE TABLE users (
      id CHAR(36) NOT NULL PRIMARY KEY,
      email VARCHAR(190) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      role ENUM('admin','member') NOT NULL DEFAULT 'member',
      hash VARCHAR(255) NOT NULL,
      session_version INT NOT NULL DEFAULT 1,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    // doc: the account's details and everything mapped in it (see account-doc.ts);
    // equipment passwords inside it are encrypted
    `CREATE TABLE accounts (
      id VARCHAR(40) NOT NULL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      rev INT NOT NULL DEFAULT 1,
      doc JSON NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      updated_by CHAR(36) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE memberships (
      account_id VARCHAR(40) NOT NULL,
      user_id CHAR(36) NOT NULL,
      role ENUM('admin','technician') NOT NULL,
      created_at DATETIME(3) NOT NULL,
      PRIMARY KEY (account_id, user_id),
      KEY by_user (user_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE audit (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      account_id VARCHAR(40) NOT NULL,
      user_id CHAR(36) NULL,
      user_name VARCHAR(120) NOT NULL,
      at DATETIME(3) NOT NULL,
      action VARCHAR(200) NOT NULL,
      target VARCHAR(64) NULL,
      KEY by_account (account_id, at),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    // file contents live on disk: $NETMAP_DATA_DIR/files/<id>
    `CREATE TABLE files (
      id CHAR(24) NOT NULL PRIMARY KEY,
      account_id VARCHAR(40) NOT NULL,
      mime VARCHAR(80) NOT NULL,
      size INT NOT NULL,
      created_at DATETIME(3) NOT NULL,
      created_by CHAR(36) NULL,
      KEY by_account (account_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],
  // 2: product catalog (brands, their products with planning parameters, images, update runs)
  [
    `CREATE TABLE brands (
      id VARCHAR(40) NOT NULL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      website VARCHAR(300) NULL,
      sources JSON NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    // params: read from the source; overrides: the admin's corrections (an update never touches them)
    `CREATE TABLE catalog_products (
      id CHAR(16) NOT NULL PRIMARY KEY,
      brand_id VARCHAR(40) NOT NULL,
      model VARCHAR(80) NOT NULL,
      slug VARCHAR(160) NULL,
      category VARCHAR(20) NOT NULL,
      device_type VARCHAR(20) NOT NULL,
      device_type_manual TINYINT(1) NOT NULL DEFAULT 0,
      name VARCHAR(500) NOT NULL DEFAULT '',
      description TEXT NULL,
      overview JSON NOT NULL,
      specs JSON NOT NULL,
      features JSON NOT NULL,
      params JSON NOT NULL,
      overrides JSON NOT NULL,
      images JSON NOT NULL,
      page_url VARCHAR(500) NULL,
      datasheet_url VARCHAR(500) NULL,
      msrp DECIMAL(10,2) NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      source_hash CHAR(64) NULL,
      fetched_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      UNIQUE KEY brand_model (brand_id, model),
      KEY by_category (category),
      FOREIGN KEY (brand_id) REFERENCES brands(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    // image contents on disk: $NETMAP_DATA_DIR/catalog/<id>
    `CREATE TABLE catalog_images (
      id CHAR(24) NOT NULL PRIMARY KEY,
      product_id CHAR(16) NOT NULL,
      source_url VARCHAR(600) NOT NULL,
      mime VARCHAR(40) NOT NULL,
      size INT NOT NULL,
      created_at DATETIME(3) NOT NULL,
      KEY by_product (product_id),
      FOREIGN KEY (product_id) REFERENCES catalog_products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE catalog_sync_runs (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      brand_id VARCHAR(40) NOT NULL,
      source VARCHAR(20) NOT NULL,
      started_at DATETIME(3) NOT NULL,
      finished_at DATETIME(3) NULL,
      status VARCHAR(16) NOT NULL,
      stats JSON NOT NULL,
      log MEDIUMTEXT NULL,
      KEY by_brand (brand_id, started_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `INSERT INTO brands (id, name, website, sources, created_at, updated_at)
      VALUES ('provision-isr', 'Provision ISR', 'https://il.provision-isr.com', JSON_OBJECT('web', TRUE, 'excel', TRUE), NOW(3), NOW(3))`,
  ],
  // 3: the manufacturer's box icons (one stored copy per icon image, shared by the products using it)
  [
    `CREATE TABLE catalog_icons (
      id CHAR(24) NOT NULL PRIMARY KEY,
      source_url VARCHAR(600) NOT NULL,
      name VARCHAR(120) NOT NULL,
      mime VARCHAR(40) NOT NULL,
      size INT NOT NULL,
      created_at DATETIME(3) NOT NULL,
      UNIQUE KEY by_url (source_url)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `ALTER TABLE catalog_products ADD COLUMN box_icons JSON NULL`,
  ],
  // 4: prices — the cost from a distributor's price list per product, and each brand's markup for a customer price
  [
    `ALTER TABLE catalog_products
      ADD COLUMN cost DECIMAL(10,2) NULL,
      ADD COLUMN cost_note VARCHAR(120) NULL,
      ADD COLUMN cost_source VARCHAR(160) NULL,
      ADD COLUMN cost_at DATETIME(3) NULL`,
    `ALTER TABLE brands ADD COLUMN markup_pct DECIMAL(5,1) NULL`,
  ],
  // 5: accounts (the installer's business, a tenant) above the customers ("accounts" rows): their
  // own users, and their own costs and markups (the catalog itself stays shared)
  [
    `CREATE TABLE orgs (
      id VARCHAR(40) NOT NULL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    // owner: everything, prices and money included; technician: every customer and project, no money
    `CREATE TABLE org_members (
      org_id VARCHAR(40) NOT NULL,
      user_id CHAR(36) NOT NULL,
      role ENUM('owner','technician') NOT NULL,
      created_at DATETIME(3) NOT NULL,
      PRIMARY KEY (org_id, user_id),
      KEY by_user (user_id),
      FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `ALTER TABLE accounts ADD COLUMN org_id VARCHAR(40) NULL, ADD KEY by_org (org_id), ADD FOREIGN KEY (org_id) REFERENCES orgs(id)`,
    `CREATE TABLE org_prices (
      org_id VARCHAR(40) NOT NULL,
      product_id CHAR(16) NOT NULL,
      cost DECIMAL(10,2) NULL,
      cost_note VARCHAR(120) NULL,
      cost_source VARCHAR(160) NULL,
      cost_at DATETIME(3) NULL,
      PRIMARY KEY (org_id, product_id),
      KEY by_product (product_id),
      FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES catalog_products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE org_markups (
      org_id VARCHAR(40) NOT NULL,
      brand_id VARCHAR(40) NOT NULL,
      markup_pct DECIMAL(5,1) NOT NULL,
      PRIMARY KEY (org_id, brand_id),
      FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE,
      FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],
  // 6: quotes — each project's prices and changes (the account owners' alone, never in the customer's
  // doc), the account's defaults for new quotes, and the links customers open the quote with
  [
    `ALTER TABLE orgs ADD COLUMN quote_defaults JSON NULL`,
    `CREATE TABLE project_finance (
      site_id VARCHAR(40) NOT NULL PRIMARY KEY,
      account_id VARCHAR(40) NOT NULL,
      doc JSON NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      updated_by CHAR(36) NULL,
      KEY by_account (account_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE share_links (
      id CHAR(12) NOT NULL PRIMARY KEY,
      token CHAR(32) NOT NULL UNIQUE,
      account_id VARCHAR(40) NOT NULL,
      site_id VARCHAR(40) NOT NULL,
      show_prices TINYINT(1) NOT NULL,
      expires_at DATETIME(3) NULL,
      revoked_at DATETIME(3) NULL,
      views INT NOT NULL DEFAULT 0,
      last_view_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL,
      created_by CHAR(36) NULL,
      KEY by_site (site_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],
  // 7: a quote's version, counted on each save (the owner and the customer see it was updated)
  [`ALTER TABLE project_finance ADD COLUMN rev INT NOT NULL DEFAULT 1`],
  // 8: files only the account's owners may open (a supplier's receipt), not everyone with access to the customer
  [`ALTER TABLE files ADD COLUMN private TINYINT(1) NOT NULL DEFAULT 0`],
];

/** Data moves that go with a schema step, run before the step counts as done. */
const AFTER_STEP: Record<number, (c: Conn) => Promise<void>> = {
  1: importUsersFile,
  5: firstOrg,
};

async function migrate(p: mysql.Pool) {
  const c = await p.getConnection();
  try {
    // one server process migrates at a time
    await c.query("SELECT GET_LOCK('netmap_migrate', 30)");
    await c.query("CREATE TABLE IF NOT EXISTS schema_version (v INT NOT NULL) ENGINE=InnoDB");
    const [rows] = await c.query<Row[]>("SELECT v FROM schema_version");
    let v = rows[0]?.v ?? 0;
    if (!rows.length) await c.query("INSERT INTO schema_version (v) VALUES (0)");
    for (; v < STEPS.length; v++) {
      for (const sql of STEPS[v]) await c.query(sql);
      await AFTER_STEP[v + 1]?.(c);
      await c.query("UPDATE schema_version SET v = ?", [v + 1]);
    }
  } finally {
    await c.query("SELECT RELEASE_LOCK('netmap_migrate')").catch(() => {});
    c.release();
  }
}

/**
 * Before accounts, every business was the system admins' customer: they all go into one account,
 * owned by the system admins, with the costs and markups imported until now. Its name is set later
 * on the account's settings page.
 */
async function firstOrg(c: Conn) {
  const [orgs] = await c.query<Row[]>("SELECT id FROM orgs LIMIT 1");
  if (orgs.length) return;
  const [customers] = await c.query<Row[]>("SELECT id FROM accounts LIMIT 1");
  const [admins] = await c.query<Row[]>("SELECT id FROM users WHERE role = 'admin'");
  if (!customers.length && !admins.length) return; // a new installation: accounts are opened from the admin page
  const id = randomBytes(9).toString("base64url");
  const now = new Date();
  await c.query("INSERT INTO orgs (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)", [id, "העסק שלי", now, now]);
  await c.query("UPDATE accounts SET org_id = ?", [id]);
  for (const a of admins) await c.query("INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)", [id, a.id, now]);
  await c.query(
    `INSERT INTO org_prices (org_id, product_id, cost, cost_note, cost_source, cost_at)
      SELECT ?, id, cost, cost_note, cost_source, cost_at FROM catalog_products WHERE cost IS NOT NULL OR cost_note IS NOT NULL`,
    [id],
  );
  await c.query("INSERT INTO org_markups (org_id, brand_id, markup_pct) SELECT ?, id, markup_pct FROM brands WHERE markup_pct IS NOT NULL", [id]);
}

/** Sign-in users from before the database (users.json in the data dir) move into the users table once. */
async function importUsersFile(c: Conn) {
  let users: { id: string; email: string; name: string; role: string; hash: string; sessionVersion: number; createdAt: string; updatedAt: string }[];
  try {
    users = JSON.parse(await readFile(/*turbopackIgnore: true*/ path.join(dataDir(), "users.json"), "utf8")).users ?? [];
  } catch {
    return;
  }
  for (const u of users) {
    await c.query(
      "INSERT IGNORE INTO users (id, email, name, role, hash, session_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [u.id, u.email, u.name, u.role, u.hash, u.sessionVersion, new Date(u.createdAt), new Date(u.updatedAt)],
    );
  }
}
