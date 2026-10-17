import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { db, type Row } from "../db";
import { dataDir } from "../server-keys";
import { effectiveParams, type BoxIcon, type CatalogCategory, type ProductFull, type ProductParams, type ProductSummary, type SpecGroup } from "./types";
import { DEFAULT_MARKUP, matchPriceRows, type PriceRow } from "./pricing";

/** Catalog storage (MySQL tables catalog_products / catalog_images, image files under the data dir). */

const imgDir = () => path.join(/*turbopackIgnore: true*/ dataDir(), "catalog");
const iconDir = () => path.join(/*turbopackIgnore: true*/ dataDir(), "catalog", "icons");
const newId = (bytes: number) => randomBytes(bytes).toString("base64url");

type ProductRow = Row & {
  id: string;
  brand_id: string;
  brand_name: string;
  model: string;
  slug: string | null;
  category: CatalogCategory;
  device_type: string;
  device_type_manual: number;
  name: string;
  description: string | null;
  overview: string[];
  specs: SpecGroup[];
  features: string[];
  params: ProductParams;
  overrides: ProductParams;
  images: string[];
  box_icons: BoxIcon[] | null;
  page_url: string | null;
  datasheet_url: string | null;
  msrp: string | null;
  // the account's own (see priceJoin)
  org_cost: string | null;
  org_cost_note: string | null;
  org_cost_source: string | null;
  org_cost_at: Date | null;
  org_markup_pct: string | null;
  status: ProductFull["status"];
  source_hash: string | null;
  fetched_at: Date | null;
  updated_at: Date;
};

const summary = (r: ProductRow): ProductSummary => ({
  id: r.id,
  brandId: r.brand_id,
  brandName: r.brand_name,
  model: r.model,
  name: r.name,
  category: r.category,
  deviceType: r.device_type,
  params: effectiveParams(r.params, r.overrides),
  imageId: r.images[0],
  boxIcons: r.box_icons ?? [],
  status: r.status,
  cost: r.org_cost === null ? undefined : Number(r.org_cost),
  costNote: r.org_cost_note ?? undefined,
  msrp: r.msrp === null ? undefined : Number(r.msrp),
  markupPct: r.org_markup_pct === null ? DEFAULT_MARKUP : Number(r.org_markup_pct),
});

const full = (r: ProductRow): ProductFull => ({
  ...summary(r),
  description: r.description ?? undefined,
  overview: r.overview,
  specs: r.specs,
  sourceParams: r.params,
  overrides: r.overrides,
  imageIds: r.images,
  features: r.features,
  pageUrl: r.page_url ?? undefined,
  datasheetUrl: r.datasheet_url ?? undefined,
  costSource: r.org_cost_source ?? undefined,
  costAt: r.org_cost_at?.getTime(),
  markupPct: r.org_markup_pct === null ? DEFAULT_MARKUP : Number(r.org_markup_pct),
  fetchedAt: r.fetched_at?.getTime(),
  updatedAt: r.updated_at.getTime(),
});

/**
 * Products with one account's costs and markups. Costs are each account's own (from its price
 * lists); without an account (orgId null) the product comes without them.
 */
const SELECT = `SELECT p.*, b.name AS brand_name,
    op.cost AS org_cost, op.cost_note AS org_cost_note, op.cost_source AS org_cost_source, op.cost_at AS org_cost_at, om.markup_pct AS org_markup_pct
  FROM catalog_products p JOIN brands b ON b.id = p.brand_id
  LEFT JOIN org_prices op ON op.product_id = p.id AND op.org_id = ?
  LEFT JOIN org_markups om ON om.brand_id = p.brand_id AND om.org_id = ?`;

