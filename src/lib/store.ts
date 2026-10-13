"use client";

import { useEffect, useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { createStore, del, get, set as idbSet, type UseStore } from "idb-keyval";
import { deviceTypeById } from "./catalog";
import { demoData, demoRack, type AppData } from "./demo";
import { demoPlanningFloor } from "./demo-space";
import type {
  Account,
  Area,
  ChatMessage,
  Device,
  Floor,
  Link,
  MapNote,
  Obstacle,
  Opening,
  Role,
  Site,
  User,
  Wall,
} from "./types";

export { uid } from "./ids";
import { uid } from "./ids";

// ---- IndexedDB storage ----
// Writes start immediately (no timers, which browsers throttle in background tabs).
// While a write is in flight, newer values are coalesced so only the latest is written next.
let dataStore: UseStore | undefined;
const idb = () => (dataStore ??= createStore("netmap-data", "state"));
const queued = new Map<string, string>();
let writing = false;
async function pump() {
  writing = true;
  try {
    while (queued.size) {
      const [name, value] = queued.entries().next().value!;
      queued.delete(name);
      await idbSet(name, value, idb());
    }
  } finally {
    writing = false;
  }
}
const idbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name, idb())) ?? null,
  setItem: (name, value) => {
    queued.set(name, value);
    if (!writing) void pump();
  },
  removeItem: (name) => del(name, idb()),
};

interface Actions {
  setCurrentUser: (id: string) => void;
  resetDemo: () => void;

  createAccount: (
    a: Omit<Account, "id" | "createdAt">,
    owner: { name: string; email: string },
  ) => string;
  updateAccount: (id: string, patch: Partial<Account>) => void;
  addMember: (accountId: string, user: { name: string; email: string }, role: Role) => void;
  setMemberRole: (accountId: string, userId: string, role: Role) => void;
  removeMember: (accountId: string, userId: string) => void;

  createSite: (accountId: string, name: string, address?: string) => string;
  updateSite: (id: string, patch: Partial<Site>) => void;
  deleteSite: (id: string) => void;

  addFloor: (siteId: string, name: string) => string;
  updateFloor: (id: string, patch: Partial<Floor>) => void;
  deleteFloor: (id: string) => void;

  addDevice: (d: Pick<Device, "siteId" | "floorId" | "type" | "x" | "y">) => string;
  updateDevice: (id: string, patch: Partial<Device>) => void;
  moveDevice: (id: string, x: number, y: number) => void;
  deleteDevice: (id: string) => void;

  addLink: (l: Omit<Link, "id">) => string;
  updateLink: (id: string, patch: Partial<Link>) => void;
  deleteLink: (id: string) => void;

  addArea: (a: Omit<Area, "id">) => string;
  updateArea: (id: string, patch: Partial<Area>) => void;
  deleteArea: (id: string) => void;

  addNote: (n: Omit<MapNote, "id">) => string;
  updateNote: (id: string, patch: Partial<MapNote>) => void;
  deleteNote: (id: string) => void;

  addWall: (w: Omit<Wall, "id">) => string;
  updateWall: (id: string, patch: Partial<Wall>) => void;
  deleteWall: (id: string) => void;

  addOpening: (o: Omit<Opening, "id">) => string;
  updateOpening: (id: string, patch: Partial<Opening>) => void;
  deleteOpening: (id: string) => void;

  addObstacle: (o: Omit<Obstacle, "id">) => string;
  updateObstacle: (id: string, patch: Partial<Obstacle>) => void;
  deleteObstacle: (id: string) => void;

  /** Replaces the whole space model of a floor (from the assistant). Returns an undo id. */
  applySpace: (floorId: string, space: SpaceParts) => string;
  undoSpace: (undoId: string) => boolean;
  addChatMessage: (floorId: string, m: Omit<ChatMessage, "id" | "at">) => void;
  clearChat: (floorId: string) => void;

  logAudit: (accountId: string, action: string, target?: string) => void;
}

export interface SpaceParts {
  walls: Wall[];
  openings: Opening[];
  areas: Area[];
  obstacles: Obstacle[];
}

/** In-memory undo snapshots for assistant changes (kept for this browser session). */
const spaceSnapshots = new Map<string, { floorId: string; parts: SpaceParts }>();
export const canUndoSpace = (undoId?: string) => !!undoId && spaceSnapshots.has(undoId);

export type AppState = AppData & { currentUserId: string } & Actions;

