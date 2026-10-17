import type { Account, Area, ChatMessage, Device, Floor, Link, MapNote, Obstacle, Opening, Site, Wall } from "./types";

/**
 * Everything that belongs to one business, as it is stored on the server (one row per account)
 * and exchanged with the browser. Shared by the server and the browser (no Node imports here).
 */
export interface AccountDoc {
  account: Account;
  sites: Site[];
  floors: Floor[];
  devices: Device[];
  links: Link[];
  areas: Area[];
  notes: MapNote[];
  walls: Wall[];
  openings: Opening[];
  obstacles: Obstacle[];
  /** space-assistant chat per floor id */
  chats: Record<string, ChatMessage[]>;
}

/**
 * The signed-in user's role in a customer:
 * - "owner": an owner of the account the customer belongs to (everything, prices and money included)
 * - "technician": a technician of that account, or one given access to this customer (no money, no users)
 * - "admin": the customer's own business owner (their maps and their people; no prices)
 * - "super": a system admin who isn't in the account (sees and manages everything but its money)
 */
export type AccountRole = "owner" | "admin" | "technician" | "super";

/** Lists of items that belong to a site (each item has siteId). */
export const SITE_ITEM_KEYS = ["floors", "devices", "links", "areas", "notes", "walls", "openings", "obstacles"] as const;
type SiteItemKey = (typeof SITE_ITEM_KEYS)[number];

export type DataState = Pick<AccountDoc, SiteItemKey | "sites" | "chats"> & { accounts: Account[] };

export const validId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{4,40}$/.test(id);

/** The account's part of the store, or null if the account isn't there. */
export function docOf(s: DataState, accountId: string): AccountDoc | null {
  const account = s.accounts.find((a) => a.id === accountId);
  if (!account) return null;
  const sites = s.sites.filter((x) => x.accountId === accountId);
  const siteIds = new Set(sites.map((x) => x.id));
  const pick = <K extends SiteItemKey>(k: K) => (s[k] as { siteId: string }[]).filter((x) => siteIds.has(x.siteId)) as AccountDoc[K];
  const floors = pick("floors");
  const floorIds = new Set(floors.map((f) => f.id));
  return {
    account,
    sites,
    floors,
    devices: pick("devices"),
    links: pick("links"),
    areas: pick("areas"),
    notes: pick("notes"),
    walls: pick("walls"),
    openings: pick("openings"),
    obstacles: pick("obstacles"),
    chats: Object.fromEntries(Object.entries(s.chats).filter(([k]) => floorIds.has(k))),
  };
}

/**
 * Store changes that replace an account's data with `doc` (or remove the account when doc is null).
 * Items that point at another account's sites are ignored, so one account can never write into another.
 */
export function replaceAccount(s: DataState, accountId: string, doc: AccountDoc | null): DataState {
  const oldSites = new Set(s.sites.filter((x) => x.accountId === accountId).map((x) => x.id));
  const otherSites = new Set(s.sites.filter((x) => x.accountId !== accountId).map((x) => x.id));
  const sites = (doc?.sites ?? []).filter((x) => x.accountId === accountId && !otherSites.has(x.id));
  const siteIds = new Set(sites.map((x) => x.id));
  const merge = <K extends SiteItemKey>(k: K) =>
    [
      ...(s[k] as { siteId: string }[]).filter((x) => !oldSites.has(x.siteId)),
      ...((doc?.[k] ?? []) as { siteId: string }[]).filter((x) => siteIds.has(x.siteId)),
    ] as DataState[K];
  const oldFloors = new Set(s.floors.filter((f) => oldSites.has(f.siteId)).map((f) => f.id));
  const floors = merge("floors");
  const newFloors = new Set((doc?.floors ?? []).filter((f) => siteIds.has(f.siteId)).map((f) => f.id));
  const accounts = s.accounts.filter((a) => a.id !== accountId);
  return {
    accounts: doc ? [...accounts, { ...doc.account, id: accountId }] : accounts,
    sites: [...s.sites.filter((x) => x.accountId !== accountId), ...sites],
    floors,
    devices: merge("devices"),
    links: merge("links"),
    areas: merge("areas"),
    notes: merge("notes"),
    walls: merge("walls"),
    openings: merge("openings"),
    obstacles: merge("obstacles"),
    chats: {
      ...Object.fromEntries(Object.entries(s.chats).filter(([k]) => !oldFloors.has(k))),
      ...Object.fromEntries(Object.entries(doc?.chats ?? {}).filter(([k]) => newFloors.has(k))),
    },
  };
}

/** Structural check before the server stores a doc. Returns a Hebrew error, or null when it's fine. */
export function docProblem(accountId: string, doc: unknown): string | null {
  const d = doc as Partial<AccountDoc> | null;
  if (!d || typeof d !== "object") return "נתונים לא תקינים";
  if (!d.account || d.account.id !== accountId) return "מזהה העסק לא תואם";
  if (typeof d.account.name !== "string" || !d.account.name.trim() || d.account.name.length > 200) return "שם הלקוח לא תקין";
  if (d.account.orgId !== undefined && !validId(d.account.orgId)) return "החשבון לא תקין";
  if (!Array.isArray(d.sites) || !d.sites.every((x) => x && validId(x.id) && x.accountId === accountId)) return "אתרים לא תקינים";
  const siteIds = new Set(d.sites.map((x) => x.id));
  if (siteIds.size !== d.sites.length) return "אתרים כפולים";
  for (const k of SITE_ITEM_KEYS) {
    const list = d[k] as { id?: unknown; siteId?: unknown }[] | undefined;
    if (!Array.isArray(list) || !list.every((x) => x && typeof x.id === "string" && siteIds.has(x.siteId as string))) {
      return "פריטים לא תקינים במפה";
    }
  }
  if (!d.chats || typeof d.chats !== "object" || Array.isArray(d.chats)) return "שיחות לא תקינות";
  return null;
}

/** Image references in a doc that still point at this browser's storage ("idb:…"). */
export function localImageRefs(doc: AccountDoc): string[] {
  const refs = [
    ...doc.floors.map((f) => f.plan?.src),
    ...doc.devices.flatMap((d) => d.photos ?? []),
  ];
  return [...new Set(refs.filter((r): r is string => !!r && r.startsWith("idb:")))];
}
