import type { CatalogCategory, SpecGroup } from "./types";

/**
 * Reads Provision-ISR's Israeli site (il.provision-isr.com): which products are in each category,
 * and each product's page (name, description, highlights, full spec table, images, datasheet).
 * The site is WordPress; the HTML is parsed with targeted patterns for its fixed page layout.
 */

export const PROVISION_BRAND = { id: "provision-isr", name: "Provision ISR", website: "https://il.provision-isr.com" };

/** The site's IP categories and where they go in the catalog. */
export const PROVISION_CATEGORIES: { slug: string; category: CatalogCategory }[] = [
  { slug: "ip-cameras", category: "ip-camera" },
  { slug: "ip-ptz", category: "ptz" },
  { slug: "thermal-camera", category: "thermal" },
  { slug: "solar-cameras", category: "solar" },
  { slug: "nvrs", category: "nvr" },
  { slug: "poe-switches-2", category: "switch" },
  { slug: "ip-speaker", category: "speaker" },
  { slug: "video-intercom", category: "intercom" },
];

const BASE = PROVISION_BRAND.website;
const UA = "NetMap/1.0 (+https://netmap.systemsapp.tech)";

export async function getPage(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export const categoryUrl = (slug: string, page: number) => `${BASE}/product_type/${slug}/${page > 1 ? `page/${page}/` : ""}`;
export const productUrl = (slug: string) => `${BASE}/products/${slug}/`;

/** Product slugs listed on one page of a category (the grid data is embedded as JSON with escaped slashes). */
export function parseCategoryPage(html: string, slug: string, page: number): { slugs: string[]; hasNext: boolean } {
  const slugs = [...new Set([...html.matchAll(/products\\\/([a-z0-9-]+)/g)].map((m) => m[1]))];
  return { slugs, hasNext: html.includes(`product_type/${slug}/page/${page + 1}`) };
}

const text = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t\r]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();

export interface RawProduct {
  model: string;
  name: string;
  description?: string;
  overview: string[];
  specs: SpecGroup[];
  imageUrls: string[];
  /** feature badges shown on the page (DDA1, IR_LED, NDAA, PoE, IP67…) */
  features: string[];
  /** the manufacturer's main icons, as printed on the box (analytics, light, face, NDAA, lens, ONVIF) */
  boxIcons: { name: string; url: string }[];
  datasheetUrl?: string;
  msrp?: number;
}

/** The content of the first element with this class (by counting nested divs). */
function blockByClass(html: string, cls: string): string | undefined {
  const i = html.search(new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"`));
  if (i < 0) return undefined;
  const start = html.indexOf(">", i) + 1;
  let depth = 1;
  const re = /<\/?div\b[^>]*>/g;
  re.lastIndex = start;
  for (let m; (m = re.exec(html)); ) {
    depth += m[0][1] === "/" ? -1 : 1;
    if (!depth) return html.slice(start, m.index);
  }
  return undefined;
}

export function parseProductPage(html: string, pageUrl: string): RawProduct {
  const model = text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "");
  const name = text(blockByClass(html, "product_short_descr") ?? "") || text(html.match(/<meta property="og:description" content="([^"]*)"/)?.[1] ?? "");
  const description = text(blockByClass(html, "desc-scroller") ?? "") || undefined;

  const overviewHtml = (() => {
    const i = html.indexOf('id="overview-tab"');
    if (i < 0) return "";
    const end = html.indexOf('id="features-tab"', i);
    return html.slice(i, end > i ? end : i + 20_000);
  })();
  const overview = [...overviewHtml.matchAll(/<div class="col-12">([\s\S]*?)<\/div>/g)].map((m) => text(m[1]).replace(/^•\s*/, "")).filter(Boolean);

  // spec table: group headings followed by name / value rows
  const specs: SpecGroup[] = [];
  for (const m of html.matchAll(/<h3 class="red">([\s\S]*?)<\/h3>|<div class="tx-before">([\s\S]*?)<\/div>\s*<div class="tx-val">([\s\S]*?)<\/div>/g)) {
    if (m[1] !== undefined) specs.push({ group: text(m[1]), items: [] });
    else if (specs.length) {
      const k = text(m[2]);
      const v = text(m[3]);
      if (k && !specs[specs.length - 1].items.some((x) => x.k === k)) specs[specs.length - 1].items.push({ k, v });
    }
  }
  // the page repeats lazily loaded parts: keep each group once
  const seen = new Set<string>();
  const uniqueSpecs = specs.filter((g) => g.items.length && !seen.has(g.group) && seen.add(g.group));

  // product photos and the technical drawing, from the main gallery only (not related products)
  const g = html.indexOf("main-img-slider");
  const galleryEnd = (() => {
    const ends = ["Icon-Boxes", 'id="overview-tab"', "Junction%20Box"].map((t) => html.indexOf(t, g)).filter((x) => x > g);
    return ends.length ? Math.min(...ends) : g + 40_000;
  })();
  const gallery = g >= 0 ? html.slice(g, galleryEnd) : "";
  const imageUrls = [
    ...new Set(
      [...gallery.matchAll(/https?:\/\/(?:il\.)?provision-isr\.com\/wp-content\/uploads\/Range_File_Images\/(?:Product%20Image|Technical%20draw)\/[^"' )]+?\.(?:png|jpe?g|webp)/gi)].map((m) => m[0]),
    ),
  ];
  if (!imageUrls.length) {
    const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    if (og) imageUrls.push(og);
  }

  const features = [
    ...new Set([...html.matchAll(/Range_File_Images\/(?:Icon-Boxes|Main%20features%20icons)\/([A-Za-z0-9_%-]+)\.png/g)].map((m) => decodeURIComponent(m[1]))),
  ];
  const boxIcons = [
    ...new Map(
      [...html.matchAll(/https?:\/\/(?:il\.)?provision-isr\.com\/wp-content\/uploads\/Range_File_Images\/Icon-Boxes\/([A-Za-z0-9_%-]+)\.png/g)].map((m) => [
        m[1],
        { name: decodeURIComponent(m[1]), url: m[0] },
      ]),
    ).values(),
  ];
  const pid = html.match(/\?pid=(\d+)&(?:amp;)?ptype=pdf/)?.[1];
  // the retail price, where the site shows one: "<span class="price-currency">₪</span>9935"
  const price = html.match(/₪\s*(?:<\/[a-z]+>\s*)?([\d,]+(?:\.\d+)?)/)?.[1];

  return {
    model: model.toUpperCase(),
    name,
    description,
    overview,
    specs: uniqueSpecs,
    imageUrls: imageUrls.slice(0, 6),
    features,
    boxIcons,
    datasheetUrl: pid ? `${pageUrl}?pid=${pid}&ptype=pdf` : undefined,
    msrp: price ? Number(price.replace(/,/g, "")) : undefined,
  };
}