export async function listProducts(
  filter: { brandId?: string; category?: string; q?: string; includeInactive?: boolean } = {},
  orgId: string | null = null,
): Promise<ProductSummary[]> {
  const where: string[] = [];
  const args: unknown[] = [orgId, orgId];
  if (filter.brandId) {
    where.push("p.brand_id = ?");
    args.push(filter.brandId);
  }
  if (filter.category) {
    where.push("p.category = ?");
    args.push(filter.category);
  }
  if (filter.q) {
    where.push("(p.model LIKE ? OR p.name LIKE ?)");
    args.push(`%${filter.q}%`, `%${filter.q}%`);
  }
  if (!filter.includeInactive) where.push("p.status <> 'discontinued'");
  const [rows] = await (await db()).query<ProductRow[]>(`${SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY p.category, p.model`, args);
  return rows.map(summary);
}

export async function getProduct(id: string, orgId: string | null = null): Promise<ProductFull | null> {
  const [rows] = await (await db()).query<ProductRow[]>(`${SELECT} WHERE p.id = ?`, [orgId, orgId, id]);
  return rows[0] ? full(rows[0]) : null;
}

export async function getProductByModel(brandId: string, model: string) {
  const [rows] = await (await db()).query<ProductRow[]>(`${SELECT} WHERE p.brand_id = ? AND p.model = ?`, [null, null, brandId, model]);
  return rows[0] ?? null;
}

export async function countsByCategory(brandId?: string): Promise<Record<string, number>> {
  const [rows] = await (await db()).query<Row[]>(
    `SELECT category, COUNT(*) n FROM catalog_products WHERE status <> 'discontinued' ${brandId ? "AND brand_id = ?" : ""} GROUP BY category`,
    brandId ? [brandId] : [],
  );
  return Object.fromEntries(rows.map((r) => [r.category, Number(r.n)]));
}

export interface SourceProduct {
  brandId: string;
  model: string;
  slug?: string;
  category: CatalogCategory;
  deviceType: string;
  name: string;
  description?: string;
  overview: string[];
  specs: SpecGroup[];
  features: string[];
  params: ProductParams;
  pageUrl?: string;
  datasheetUrl?: string;
  msrp?: number;
}

/** Bump when the way parameters are derived changes, so the next update recomputes every product. */
const NORMALIZE_VERSION = 2;

export const sourceHash = (p: SourceProduct, imageUrls: string[]) =>
  createHash("sha256")
    .update(JSON.stringify([NORMALIZE_VERSION, p.name, p.description, p.overview, p.specs, p.features, p.datasheetUrl, p.msrp, imageUrls]))
    .digest("hex");

/**
 * Adds or refreshes a product from its source. The admin's corrections (overrides), a category
 * chosen by hand and the status are left alone. Returns what happened.
 */
export async function upsertFromSource(p: SourceProduct, hash: string): Promise<{ id: string; result: "new" | "updated" | "same" }> {
  const conn = await db();
  const now = new Date();
  const existing = await getProductByModel(p.brandId, p.model);
  if (!existing) {
    const id = newId(12);
    await conn.query(
      `INSERT INTO catalog_products (id, brand_id, model, slug, category, device_type, name, description, overview, specs, features, params, overrides, images, page_url, datasheet_url, msrp, status, source_hash, fetched_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', '[]', ?, ?, ?, 'active', ?, ?, ?, ?)`,
      [id, p.brandId, p.model, p.slug ?? null, p.category, p.deviceType, p.name, p.description ?? null, JSON.stringify(p.overview), JSON.stringify(p.specs), JSON.stringify(p.features), JSON.stringify(p.params), p.pageUrl ?? null, p.datasheetUrl ?? null, p.msrp ?? null, hash, now, now, now],
    );
    return { id, result: "new" };
  }
  if (existing.source_hash === hash) {
    await conn.query("UPDATE catalog_products SET fetched_at = ?, status = IF(status = 'discontinued', 'active', status) WHERE id = ?", [now, existing.id]);
    return { id: existing.id, result: "same" };
  }
  await conn.query(
    `UPDATE catalog_products SET slug = ?, device_type = IF(device_type_manual, device_type, ?), name = ?, description = ?, overview = ?, specs = ?, features = ?, params = ?,
       page_url = ?, datasheet_url = ?, msrp = ?, source_hash = ?, fetched_at = ?, updated_at = ?, status = IF(status = 'discontinued', 'active', status)
     WHERE id = ?`,
    [p.slug ?? null, p.deviceType, p.name, p.description ?? null, JSON.stringify(p.overview), JSON.stringify(p.specs), JSON.stringify(p.features), JSON.stringify(p.params), p.pageUrl ?? null, p.datasheetUrl ?? null, p.msrp ?? null, hash, now, now, existing.id],
  );
  return { id: existing.id, result: "updated" };
}

