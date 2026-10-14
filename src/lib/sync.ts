"use client";

import { create } from "zustand";
import { SITE_ITEM_KEYS, docOf, localImageRefs, replaceAccount, type AccountDoc, type AccountRole, type DataState } from "./account-doc";
import { quietly } from "./history";
import { localImageBlob } from "./images";
import { goToLogin, logout } from "./session-client";
import { clearLocalData, useApp, type AppState } from "./store";
import { toast } from "./toast";

/**
 * Keeps this browser's copy of the data in step with the server:
 * - every local change marks its account "dirty"; dirty accounts are saved a moment later
 *   (PUT /api/accounts/<id> with the whole account), and again whenever saving failed
 * - the server copy is pulled at start, when the window regains focus or the connection returns,
 *   and every minute (POST /api/sync with the revisions we have)
 * - offline, changes stay dirty in the browser (it's persisted) until the server is reachable
 * - images added in this browser are uploaded before their account is saved again
 * Two people saving the same business: the last save wins, and the second one is told so.
 */

export type SyncStatus = "loading" | "saved" | "saving" | "offline" | "error";

export const useSync = create<{ status: SyncStatus; ready: boolean }>(() => ({ status: "loading", ready: false }));

const PUSH_DELAY = 1200;
const PULL_EVERY = 60_000;
const RETRY_AFTER = 15_000;

let ownerId: string | null = null;
let remote = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let pushing: Promise<void> | null = null;
let pulling: Promise<void> | null = null;

// ---------- which accounts did a change touch ----------

/** Items added, removed or replaced between two versions of a list (by reference). */
function changedItems<T>(next: T[], prev: T[]): T[] {
  const before = new Set(prev);
  const after = new Set(next);
  return [...next.filter((x) => !before.has(x)), ...prev.filter((x) => !after.has(x))];
}

function touchedAccounts(s: AppState, prev: AppState): Set<string> {
  const out = new Set<string>();
  const siteAccount = new Map([...prev.sites, ...s.sites].map((x) => [x.id, x.accountId]));
  const floorSite = new Map([...prev.floors, ...s.floors].map((f) => [f.id, f.siteId]));
  if (s.accounts !== prev.accounts) for (const a of changedItems(s.accounts, prev.accounts)) out.add(a.id);
  if (s.sites !== prev.sites) for (const x of changedItems(s.sites, prev.sites)) out.add(x.accountId);
  for (const k of SITE_ITEM_KEYS) {
    if (s[k] === prev[k]) continue;
    for (const x of changedItems(s[k] as { siteId: string }[], prev[k] as { siteId: string }[])) {
      const acc = siteAccount.get(x.siteId);
      if (acc) out.add(acc);
    }
  }
  if (s.chats !== prev.chats) {
    for (const floorId of new Set([...Object.keys(s.chats), ...Object.keys(prev.chats)])) {
      if (s.chats[floorId] === prev.chats[floorId]) continue;
      const acc = siteAccount.get(floorSite.get(floorId) ?? "");
      if (acc) out.add(acc);
    }
  }
  return out;
}

function onChange(s: AppState, prev: AppState) {
  if (remote || !ownerId) return;
  const touched = touchedAccounts(s, prev);
  if (!touched.size) return;
  remote = true; // the dirty marks themselves aren't changes to sync
  try {
    useApp.setState((st) => {
      const dirty = { ...st.dirty };
      for (const id of touched) dirty[id] = (dirty[id] ?? 0) + 1;
      return { dirty };
    });
  } finally {
    remote = false;
  }
  schedulePush(PUSH_DELAY);
}

/** Store changes that come from the server: not recorded for undo, not marked dirty. */
function applyRemote(fn: (s: AppState) => Partial<AppState>, forgetHistory = true) {
  remote = true;
  try {
    quietly(() => useApp.setState(fn), forgetHistory);
  } finally {
    remote = false;
  }
}