const patchById = <T extends { id: string }>(list: T[], id: string, patch: Partial<T>) =>
  list.map((x) => (x.id === id ? { ...x, ...patch } : x));

export const useApp = create<AppState>()(
  persist(
    (set, getState) => {
      const findOrCreateUser = (users: User[], u: { name: string; email: string }) => {
        const existing = users.find((x) => x.email.toLowerCase() === u.email.toLowerCase());
        if (existing) return { users, userId: existing.id };
        const nu: User = { id: uid(), name: u.name, email: u.email };
        return { users: [...users, nu], userId: nu.id };
      };

      return {
        ...demoData(),
        currentUserId: "u-installer",

        setCurrentUser: (id) => set({ currentUserId: id }),
        resetDemo: () => set({ ...demoData(), currentUserId: "u-installer" }),

        createAccount: (a, owner) => {
          const id = uid();
          set((s) => {
            const { users, userId } = findOrCreateUser(s.users, owner);
            return {
              users,
              accounts: [...s.accounts, { ...a, id, createdAt: Date.now() }],
              memberships: [
                ...s.memberships,
                { userId, accountId: id, role: "admin" },
                // the installer who opened the account stays on as technician
                ...(s.currentUserId !== userId
                  ? [{ userId: s.currentUserId, accountId: id, role: "technician" as Role }]
                  : []),
              ],
            };
          });
          return id;
        },
        updateAccount: (id, patch) => set((s) => ({ accounts: patchById(s.accounts, id, patch) })),
        addMember: (accountId, u, role) =>
          set((s) => {
            const { users, userId } = findOrCreateUser(s.users, u);
            const exists = s.memberships.some((m) => m.accountId === accountId && m.userId === userId);
            return {
              users,
              memberships: exists
                ? s.memberships.map((m) =>
                    m.accountId === accountId && m.userId === userId ? { ...m, role } : m,
                  )
                : [...s.memberships, { userId, accountId, role }],
            };
          }),
        setMemberRole: (accountId, userId, role) =>
          set((s) => ({
            memberships: s.memberships.map((m) =>
              m.accountId === accountId && m.userId === userId ? { ...m, role } : m,
            ),
          })),
        removeMember: (accountId, userId) =>
          set((s) => ({
            memberships: s.memberships.filter(
              (m) => !(m.accountId === accountId && m.userId === userId),
            ),
          })),

        createSite: (accountId, name, address) => {
          const id = uid();
          const floorId = uid();
          set((s) => ({
            sites: [...s.sites, { id, accountId, name, address, createdAt: Date.now() }],
            floors: [...s.floors, { id: floorId, siteId: id, name: "קומת קרקע", order: 0 }],
          }));
          return id;
        },
        updateSite: (id, patch) => set((s) => ({ sites: patchById(s.sites, id, patch) })),
        deleteSite: (id) =>
          set((s) => ({
            sites: s.sites.filter((x) => x.id !== id),
            floors: s.floors.filter((x) => x.siteId !== id),
            devices: s.devices.filter((x) => x.siteId !== id),
            links: s.links.filter((x) => x.siteId !== id),
            areas: s.areas.filter((x) => x.siteId !== id),
            notes: s.notes.filter((x) => x.siteId !== id),
            walls: s.walls.filter((x) => x.siteId !== id),
            openings: s.openings.filter((x) => x.siteId !== id),
            obstacles: s.obstacles.filter((x) => x.siteId !== id),
          })),

        addFloor: (siteId, name) => {
          const id = uid();
          set((s) => {
            const order = Math.max(-1, ...s.floors.filter((f) => f.siteId === siteId).map((f) => f.order)) + 1;
            return { floors: [...s.floors, { id, siteId, name, order }] };
          });
          return id;
        },
        updateFloor: (id, patch) => set((s) => ({ floors: patchById(s.floors, id, patch) })),
        deleteFloor: (id) =>
          set((s) => {
            const gone = new Set(s.devices.filter((d) => d.floorId === id).map((d) => d.id));
            return {
              floors: s.floors.filter((x) => x.id !== id),
              devices: s.devices.filter((x) => x.floorId !== id),
              links: s.links.filter(
                (l) =>
                  l.floorId !== id &&
                  !(l.a && gone.has(l.a.deviceId) && !l.floorId) &&
                  !(l.b && gone.has(l.b.deviceId) && !l.floorId),
              ),
              areas: s.areas.filter((x) => x.floorId !== id),
              notes: s.notes.filter((x) => x.floorId !== id),
              walls: s.walls.filter((x) => x.floorId !== id),
              openings: s.openings.filter((x) => x.floorId !== id),
              obstacles: s.obstacles.filter((x) => x.floorId !== id),
              chats: Object.fromEntries(Object.entries(s.chats).filter(([k]) => k !== id)),
            };
          }),

        addDevice: ({ siteId, floorId, type, x, y }) => {
          const id = uid();
          const def = deviceTypeById(type);
          set((s) => {
            const count = s.devices.filter((d) => d.siteId === siteId && d.type === type).length + 1;
            const label = type === "jack" ? `נקודה ${count}` : `${def.label} ${count}`;
            const device: Device = {
              id,
              siteId,
              floorId,
              type,
              x,
              y,
              label,
              photos: [],
              net: {},
              creds: {},
              extra: type === "jack" ? { pointNo: String(count) } : {},
              ports: def.ports,
              camera: def.camera ? { dir: 0, fov: 90, range: 10 } : undefined,
              updatedAt: Date.now(),
            };
            return { devices: [...s.devices, device] };
          });
          return id;
        },
        updateDevice: (id, patch) =>
          set((s) => ({ devices: patchById(s.devices, id, { ...patch, updatedAt: Date.now() }) })),
        moveDevice: (id, x, y) =>
          set((s) => ({
            devices: patchById(s.devices, id, { x, y }),
            // keep drawn cable endpoints attached to the device
            links: s.links.map((l) => {
              if (!l.floorId || l.points.length < 2) return l;
              const pts = [...l.points];
              let changed = false;
              if (l.a?.deviceId === id) {
                pts[0] = { x, y };
                changed = true;
              }
              if (l.b?.deviceId === id) {
                pts[pts.length - 1] = { x, y };
                changed = true;
              }
              return changed ? { ...l, points: pts } : l;
            }),
          })),
        deleteDevice: (id) =>
          set((s) => ({
            devices: s.devices.filter((d) => d.id !== id),
            links: s.links
              .filter((l) => l.floorId || (l.a?.deviceId !== id && l.b?.deviceId !== id))
              .map((l) => ({
                ...l,
                a: l.a?.deviceId === id ? undefined : l.a,
                b: l.b?.deviceId === id ? undefined : l.b,
              })),
          })),

        addLink: (l) => {
          const id = uid();
          set((s) => ({ links: [...s.links, { ...l, id }] }));
          return id;
        },
        updateLink: (id, patch) => set((s) => ({ links: patchById(s.links, id, patch) })),
        deleteLink: (id) => set((s) => ({ links: s.links.filter((l) => l.id !== id) })),

        addArea: (a) => {
          const id = uid();
          set((s) => ({ areas: [...s.areas, { ...a, id }] }));
          return id;
        },
        updateArea: (id, patch) => set((s) => ({ areas: patchById(s.areas, id, patch) })),
        deleteArea: (id) => set((s) => ({ areas: s.areas.filter((a) => a.id !== id) })),

        addNote: (n) => {
          const id = uid();
          set((s) => ({ notes: [...s.notes, { ...n, id }] }));
          return id;
        },
        updateNote: (id, patch) => set((s) => ({ notes: patchById(s.notes, id, patch) })),
        deleteNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),

        addWall: (w) => {
          const id = uid();
          set((s) => ({ walls: [...s.walls, { ...w, id }] }));
          return id;
        },
        updateWall: (id, patch) => set((s) => ({ walls: patchById(s.walls, id, patch) })),
        deleteWall: (id) =>
          set((s) => ({
            walls: s.walls.filter((w) => w.id !== id),
            openings: s.openings.filter((o) => o.wallId !== id),
          })),

        addOpening: (o) => {
          const id = uid();
          set((s) => ({ openings: [...s.openings, { ...o, id }] }));
          return id;
        },
        updateOpening: (id, patch) => set((s) => ({ openings: patchById(s.openings, id, patch) })),
        deleteOpening: (id) => set((s) => ({ openings: s.openings.filter((o) => o.id !== id) })),

        addObstacle: (o) => {
          const id = uid();
          set((s) => ({ obstacles: [...s.obstacles, { ...o, id }] }));
          return id;
        },
        updateObstacle: (id, patch) => set((s) => ({ obstacles: patchById(s.obstacles, id, patch) })),
        deleteObstacle: (id) => set((s) => ({ obstacles: s.obstacles.filter((o) => o.id !== id) })),

        applySpace: (floorId, parts) => {
          const undoId = uid();
          const s = getState();
          spaceSnapshots.set(undoId, {
            floorId,
            parts: {
              walls: s.walls.filter((x) => x.floorId === floorId),
              openings: s.openings.filter((x) => x.floorId === floorId),
              areas: s.areas.filter((x) => x.floorId === floorId),
              obstacles: s.obstacles.filter((x) => x.floorId === floorId),
            },
          });
          set((st) => ({
            walls: [...st.walls.filter((x) => x.floorId !== floorId), ...parts.walls],
            openings: [...st.openings.filter((x) => x.floorId !== floorId), ...parts.openings],
            areas: [...st.areas.filter((x) => x.floorId !== floorId), ...parts.areas],
            obstacles: [...st.obstacles.filter((x) => x.floorId !== floorId), ...parts.obstacles],
          }));
          return undoId;
        },
        undoSpace: (undoId) => {
          const snap = spaceSnapshots.get(undoId);
          if (!snap) return false;
          spaceSnapshots.delete(undoId);
          const { floorId, parts } = snap;
          set((st) => ({
            walls: [...st.walls.filter((x) => x.floorId !== floorId), ...parts.walls],
            openings: [...st.openings.filter((x) => x.floorId !== floorId), ...parts.openings],
            areas: [...st.areas.filter((x) => x.floorId !== floorId), ...parts.areas],
            obstacles: [...st.obstacles.filter((x) => x.floorId !== floorId), ...parts.obstacles],
          }));
          return true;
        },
        addChatMessage: (floorId, m) =>
          set((s) => ({
            chats: {
              ...s.chats,
              [floorId]: [...(s.chats[floorId] ?? []), { ...m, id: uid(), at: Date.now() }].slice(-60),
            },
          })),
        clearChat: (floorId) => set((s) => ({ chats: { ...s.chats, [floorId]: [] } })),

        logAudit: (accountId, action, target) =>
          set((s) => ({
            audit: [
              { id: uid(), accountId, userId: getState().currentUserId, at: Date.now(), action, target },
              ...s.audit,
            ].slice(0, 500),
          })),
      };
    },
    {
      name: "netmap",
      version: 3,
      migrate: (persisted, version) => {
        const s = persisted as Partial<AppData>;
        if (version < 2) {
          s.walls ??= [];
          s.openings ??= [];
          s.obstacles ??= [];
          s.chats ??= {};
          // add the "planned without a drawing" demo floor to the demo office, if it still exists
          if (s.sites?.some((x) => x.id === "site-cohen-tlv") && !s.floors?.some((f) => f.id === "fl-cohen-4")) {
            const p = demoPlanningFloor("site-cohen-tlv");
            s.floors = [...(s.floors ?? []), p.floor];
            s.walls = [...s.walls, ...p.walls];
            s.openings = [...s.openings, ...p.openings];
            s.obstacles = [...s.obstacles, ...p.obstacles];
            s.areas = [...(s.areas ?? []), ...p.areas];
          }
        }
        if (version < 3) {
          // demo office rack gets its cabinet build and mounted equipment
          s.devices = s.devices?.map((d) => {
            if (d.id !== "a-rack" || d.rack) return d;
            const ids = new Set(s.devices!.map((x) => x.id));
            const rack = demoRack();
            rack.items = rack.items.map((i) => (i.deviceId && !ids.has(i.deviceId) ? { ...i, deviceId: undefined } : i));
            return { ...d, rack };
          });
        }
        return s as AppState;
      },
      storage: createJSONStorage(() => idbStorage),
      skipHydration: true,
      partialize: (s) => {
        // persist data only, not functions
        const out: Partial<AppState> = {};
        for (const [k, v] of Object.entries(s)) {
          if (typeof v !== "function") (out as Record<string, unknown>)[k] = v;
        }
        return out;
      },
    },
  ),
);

/** Loads persisted data on the client; returns true once ready. */
export function useHydrated() {
  const ready = useSyncExternalStore(
    (cb) => useApp.persist.onFinishHydration(cb),
    () => useApp.persist.hasHydrated(),
    () => false,
  );
  useEffect(() => {
    if (!useApp.persist.hasHydrated()) void useApp.persist.rehydrate();
  }, []);
  return ready;
}