/** Image source URLs a product has now, in its order. */
export async function productImageSources(productId: string): Promise<{ id: string; url: string }[]> {
  const conn = await db();
  const [[p]] = await conn.query<Row[]>("SELECT images FROM catalog_products WHERE id = ?", [productId]);
  const [rows] = await conn.query<Row[]>("SELECT id, source_url FROM catalog_images WHERE product_id = ?", [productId]);
  const byId = new Map(rows.map((r) => [r.id, r.source_url as string]));
  return ((p?.images as string[]) ?? []).filter((id) => byId.has(id)).map((id) => ({ id, url: byId.get(id)! }));
}

/** Replaces a product's images: keeps ones whose source is unchanged, downloads the new ones. */
export async function setProductImages(productId: string, urls: string[], download: (url: string) => Promise<{ bytes: Buffer; mime: string } | null>) {
  const conn = await db();
  const current = await productImageSources(productId);
  const keep = new Map(current.map((c) => [c.url, c.id]));
  const ids: string[] = [];
  await mkdir(imgDir(), { recursive: true, mode: 0o700 });
  for (const url of urls) {
    const have = keep.get(url);
    if (have) {
      ids.push(have);
      continue;
    }
    const got = await download(url);
    if (!got) continue;
    const id = newId(18);
    await writeFile(path.join(imgDir(), id), got.bytes, { mode: 0o600 });
    await conn.query("INSERT INTO catalog_images (id, product_id, source_url, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)", [id, productId, url, got.mime, got.bytes.length, new Date()]);
    ids.push(id);
  }
  for (const c of current) {
    if (ids.includes(c.id)) continue;
    await conn.query("DELETE FROM catalog_images WHERE id = ?", [c.id]);
    await unlink(path.join(imgDir(), c.id)).catch(() => {});
  }
  await conn.query("UPDATE catalog_products SET images = ? WHERE id = ?", [JSON.stringify(ids), productId]);
}

/** Stores the product's box icons; each icon image is downloaded once and shared. */
export async function setBoxIcons(productId: string, icons: { name: string; url: string }[], download: (url: string) => Promise<{ bytes: Buffer; mime: string } | null>) {
  const conn = await db();
  const out: BoxIcon[] = [];
  await mkdir(iconDir(), { recursive: true, mode: 0o700 });
  for (const ic of icons) {
    const [rows] = await conn.query<Row[]>("SELECT id FROM catalog_icons WHERE source_url = ?", [ic.url]);
    let id = rows[0]?.id as string | undefined;
    if (!id) {
      const got = await download(ic.url);
      if (!got) continue;
      id = newId(18);
      await writeFile(path.join(iconDir(), id), got.bytes, { mode: 0o600 });
      await conn.query("INSERT INTO catalog_icons (id, source_url, name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)", [id, ic.url, ic.name, got.mime, got.bytes.length, new Date()]);
    }
    out.push({ name: ic.name, iconId: id });
  }
  await conn.query("UPDATE catalog_products SET box_icons = ? WHERE id = ?", [JSON.stringify(out), productId]);
}

export async function catalogIcon(id: string): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!/^[A-Za-z0-9_-]{24}$/.test(id)) return null;
  const [rows] = await (await db()).query<Row[]>("SELECT mime FROM catalog_icons WHERE id = ?", [id]);
  if (!rows[0]) return null;
  const bytes = await readFile(path.join(iconDir(), id)).catch(() => null);
  return bytes ? { bytes, mime: rows[0].mime } : null;
}

