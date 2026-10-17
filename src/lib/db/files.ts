import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { db, type Row } from ".";
import { dataDir } from "../server-keys";

/**
 * Uploaded files: floor plans and equipment photos (everyone with access to the customer sees them),
 * and private ones only the account's owners open (suppliers' receipts). Contents on disk, the
 * customer they belong to in the files table.
 */

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
/** a receipt: a picture or a PDF */
export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

const dir = () => path.join(dataDir(), "files");
const validFileId = (id: string) => /^[A-Za-z0-9_-]{24}$/.test(id);

export async function saveFile(accountId: string, userId: string, mime: string, bytes: Buffer, opts: { private?: boolean } = {}): Promise<string> {
  const id = randomBytes(18).toString("base64url");
  await mkdir(/*turbopackIgnore: true*/ dir(), { recursive: true, mode: 0o700 });
  await writeFile(/*turbopackIgnore: true*/ path.join(dir(), id), bytes, { mode: 0o600 });
  await (await db()).query("INSERT INTO files (id, account_id, mime, size, private, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    id,
    accountId,
    mime,
    bytes.length,
    opts.private ? 1 : 0,
    new Date(),
    userId,
  ]);
  return id;
}

export async function fileInfo(id: string): Promise<{ accountId: string; mime: string; private: boolean } | null> {
  if (!validFileId(id)) return null;
  const [rows] = await (await db()).query<Row[]>("SELECT account_id, mime, private FROM files WHERE id = ?", [id]);
  return rows[0] ? { accountId: rows[0].account_id, mime: rows[0].mime, private: !!rows[0].private } : null;
}

export const readFileBytes = (id: string) => readFile(/*turbopackIgnore: true*/ path.join(dir(), id));
