import { normalizeProduct } from "./normalize";
import { PROVISION_BRAND, PROVISION_CATEGORIES, categoryUrl, getPage, parseCategoryPage, parseProductPage, productUrl } from "./provision";
import { finishRun, markDiscontinued, setBoxIcons, setProductImages, sourceHash, startRun, upsertFromSource } from "./store";
import { deviceTypeFor, type CatalogCategory } from "./types";

/**
 * Updates a brand's catalog from its website, in the background of the server process.
 * Pages are fetched one at a time with a pause between them, so the manufacturer's site isn't loaded.
 */

export interface SyncProgress {
  runId: number;
  brandId: string;
  phase: "listing" | "products" | "done" | "error";
  total: number;
  done: number;
  current?: string;
  stats: { new: number; updated: number; same: number; failed: number; images: number; discontinued: number };
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

const g = globalThis as unknown as { __catalogSync?: SyncProgress };
export const syncProgress = () => g.__catalogSync ?? null;
export const syncRunning = () => !!g.__catalogSync && (g.__catalogSync.phase === "listing" || g.__catalogSync.phase === "products");

const PAUSE_MS = 1200;
const pause = () => new Promise((r) => setTimeout(r, PAUSE_MS));

async function downloadImage(url: string) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "NetMap/1.0 (+https://netmap.systemsapp.tech)" }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!/^image\/(png|jpeg|webp|gif)$/.test(mime)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > 8 * 1024 * 1024) return null;
    await pause();
    return { bytes, mime };
  } catch {
    return null;
  }
}

/**
 * Starts updating a brand from its website. Returns false when an update is already running.
 * `limit` (testing) stops after that many products and skips marking missing ones as discontinued.
 */
export function startWebSync(brandId: string, opts: { limit?: number } = {}): boolean {
  if (syncRunning()) return false;
  if (brandId !== PROVISION_BRAND.id) throw new Error(`no website reader for ${brandId}`);
  const p: SyncProgress = {
    runId: 0,
    brandId,
    phase: "listing",
    total: 0,
    done: 0,
    stats: { new: 0, updated: 0, same: 0, failed: 0, images: 0, discontinued: 0 },
    startedAt: Date.now(),
  };
  g.__catalogSync = p;
  void runProvision(p, opts);
  return true;
}

async function runProvision(p: SyncProgress, opts: { limit?: number }) {
  const log: string[] = [];
  const say = (s: string) => log.push(`${new Date().toISOString()} ${s}`);
  try {
    p.runId = await startRun(p.brandId, "web");
    // 1. which products are in each category. Specific categories first, so a thermal camera
    //    listed under both "IP cameras" and "thermal" ends up as thermal.
    const order = [...PROVISION_CATEGORIES].sort((a, b) => (a.category === "ip-camera" ? 1 : 0) - (b.category === "ip-camera" ? 1 : 0));
    const slugCategory = new Map<string, CatalogCategory>();
    for (const c of order) {
      for (let page = 1; page <= 20; page++) {
        p.current = `${c.slug} עמוד ${page}`;
        const html = await getPage(categoryUrl(c.slug, page));
        const { slugs, hasNext } = parseCategoryPage(html, c.slug, page);
        let added = 0;
        for (const s of slugs) {
          if (slugCategory.has(s)) continue;
          slugCategory.set(s, c.category);
          added++;
        }
        await pause();
        if (!hasNext || !added) break;
      }
      say(`category ${c.slug}: ${[...slugCategory.values()].filter((x) => x === c.category).length}`);
    }
    let entries = [...slugCategory];
    if (opts.limit) entries = entries.slice(0, opts.limit);
    p.phase = "products";
    p.total = entries.length;

    // 2. each product page
    const seenModels: string[] = [];
    for (const [slug, category] of entries) {
      p.current = slug;
      try {
        const url = productUrl(slug);
        const raw = parseProductPage(await getPage(url), url);
        if (!raw.model) throw new Error("no model on page");
        const params = normalizeProduct({ category, ...raw });
        const src = {
          brandId: p.brandId,
          model: raw.model,
          slug,
          category,
          deviceType: deviceTypeFor(category, params),
          name: raw.name,
          description: raw.description,
          overview: raw.overview,
          specs: raw.specs,
          features: raw.features,
          params,
          pageUrl: url,
          datasheetUrl: raw.datasheetUrl,
          msrp: raw.msrp,
        };
        const { id, result } = await upsertFromSource(src, sourceHash(src, raw.imageUrls));
        p.stats[result]++;
        seenModels.push(raw.model);
        if (result !== "same") {
          await setProductImages(id, raw.imageUrls, async (u) => {
            const got = await downloadImage(u);
            if (got) p.stats.images++;
            return got;
          });
          await setBoxIcons(id, raw.boxIcons, downloadImage);
        }
      } catch (e) {
        p.stats.failed++;
        say(`failed ${slug}: ${(e as Error).message}`);
      }
      p.done++;
      await pause();
    }

    // 3. products the site no longer lists (only after a complete, healthy run)
    if (!opts.limit && p.stats.failed < Math.max(5, entries.length * 0.1) && seenModels.length > 20) {
      p.stats.discontinued = await markDiscontinued(p.brandId, seenModels);
    }
    p.phase = "done";
    p.current = undefined;
    p.finishedAt = Date.now();
    say(`done: ${JSON.stringify(p.stats)}`);
    await finishRun(p.runId, "done", p.stats, log);
  } catch (e) {
    p.phase = "error";
    p.error = (e as Error).message;
    p.finishedAt = Date.now();
    say(`error: ${p.error}`);
    if (p.runId) await finishRun(p.runId, "error", p.stats, log).catch(() => {});
  }
}