/** Widths the catalog asks for: list cards, gallery thumbnails, the large product image. */
export const IMAGE_WIDTHS = [160, 320, 800] as const;

/**
 * A product image, optionally scaled down to one of IMAGE_WIDTHS (as WebP, made once and kept on
 * disk), so lists on a phone don't download full-size photos.
 */
export async function catalogImage(id: string, width?: number): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!/^[A-Za-z0-9_-]{24}$/.test(id)) return null;
  if (width && (IMAGE_WIDTHS as readonly number[]).includes(width)) {
    const thumb = path.join(imgDir(), "w", `${id}-${width}.webp`);
    const cached = await readFile(thumb).catch(() => null);
    if (cached) return { bytes: cached, mime: "image/webp" };
    const orig = await catalogImage(id);
    if (!orig) return null;
    const { default: sharp } = await import("sharp");
    const bytes = await sharp(orig.bytes).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    await mkdir(path.dirname(thumb), { recursive: true, mode: 0o700 });
    await writeFile(thumb, bytes, { mode: 0o600 });
    return { bytes, mime: "image/webp" };
  }
  const [rows] = await (await db()).query<Row[]>("SELECT mime FROM catalog_images WHERE id = ?", [id]);
  if (!rows[0]) return null;
  const bytes = await readFile(path.join(imgDir(), id)).catch(() => null);
  return bytes ? { bytes, mime: rows[0].mime } : null;
}

/** The admin's changes to a product. Parameter values set to null go back to the source value. */
export async function updateProduct(
  id: string,
  patch: { overrides?: Record<string, unknown>; deviceType?: string; category?: CatalogCategory; status?: ProductFull["status"] },
  orgId: string | null = null,
) {
  const conn = await db();
  const cur = await getProduct(id);
  if (!cur) return null;
  const sets: string[] = ["updated_at = ?"];
  const args: unknown[] = [new Date()];
  if (patch.overrides) {
    const next: Record<string, unknown> = { ...cur.overrides };
    for (const [k, v] of Object.entries(patch.overrides)) {
      if (v === null || v === undefined || v === "") delete next[k];
      else next[k] = v;
    }
    sets.push("overrides = ?");
    args.push(JSON.stringify(next));
  }
  if (patch.deviceType) {
    sets.push("device_type = ?", "device_type_manual = 1");
    args.push(patch.deviceType);
  }
  if (patch.category) {
    sets.push("category = ?");
    args.push(patch.category);
  }
  if (patch.status) {
    sets.push("status = ?");
    args.push(patch.status);
  }
  await conn.query(`UPDATE catalog_products SET ${sets.join(", ")} WHERE id = ?`, [...args, id]);
  return getProduct(id, orgId);
}

/** Products of a brand the latest full listing no longer shows. */
export async function markDiscontinued(brandId: string, seenModels: string[]) {
  if (!seenModels.length) return 0;
  const [res] = await (await db()).query<import("mysql2").ResultSetHeader>(
    "UPDATE catalog_products SET status = 'discontinued', updated_at = ? WHERE brand_id = ? AND status <> 'discontinued' AND model NOT IN (?)",
    [new Date(), brandId, seenModels],
  );
  return res.affectedRows;
}

// ---------- update runs ----------

export async function startRun(brandId: string, source: string) {
  const [res] = await (await db()).query<import("mysql2").ResultSetHeader>(
    "INSERT INTO catalog_sync_runs (brand_id, source, started_at, status, stats) VALUES (?, ?, ?, 'running', '{}')",
    [brandId, source, new Date()],
  );
  return res.insertId;
}

export async function finishRun(id: number, status: "done" | "error", stats: object, log: string[]) {
  await (await db()).query("UPDATE catalog_sync_runs SET finished_at = ?, status = ?, stats = ?, log = ? WHERE id = ?", [
    new Date(),
    status,
    JSON.stringify(stats),
    log.join("\n").slice(-60_000),
    id,
  ]);
}

