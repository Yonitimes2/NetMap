"use client";

import { create } from "zustand";
import type { CableRun, LayerId, ObstacleKind, OpeningKind, Point, WallType } from "@/lib/types";

/** What the assistant has written so far, drawn on the map while it is still working. */
export interface SpacePreview {
  floorId: string;
  walls: { a: Point; b: Point; type: WallType; thicknessCm?: number }[];
  rooms: { points: Point[]; name: string }[];
}

export type Tool =
  | "select"
  | "wall"
  | "room"
  | "opening"
  | "obstacle"
  | "place"
  | "cable"
  | "tray"
  | "area"
  | "note"
  | "measure"
  | "calibrate";

/** Something the user pointed at on the map for the assistant: an element, or a free rectangle. */
export interface ChatRef {
  kind: "wall" | "area" | "opening" | "obstacle" | "device" | "region";
  id?: string;
  label: string;
  /** region corners in map px */
  rect?: { x1: number; y1: number; x2: number; y2: number };
}

export type Selection =
  | { kind: "device" | "link" | "area" | "note" | "wall" | "opening" | "obstacle"; id: string }
  | null;

interface EditorState {
  tool: Tool;
  placeType: string;
  cableType: string;
  trayType: string;
  /** run given to newly drawn cables */
  cableRun: CableRun | undefined;
  wallType: WallType;
  openingKind: OpeningKind;
  obstacleKind: ObstacleKind;
  /** color walls by material, or by cable pass-through status */
  wallColorBy: "type" | "pass";
  showStructure: boolean;
  /** equipment mounted in a rack is drawn inside the rack's marker instead of on its own */
  rackCollapse: boolean;
  assistantOpen: boolean;
  /** which tab the side panel shows when both the assistant and a selection are open */
  sideTab: "assistant" | "details";
  preview: SpacePreview | null;
  /** elements / regions attached to the next assistant message, numbered #1, #2… */
  refs: ChatRef[];
  /** while set, clicks on the map add references instead of selecting */
  pickMode: null | "object" | "region";
  selection: Selection;
  layers: Record<LayerId, boolean>;
  showLabels: boolean;
  showCones: boolean;
  /** request the canvas to center on a device */
  focus: { id: string; n: number } | null;
  /** fit-to-screen request counter */
  fitN: number;
  setTool: (t: Tool) => void;
  setPlaceType: (t: string) => void;
  setCableType: (t: string) => void;
  setTrayType: (t: string) => void;
  setCableRun: (r: CableRun | undefined) => void;
  setWallType: (t: WallType) => void;
  setOpeningKind: (k: OpeningKind) => void;
  setObstacleKind: (k: ObstacleKind) => void;
  setWallColorBy: (v: "type" | "pass") => void;
  setShowStructure: (v: boolean) => void;
  setRackCollapse: (v: boolean) => void;
  setAssistantOpen: (v: boolean) => void;
  setSideTab: (t: "assistant" | "details") => void;
  setPreview: (p: SpacePreview | null) => void;
  addRef: (r: ChatRef) => void;
  removeRef: (index: number) => void;
  clearRefs: () => void;
  setPickMode: (m: null | "object" | "region") => void;
  select: (s: Selection) => void;
  toggleLayer: (l: LayerId) => void;
  setShowLabels: (v: boolean) => void;
  setShowCones: (v: boolean) => void;
  focusOn: (id: string) => void;
  fit: () => void;
  reset: () => void;
}

const allLayers = (): Record<LayerId, boolean> => ({
  network: true,
  cctv: true,
  audio: true,
  alarm: true,
  infra: true,
  power: true,
  other: true,
});

export const useEditor = create<EditorState>((set) => ({
  tool: "select",
  placeType: "cam-dome",
  cableType: "cat6",
  trayType: "tray",
  cableRun: undefined,
  wallType: "drywall",
  openingKind: "door",
  obstacleKind: "column",
  wallColorBy: "type",
  showStructure: true,
  rackCollapse: true,
  assistantOpen: false,
  sideTab: "details",
  preview: null,
  refs: [],
  pickMode: null,
  selection: null,
  layers: allLayers(),
  showLabels: true,
  showCones: true,
  focus: null,
  fitN: 0,
  setTool: (tool) => set({ tool }),
  setPlaceType: (placeType) => set({ placeType, tool: "place" }),
  setCableType: (cableType) => set({ cableType }),
  setTrayType: (trayType) => set({ trayType }),
  setCableRun: (cableRun) => set({ cableRun }),
  setWallType: (wallType) => set({ wallType }),
  setOpeningKind: (openingKind) => set({ openingKind }),
  setObstacleKind: (obstacleKind) => set({ obstacleKind }),
  setWallColorBy: (wallColorBy) => set({ wallColorBy }),
  setShowStructure: (showStructure) => set({ showStructure }),
  setRackCollapse: (rackCollapse) => set({ rackCollapse }),
  setAssistantOpen: (assistantOpen) => set(assistantOpen ? { assistantOpen, sideTab: "assistant" } : { assistantOpen }),
  setSideTab: (sideTab) => set({ sideTab }),
  setPreview: (preview) => set({ preview }),
  addRef: (r) =>
    set((s) =>
      // the same element twice is a no-op
      r.id && s.refs.some((x) => x.id === r.id) ? s : { refs: [...s.refs, r].slice(0, 9) },
    ),
  removeRef: (i) => set((s) => ({ refs: s.refs.filter((_, j) => j !== i) })),
  clearRefs: () => set({ refs: [] }),
  setPickMode: (pickMode) => set(pickMode ? { pickMode, tool: "select" } : { pickMode }),
  select: (selection) => set(selection ? { selection, sideTab: "details" } : { selection }),
  toggleLayer: (l) => set((s) => ({ layers: { ...s.layers, [l]: !s.layers[l] } })),
  setShowLabels: (showLabels) => set({ showLabels }),
  setShowCones: (showCones) => set({ showCones }),
  focusOn: (id) => set((s) => ({ focus: { id, n: (s.focus?.n ?? 0) + 1 }, selection: { kind: "device", id }, sideTab: "details" })),
  fit: () => set((s) => ({ fitN: s.fitN + 1 })),
  reset: () =>
    set({ tool: "select", selection: null, layers: allLayers(), focus: null, assistantOpen: false, refs: [], pickMode: null }),
}));
