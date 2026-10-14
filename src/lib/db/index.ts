import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "../server-keys";

/**
 * MySQL connection pool and schema. Tables are created on first use, so a fresh database
 * only needs to exist (with a user that owns it) and DATABASE_URL pointing at it.
 */

const g = globalThis as unknown as { __netmapPool?: mysql.Pool; __netmapReady?: Promise<void> };

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
];

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
      await c.query("UPDATE schema_version SET v = ?", [v + 1]);
      if (v === 0) await importUsersFile(c);
    }
  } finally {
    await c.query("SELECT RELEASE_LOCK('netmap_migrate')").catch(() => {});
    c.release();
  }
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