export async function recentRuns(brandId: string, limit = 5) {
  const [rows] = await (await db()).query<Row[]>(
    "SELECT id, source, started_at, finished_at, status, stats FROM catalog_sync_runs WHERE brand_id = ? ORDER BY started_at DESC LIMIT ?",
    [brandId, limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    source: r.source as string,
    startedAt: (r.started_at as Date).getTime(),
    finishedAt: (r.finished_at as Date | null)?.getTime(),
    status: r.status as string,
    stats: r.stats as Record<string, number>,
  }));
}

/** The brands, with one account's markup on each (the default without one). */
export async function listBrands(orgId: string | null = null) {
  const [rows] = await (await db()).query<Row[]>(
    "SELECT b.id, b.name, b.website, b.sources, om.markup_pct FROM brands b LEFT JOIN org_markups om ON om.brand_id = b.id AND om.org_id = ? ORDER BY b.name",
    [orgId],
  );
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    website: r.website as string | null,
    sources: r.sources as Record<string, boolean>,
    markupPct: r.markup_pct === null ? DEFAULT_MARKUP : Number(r.markup_pct),
  }));
}

// ---------- prices (each account's own) ----------

/** The price list the account's costs for a brand are from now: its name, when it was read, how many products have a price. */
export async function priceListInfo(orgId: string, brandId: string): Promise<{ source: string; at: number; priced: number } | null> {
  const [rows] = await (await db()).query<Row[]>(
    `SELECT op.cost_source, MAX(op.cost_at) AS at, COUNT(op.cost) AS priced FROM org_prices op JOIN catalog_products p ON p.id = op.product_id
      WHERE op.org_id = ? AND p.brand_id = ? AND op.cost_source IS NOT NULL GROUP BY op.cost_source ORDER BY at DESC LIMIT 1`,
    [orgId, brandId],
  );
  const r = rows[0];
  return r ? { source: r.cost_source as string, at: (r.at as Date).getTime(), priced: Number(r.priced) } : null;
}

/**
 * A distributor's price list for a brand, for one account: each line matched to a catalog product.
 * Saving replaces the account's costs for the brand (a product the new list doesn't have loses its
 * old cost). `dryRun` only reports.
 */
export async function applyPriceList(orgId: string, brandId: string, source: string, rows: PriceRow[], dryRun: boolean) {
  const conn = await db();
  const [products] = await conn.query<Row[]>(
    `SELECT p.id, p.model, op.cost FROM catalog_products p LEFT JOIN org_prices op ON op.product_id = p.id AND op.org_id = ?
      WHERE p.brand_id = ? AND p.status <> 'discontinued'`,
    [orgId, brandId],
  );
  const { matches, unmatched } = matchPriceRows(products as { id: string; model: string }[], rows);
  const priced = new Set(matches.filter((m) => m.price !== undefined).map((m) => m.productId));
  const stats = {
    rows: rows.length,
    products: products.length,
    priced: priced.size,
    noted: matches.length - priced.size,
    withDisk: matches.filter((m) => m.note?.startsWith("כולל דיסק")).length,
    removed: products.filter((p) => p.cost !== null && !priced.has(p.id as string)).length,
    unmatched,
  };
  if (dryRun) return stats;
  const c = await conn.getConnection();
  try {
    await c.beginTransaction();
    const now = new Date();
    await c.query("DELETE op FROM org_prices op JOIN catalog_products p ON p.id = op.product_id WHERE op.org_id = ? AND p.brand_id = ?", [orgId, brandId]);
    for (const m of matches) {
      await c.query("INSERT INTO org_prices (org_id, product_id, cost, cost_note, cost_source, cost_at) VALUES (?, ?, ?, ?, ?, ?)", [
        orgId,
        m.productId,
        m.price ?? null,
        m.note ?? null,
        source,
        now,
      ]);
    }
    await c.commit();
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
  return stats;
}

export async function setMarkup(orgId: string, brandId: string, pct: number) {
  await (await db()).query(
    "INSERT INTO org_markups (org_id, brand_id, markup_pct) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE markup_pct = VALUES(markup_pct)",
    [orgId, brandId, pct],
  );
}