// ---------- talking to the server ----------

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (res.status === 401) {
    goToLogin();
    throw new HttpError(401, "signed out");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status, (data as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`);
  return data as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const isNetwork = (e: unknown) => !(e instanceof HttpError);

// ---------- pull ----------

interface SyncReply {
  accounts: { id: string; rev: number; role: AccountRole }[];
  docs: { id: string; rev: number; doc: AccountDoc }[];
  removed: string[];
}

export function pull(): Promise<void> {
  pulling ??= doPull().finally(() => (pulling = null));
  return pulling;
}

async function doPull() {
  if (!ownerId) return;
  const { meta } = useApp.getState();
  const known = Object.fromEntries(Object.entries(meta).filter(([, m]) => m.rev > 0).map(([id, m]) => [id, m.rev]));
  let reply: SyncReply;
  try {
    reply = await call<SyncReply>("/api/sync", json("POST", { known }));
  } catch (e) {
    if (isNetwork(e)) useSync.setState({ status: "offline", ready: true });
    return;
  }
  const { dirty } = useApp.getState();
  const docs = reply.docs.filter((d) => !dirty[d.id]); // our unsaved changes win; they're saved next
  applyRemote((s) => {
    let data: DataState = s;
    for (const d of docs) data = replaceAccount(data, d.id, d.doc);
    const gone = reply.removed.filter((id) => s.meta[id]?.rev); // never-saved new accounts stay
    for (const id of gone) data = replaceAccount(data, id, null);
    const meta = { ...s.meta };
    for (const id of gone) delete meta[id];
    const nextDirty = { ...s.dirty };
    for (const id of gone) delete nextDirty[id];
    for (const a of reply.accounts) meta[a.id] = { rev: meta[a.id]?.rev ?? 0, role: a.role };
    for (const d of docs) meta[d.id] = { ...meta[d.id], rev: d.rev };
    return { ...data, meta, dirty: nextDirty };
  }, docs.length > 0 || reply.removed.length > 0);
  useSync.setState((st) => ({ ready: true, status: st.status === "loading" || st.status === "offline" ? "saved" : st.status }));
  if (Object.keys(useApp.getState().dirty).length) schedulePush(0);
}

// ---------- push ----------

function schedulePush(ms: number) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void push(), ms);
}

export function push(): Promise<void> {
  pushing ??= doPush().finally(() => (pushing = null));
  return pushing;
}

async function doPush() {
  if (!ownerId) return;
  const ids = Object.keys(useApp.getState().dirty);
  if (!ids.length) return void useSync.setState({ status: "saved" });
  useSync.setState({ status: "saving" });
  let failed: "offline" | "error" | null = null;
  for (const id of ids) {
    try {
      await saveAccount(id);
    } catch (e) {
      if (isNetwork(e)) {
        failed = "offline";
        break;
      }
      const status = (e as HttpError).status;
      if (status === 401) return;
      failed = "error";
      toast(`השמירה בשרת נכשלה: ${(e as Error).message}`, "error");
      // a request the server refuses won't succeed by retrying: drop it and take the server copy
      if (status === 403 || status === 400) {
        applyRemote((s) => {
          const dirty = { ...s.dirty };
          delete dirty[id];
          return { dirty, meta: { ...s.meta, [id]: { ...s.meta[id], rev: 0 } } };
        }, false);
      }
    }
  }
  const more = Object.keys(useApp.getState().dirty).length > 0;
  useSync.setState({ status: failed ?? (more ? "saving" : "saved") });
  if (failed) schedulePush(RETRY_AFTER);
  else if (more) schedulePush(PUSH_DELAY);
}

async function saveAccount(id: string) {
  const s = useApp.getState();
  const changeNo = s.dirty[id];
  const doc = docOf(s, id);
  if (!doc) {
    // the account isn't here anymore (undone, or removed): nothing to save
    applyRemote((st) => {
      const dirty = { ...st.dirty };
      delete dirty[id];
      return { dirty };
    }, false);
    return;
  }
  const meta = s.meta[id] ?? { rev: 0, role: "super" as const };
  const res = await call<{ rev: number; overwritten: boolean; created: boolean }>(`/api/accounts/${id}`, json("PUT", { baseRev: meta.rev, doc }));
  if (res.overwritten) toast(`מישהו אחר שמר שינויים ב"${doc.account.name}" בזמן שעבדת. השמירה שלך היא זו שנשארה.`);
  applyRemote((st) => {
    const dirty = { ...st.dirty };
    if (dirty[id] === changeNo) delete dirty[id]; // otherwise there were more changes meanwhile
    return { dirty, meta: { ...st.meta, [id]: { ...(st.meta[id] ?? meta), rev: res.rev } } };
  }, false);
  // the account exists on the server now, so images added in this browser can go up
  const refs = localImageRefs(doc);
  if (refs.length) await uploadImages(id, refs);
}

async function uploadImages(accountId: string, refs: string[]) {
  const swap = new Map<string, string>();
  for (const ref of refs) {
    const blob = await localImageBlob(ref);
    if (!blob) continue;
    const { id } = await call<{ id: string }>(`/api/files?account=${encodeURIComponent(accountId)}`, {
      method: "POST",
      headers: { "Content-Type": blob.type || "image/jpeg" },
      body: blob,
    });
    swap.set(ref, `file:${id}`);
  }
  if (!swap.size) return;
  // a normal change: it marks the account dirty, so the new references get saved
  quietly(() =>
    useApp.setState((s) => ({
      floors: s.floors.map((f) => (f.plan && swap.has(f.plan.src) ? { ...f, plan: { ...f.plan, src: swap.get(f.plan.src)! } } : f)),
      devices: s.devices.map((d) => (d.photos?.some((p) => swap.has(p)) ? { ...d, photos: d.photos.map((p) => swap.get(p) ?? p) } : d)),
    })),
  );
}

// ---------- start / stop ----------

let unsubscribe: (() => void) | undefined;
let pullTimer: ReturnType<typeof setInterval> | undefined;

const onFocus = () => void pull();
const onOnline = () => {
  void pull();
  schedulePush(0);
};

/** Starts syncing for the signed-in user. Data cached for someone else is dropped first. */
export async function startSync(userId: string) {
  if (ownerId === userId) return;
  stopSync();
  if (useApp.getState().ownerId !== userId) {
    await clearLocalData();
    applyRemote(() => ({ ownerId: userId }));
  }
  ownerId = userId;
  unsubscribe = useApp.subscribe(onChange);
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);
  pullTimer = setInterval(() => void pull(), PULL_EVERY);
  await pull();
}

export function stopSync() {
  ownerId = null;
  unsubscribe?.();
  clearTimeout(pushTimer);
  clearInterval(pullTimer);
  window.removeEventListener("focus", onFocus);
  window.removeEventListener("online", onOnline);
}

/** Number of businesses with changes that aren't on the server yet. */
export const unsavedCount = () => Object.keys(useApp.getState().dirty).length;

/** Sign out: unsaved changes are saved first if possible, and this browser's copy is erased. */
export async function signOut() {
  if (unsavedCount()) {
    await push().catch(() => {});
    if (unsavedCount()) {
      const { askConfirm } = await import("@/components/dialogs");
      const ok = await askConfirm({
        title: "יש שינויים שעוד לא נשמרו",
        message: "אין כרגע חיבור לשרת, ולכן חלק מהשינויים נשמרו רק בדפדפן הזה. ביציאה הם יימחקו.",
        danger: true,
        okLabel: "לצאת בכל זאת",
      });
      if (!ok) return;
    }
  }
  stopSync();
  await clearLocalData();
  await logout();
}
