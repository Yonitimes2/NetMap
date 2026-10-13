"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { useApp, type AppState } from "./store";

/**
 * Undo / redo for every data change in the app (not for chat, audit log or the current user).
 * Works by watching the store: before each change the previous data is kept as a snapshot.
 * - All changes made in the same event (e.g. a room = 4 walls + a room) become one step.
 * - Repeated edits of the same item within a short time (typing in a field) become one step.
 */

const DATA_KEYS = [
  "accounts",
  "memberships",
  "users",
  "sites",
  "floors",
  "devices",
  "links",
  "areas",
  "notes",
  "walls",
  "openings",
  "obstacles",
] as const;
type DataKey = (typeof DATA_KEYS)[number];
type Snap = Pick<AppState, DataKey>;

const KEY_LABEL: Record<DataKey, string> = {
  accounts: "חשבונות",
  memberships: "משתמשים",
  users: "משתמשים",
  sites: "אתרים",
  floors: "קומות",
  devices: "ציוד",
  links: "כבלים",
  areas: "חדרים",
  notes: "הערות",
  walls: "קירות",
  openings: "פתחים",
  obstacles: "עמודים",
};

interface Entry {
  snap: Snap;
  sig: string;
  keys: DataKey[];
  label: string;
  at: number;
}

const labelOf = (keys: DataKey[]) => `שינוי ${[...new Set(keys.map((k) => KEY_LABEL[k]))].join(", ")}`;

const past: Entry[] = [];
const future: Entry[] = [];
let applying = false;
let tickOpen = false;
const MAX = 100;
const MERGE_MS = 1200;

export const useHistory = create<{ undoLabel?: string; redoLabel?: string; flash: { text: string; n: number } | null }>(() => ({
  flash: null,
}));

const publish = () =>
  useHistory.setState({ undoLabel: past[past.length - 1]?.label, redoLabel: future[future.length - 1]?.label });

const pick = (s: AppState): Snap => Object.fromEntries(DATA_KEYS.map((k) => [k, s[k]])) as unknown as Snap;

/** ids of items that were added, removed or changed in a list */
function changedIds(next: { id?: string }[], prev: { id?: string }[]) {
  const before = new Map(prev.map((x) => [x.id, x]));
  const ids: string[] = [];
  for (const x of next) if (before.get(x.id) !== x) ids.push(x.id ?? "?");
  if (next.length !== prev.length) {
    const now = new Set(next.map((x) => x.id));
    for (const x of prev) if (!now.has(x.id)) ids.push(x.id ?? "?");
  }
  return ids;
}

let started = false;
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  useApp.subscribe((s, prev) => {
    if (applying || !useApp.persist.hasHydrated()) return;
    const keys = DATA_KEYS.filter((k) => s[k] !== prev[k]);
    if (!keys.length) return;
    future.length = 0;
    // more changes in the same event: they belong to the step already recorded
    if (tickOpen) {
      const cur = past[past.length - 1];
      if (cur) {
        cur.keys = [...new Set([...cur.keys, ...keys])];
        cur.label = labelOf(cur.keys);
      }
      return publish();
    }
    const sig = keys.map((k) => `${k}:${changedIds(s[k] as { id?: string }[], prev[k] as { id?: string }[]).join(",")}`).join("|");
    const now = Date.now();
    const last = past[past.length - 1];
    if (last && last.sig === sig && now - last.at < MERGE_MS) {
      last.at = now; // keep typing in the same field as one step
      return publish();
    }
    past.push({ snap: pick(prev), sig, keys, label: labelOf(keys), at: now });
    if (past.length > MAX) past.shift();
    tickOpen = true;
    setTimeout(() => (tickOpen = false), 0);
    publish();
  });
}

function restore(from: Entry[], to: Entry[], verb: string) {
  const e = from.pop();
  if (!e) return;
  to.push({ ...e, snap: pick(useApp.getState()), at: 0 });
  applying = true;
  try {
    useApp.setState(e.snap);
  } finally {
    applying = false;
  }
  const n = (useHistory.getState().flash?.n ?? 0) + 1;
  useHistory.setState({ flash: { text: `${verb}: ${e.label}`, n } });
  publish();
}

// start recording as soon as the module loads in the browser (also after a hot reload in development)
start();

export const undo = () => restore(past, future, "בוטל");
export const redo = () => restore(future, past, "שוחזר");

/** Starts recording and binds Ctrl/⌘+Z, Ctrl/⌘+Shift+Z and Ctrl+Y (outside text fields). */
export function useUndoShortcuts() {
  useEffect(() => {
    start();
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target;
      // inside a text field the browser's own undo handles the text
      if (t instanceof Element && t.closest("input, textarea, select, [contenteditable]")) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
