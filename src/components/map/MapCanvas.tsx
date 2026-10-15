"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { StickyNote } from "lucide-react";
import { useApp } from "@/lib/store";
import { useImageSrc } from "@/lib/images";
import { deviceTypeById, layerById, linkTypeById } from "@/lib/catalog";
import { linkLengthM, traceDevice } from "@/lib/graph";
import { AREA_COLORS } from "@/lib/catalog";
import { DEFAULT_PPM, obstacleKindById, openingKindById, wallTypeById } from "@/lib/space-catalog";
import { projectOnWall, snapWallPoint, vectorBounds, wallLength } from "@/lib/space";
import type { Area, Device, Floor, LinkEnd, Obstacle, Opening, Point, Wall } from "@/lib/types";
import { useEditor, type Selection, type SpacePreview } from "./editor-store";
import { askConfirm, askText } from "../dialogs";
import { StructureLayer, wallWidth } from "./StructureLayer";
import { refAnchor, refFromSelection } from "./refs";
import { mountInRack, mountProblem } from "@/lib/rack-mount";
import { rackKindForDevice, usedUnits } from "@/lib/rack-catalog";
import { toast } from "@/lib/toast";
import { isPhone, useCoarsePointer, useIsPhone } from "@/lib/use-media";
import { fmtM } from "@/lib/products/suggest";

type View = { x: number; y: number; k: number };

type Drag =
  | { type: "pan"; sx: number; sy: number; v: View; moved: boolean; pick?: Selection }
  | { type: "device"; id: string; ox: number; oy: number; sx: number; sy: number; x: number; y: number; moved: boolean; overRack?: string }
  | { type: "note"; id: string; ox: number; oy: number; sx: number; sy: number; x: number; y: number; moved: boolean }
  | { type: "vertex"; linkId: string; index: number; insert: boolean; x: number; y: number }
  | { type: "areaVertex"; areaId: string; index: number; x: number; y: number }
  | { type: "cam"; id: string; dir: number; range: number }
  | { type: "camFov"; id: string; fov: number }
  | { type: "wallEnd"; wallId: string; end: "a" | "b"; orig: Point; x: number; y: number }
  | { type: "obstacle"; id: string; ox: number; oy: number; sx: number; sy: number; x: number; y: number; moved: boolean }
  | { type: "opening"; id: string; offsetM: number; orig: number }
  | { type: "wall"; id: string; a: Point; b: Point; sx: number; sy: number; dx: number; dy: number; moved: boolean }
  | { type: "area"; id: string; sx: number; sy: number; dx: number; dy: number; moved: boolean }
  | { type: "pinch"; d0: number; m0: Point; v: View };

interface Drawing {
  points: Point[];
  a?: LinkEnd;
}

const SNAP_PX = 18;

export function MapCanvas({ floor, canEdit }: { floor: Floor; canEdit: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 0.5 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const pointers = useRef(new Map<number, Point>());
  /** true once the user panned/zoomed; until then resizes simply re-fit the plan */
  const userMoved = useRef(false);
  const [cursor, setCursor] = useState<Point | null>(null);
  /** first corner while marking a region for the assistant */
  const [regionStart, setRegionStart] = useState<Point | null>(null);

  const ed = useEditor();
  const { tool, selection, layers, showLabels, showCones } = ed;
  const phone = useIsPhone();
  /** finger input: bigger hit areas and handles */
  const coarse = useCoarsePointer();
  const hs = coarse ? 1.7 : 1;

  // in-progress drawing / measurement belong to the tool that started them
  const [drawState, setDrawState] = useState<{ tool: string; d: Drawing | null }>({ tool, d: null });
  const drawing = drawState.tool === tool ? drawState.d : null;
  const setDrawing = (u: Drawing | null | ((d: Drawing | null) => Drawing | null)) =>
    setDrawState((s) => ({ tool, d: typeof u === "function" ? u(s.tool === tool ? s.d : null) : u }));
  const [measureState, setMeasureState] = useState<{ tool: string; m: Point[] }>({ tool, m: [] });
  const measure = measureState.tool === tool ? measureState.m : [];
  const setMeasure = (u: Point[] | ((m: Point[]) => Point[])) =>
    setMeasureState((s) => ({ tool, m: typeof u === "function" ? u(s.tool === tool ? s.m : []) : u }));

  const allDevices = useApp((s) => s.devices);
  const allLinks = useApp((s) => s.links);
  const allAreas = useApp((s) => s.areas);
  const allNotes = useApp((s) => s.notes);
  const addDevice = useApp((s) => s.addDevice);
  const moveDevice = useApp((s) => s.moveDevice);
  const updateDevice = useApp((s) => s.updateDevice);
  const addLink = useApp((s) => s.addLink);
  const updateLink = useApp((s) => s.updateLink);
  const addArea = useApp((s) => s.addArea);
  const updateArea = useApp((s) => s.updateArea);
  const addNote = useApp((s) => s.addNote);
  const updateNote = useApp((s) => s.updateNote);
  const updateFloor = useApp((s) => s.updateFloor);
  const allWalls = useApp((s) => s.walls);
  const allOpenings = useApp((s) => s.openings);
  const allObstacles = useApp((s) => s.obstacles);
  const addWall = useApp((s) => s.addWall);
  const updateWall = useApp((s) => s.updateWall);
  const addOpening = useApp((s) => s.addOpening);
  const updateOpening = useApp((s) => s.updateOpening);
  const addObstacle = useApp((s) => s.addObstacle);
  const updateObstacle = useApp((s) => s.updateObstacle);

  const planSrc = useImageSrc(floor.plan?.src);
  // floors drawn without a plan image use a fixed default scale
  const ppm = floor.pxPerMeter ?? (floor.plan ? undefined : DEFAULT_PPM);
  /** scale used for structure geometry even on an uncalibrated image */
  const sppm = ppm ?? DEFAULT_PPM;

  const siteDevices = useMemo(() => allDevices.filter((d) => d.siteId === floor.siteId), [allDevices, floor.siteId]);
  const siteLinks = useMemo(() => allLinks.filter((l) => l.siteId === floor.siteId), [allLinks, floor.siteId]);
  const devices = siteDevices.filter((d) => d.floorId === floor.id);
  const links = siteLinks.filter((l) => l.floorId === floor.id);
  const areas = allAreas.filter((a) => a.floorId === floor.id);
  const notes = allNotes.filter((n) => n.floorId === floor.id);
  const walls = allWalls.filter((w) => w.floorId === floor.id);
  const openings = allOpenings.filter((o) => o.floorId === floor.id);
  const obstacles = allObstacles.filter((o) => o.floorId === floor.id);

  const vb = floor.plan ? null : vectorBounds(walls, areas, obstacles, devices, sppm);
  const W = floor.plan?.width ?? vb!.W;
  const H = floor.plan?.height ?? vb!.H;

  const selectedDevice = selection?.kind === "device" ? siteDevices.find((d) => d.id === selection.id) : undefined;
  /** the camera being aimed for a model suggestion (a tap on the map aims it) */
  const aimDev = canEdit && ed.aim && tool === "select" && !ed.pickMode ? devices.find((d) => d.id === ed.aim && d.camera) : undefined;
  const trace = useMemo(
    () => (selectedDevice ? traceDevice(selectedDevice, siteDevices, siteLinks) : null),
    [selectedDevice, siteDevices, siteLinks],
  );

  // ---- sizing & fit ----
  const fit = () => {
    const el = wrapRef.current;
    const w = el?.clientWidth ?? 0;
    const h = el?.clientHeight ?? 0;
    if (!w || !h) return;
    // desktop: room for the compass labels, the tool bar (right) and the top buttons.
    // Phones: nothing floats over the map (the strip, sheet and tool bar are rows of their own).
    const m = isPhone() ? { l: 20, r: 20, t: 20, b: 20 } : { l: 44, r: 84, t: 92, b: 36 };
    const aw = Math.max(80, w - m.l - m.r);
    const ah = Math.max(80, h - m.t - m.b);
    const k = Math.min(aw / W, ah / H);
    setView({ k, x: m.l + (aw - W * k) / 2, y: m.t + (ah - H * k) / 2 });
    userMoved.current = false;
  };
  const fitRef = useRef(fit);
  useEffect(() => {
    fitRef.current = fit;
  });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let prevW = 0;
    let prevH = 0;
    const ro = new ResizeObserver(([e]) => {
      const { width: w, height: h } = e.contentRect;
      if (w !== prevW) {
        if (!userMoved.current) fitRef.current();
        // RTL layout: the side panel opens on the left, so the canvas' left edge moves.
        // Shift the view by the width change to keep the map visually in place.
        else if (prevW) setView((v) => ({ ...v, x: v.x + (w - prevW) }));
      } else if (h !== prevH && !userMoved.current) fitRef.current();
      prevW = w;
      prevH = h;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Centers the view on a pending focus request (search / trace click), then clears it. */
  const applyFocus = useCallback(() => {
    const el = wrapRef.current;
    const focus = useEditor.getState().focus;
    if (!el?.clientWidth || !focus) return;
    const d = useApp.getState().devices.find((x) => x.id === focus.id && x.floorId === floor.id);
    if (!d) return;
    const { clientWidth: w, clientHeight: h } = el;
    setView((v) => {
      const k = Math.max(v.k, 0.9);
      return { k, x: w / 2 - d.x * k, y: h / 2 - d.y * k };
    });
    userMoved.current = true;
    useEditor.setState({ focus: null });
  }, [floor.id]);

  // fit when the floor or its plan changes (measured directly, no need to wait for ResizeObserver).
  // Drawn floors grow while you draw; that must not re-fit, so the key ignores their size.
  const fitKey = `${floor.id}:${floor.plan?.src ?? "drawn"}`;
  useLayoutEffect(() => {
    fit();
    applyFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  useEffect(() => {
    if (ed.fitN) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ed.fitN]);

  useEffect(() => {
    if (ed.focus) applyFocus();
  }, [ed.focus, applyFocus]);

  // ---- wheel zoom (non-passive) ----
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      userMoved.current = true;
      setView((v) => {
        const k = clamp(v.k * f, 0.05, 8);
        return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toWorld = (e: { clientX: number; clientY: number }): Point => {
    const p = local(e);
    return { x: (p.x - view.x) / view.k, y: (p.y - view.y) / view.k };
  };
  const s = 1 / view.k; // world units per screen pixel
  // markers shrink a bit when zoomed far out; names appear once there is room
  const ms = Math.min(1, Math.max(0.6, view.k * 1.8));
  const labelsVisible = showLabels && view.k >= 0.3;

  const nearestDevice = (p: Point) => {
    let best: Device | undefined;
    let bd = SNAP_PX * s;
    for (const d of devices) {
      // equipment hidden inside a collapsed rack is reached through the rack
      if (!layers[deviceTypeById(d.type).layer] || mountedIn.has(d.id)) continue;
      const q = devPos(d);
      const dist = Math.hypot(q.x - p.x, q.y - p.y);
      if (dist < bd) {
        bd = dist;
        best = d;
      }
    }
    return best;
  };

  // ---- drawing helpers ----
  const finishLine = (end?: Device) => {
    if (!drawing) return;
    const pts = end ? [...drawing.points, { x: end.x, y: end.y }] : drawing.points;
    if (pts.length < 2) {
      setDrawing(null);
      return;
    }
    if (tool === "cable") {
      const t = linkTypeById(ed.cableType);
      const id = addLink({
        siteId: floor.siteId,
        floorId: floor.id,
        kind: "cable",
        layer: t.layer,
        cableType: t.id,
        points: pts,
        a: drawing.a,
        b: end ? { deviceId: end.id } : undefined,
        run: ed.cableRun,
      });
      ed.select({ kind: "link", id });
    } else if (tool === "tray") {
      const id = addLink({
        siteId: floor.siteId,
        floorId: floor.id,
        kind: "tray",
        layer: "infra",
        cableType: ed.trayType,
        points: pts,
      });
      ed.select({ kind: "link", id });
    } else if (tool === "area" && pts.length >= 3) {
      const id = addArea({ siteId: floor.siteId, floorId: floor.id, name: "אזור חדש", color: "#60a5fa", points: pts });
      ed.select({ kind: "area", id });
    }
    setDrawing(null);
  };

  /** a drawn floor without a scale gets the default one as soon as structure is added */
  const ensureScale = () => {
    if (!floor.pxPerMeter && !floor.plan) updateFloor(floor.id, { pxPerMeter: DEFAULT_PPM });
  };
  const wallEndpoints = (exclude?: Point) =>
    walls.flatMap((w) => [w.a, w.b]).filter((q) => !exclude || Math.hypot(q.x - exclude.x, q.y - exclude.y) > 0.5);
  /** true if an existing wall already covers the segment a→b */
  const covered = (a: Point, b: Point) =>
    walls.some((w) => projectOnWall(a, w).dist < 2 && projectOnWall(b, w).dist < 2);

  /**
   * Nearest drawn cable under p: its route from the source end up to p (snapped to a corner when
   * close). If p falls mid-segment, that corner is added to the existing cable too, so the shared
   * part has identical corners and is counted as one bundle.
   */
  const branchFrom = (p: Point): { points: Point[]; a?: LinkEnd } | null => {
    let best: { l: (typeof links)[number]; pts: Point[]; i: number; q: Point; d: number } | null = null;
    for (const l of links) {
      if (l.kind !== "cable" || !layers[l.layer]) continue;
      const pts = linkPoints(l);
      for (let i = 0; i < pts.length - 1; i++) {
        const pr = projectOnWall(p, { a: pts[i], b: pts[i + 1] });
        if (pr.dist < SNAP_PX * s && (!best || pr.dist < best.d)) best = { l, pts, i, q: pr.point, d: pr.dist };
      }
    }
    if (!best) return null;
    const { l, pts, i } = best;
    const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < SNAP_PX * s;
    if (near(best.q, pts[i])) return { points: pts.slice(0, i + 1), a: l.a };
    if (near(best.q, pts[i + 1])) return { points: pts.slice(0, i + 2), a: l.a };
    const q = { x: round(best.q.x), y: round(best.q.y) };
    const withCorner = [...l.points];
    withCorner.splice(i + 1, 0, q);
    updateLink(l.id, { points: withCorner });
    return { points: [...pts.slice(0, i + 1), q], a: l.a };
  };

  const toolClick = (p: Point, onDevice?: Device, free = false) => {
    if (!canEdit && tool !== "measure") return;
    const base = { siteId: floor.siteId, floorId: floor.id };
    switch (tool) {
      case "wall": {
        const prev = drawing?.points[drawing.points.length - 1];
        const q = snapWallPoint(p, prev, wallEndpoints(), SNAP_PX * s, free, sppm / 10);
        if (!prev) {
          setDrawing({ points: [q] });
          return;
        }
        // clicking the last point again ends the chain
        if (Math.hypot(q.x - prev.x, q.y - prev.y) < 4 * s) {
          setDrawing(null);
          return;
        }
        ensureScale();
        addWall({ ...base, a: prev, b: q, type: ed.wallType, thicknessCm: wallTypeById(ed.wallType).thickness });
        setDrawing({ points: [...drawing!.points, q] });
        return;
      }
      case "room": {
        const q = snapWallPoint(p, undefined, wallEndpoints(), SNAP_PX * s, true, sppm / 10);
        if (!drawing) {
          setDrawing({ points: [q] });
          return;
        }
        const a = drawing.points[0];
        if (Math.abs(q.x - a.x) < 10 * s || Math.abs(q.y - a.y) < 10 * s) return;
        const x1 = Math.min(a.x, q.x);
        const x2 = Math.max(a.x, q.x);
        const y1 = Math.min(a.y, q.y);
        const y2 = Math.max(a.y, q.y);
        const corners = [
          { x: x1, y: y1 },
          { x: x2, y: y1 },
          { x: x2, y: y2 },
          { x: x1, y: y2 },
        ];
        ensureScale();
        const th = wallTypeById(ed.wallType).thickness;
        corners.forEach((c, i) => {
          const d = corners[(i + 1) % 4];
          if (!covered(c, d)) addWall({ ...base, a: c, b: d, type: ed.wallType, thicknessCm: th });
        });
        const n = areas.length + 1;
        const id = addArea({ ...base, name: `חדר ${n}`, color: AREA_COLORS[n % AREA_COLORS.length], points: corners });
        ed.select({ kind: "area", id });
        setDrawing(null);
        return;
      }
      case "opening": {
        let best: { w: Wall; t: number; dist: number } | undefined;
        for (const w of walls) {
          const pr = projectOnWall(p, w);
          if (!best || pr.dist < best.dist) best = { w, t: pr.t, dist: pr.dist };
        }
        if (!best || best.dist > 24 * s) return;
        const len = wallLength(best.w) / sppm;
        const widthM = Math.min(openingKindById(ed.openingKind).width, len);
        const offsetM = Math.round(Math.max(widthM / 2, Math.min(len - widthM / 2, best.t * len)) * 100) / 100;
        const id = addOpening({ ...base, wallId: best.w.id, kind: ed.openingKind, offsetM, widthM });
        ed.select({ kind: "opening", id });
        return;
      }
      case "obstacle": {
        const k = obstacleKindById(ed.obstacleKind);
        ensureScale();
        const id = addObstacle({ ...base, kind: k.id, x: p.x, y: p.y, w: k.size[0] * sppm, h: k.size[1] * sppm });
        ed.select({ kind: "obstacle", id });
        return;
      }
      case "place": {
        if (!canEdit) return;
        const id = addDevice({ siteId: floor.siteId, floorId: floor.id, type: ed.placeType, x: p.x, y: p.y });
        ed.select({ kind: "device", id });
        return;
      }
      case "cable": {
        const dev = onDevice ?? nearestDevice(p);
        if (!drawing) {
          if (dev) {
            setDrawing({ points: [{ x: devPos(dev).x, y: devPos(dev).y }], a: { deviceId: dev.id } });
            return;
          }
          // starting on an existing cable: share its route from its source up to here, then go on
          const br = branchFrom(p);
          if (br) {
            setDrawing({ points: br.points, a: br.a });
            toast("ממשיך מהכבל הקיים: לחצו על נקודות בדרך ואז על הציוד ביעד");
            return;
          }
          setDrawing({ points: [p] });
        } else if (dev && !(drawing.a?.deviceId === dev.id && drawing.points.length === 1)) {
          finishLine(dev);
        } else {
          setDrawing({ ...drawing, points: [...drawing.points, p] });
        }
        return;
      }
      case "tray":
        setDrawing((d) => ({ points: [...(d?.points ?? []), p] }));
        return;
      case "area": {
        if (drawing && drawing.points.length >= 3) {
          const f = drawing.points[0];
          if (Math.hypot(f.x - p.x, f.y - p.y) < SNAP_PX * s) {
            finishLine();
            return;
          }
        }
        setDrawing((d) => ({ points: [...(d?.points ?? []), p] }));
        return;
      }
      case "note": {
        void askText({ title: "הערה חדשה", label: "טקסט ההערה" }).then((text) => {
          if (!text?.trim()) return;
          const id = addNote({ siteId: floor.siteId, floorId: floor.id, x: p.x, y: p.y, text: text.trim() });
          ed.select({ kind: "note", id });
        });
        return;
      }
      case "measure":
        setMeasure((m) => (m.length >= 2 ? [p] : [...m, p]));
        return;
      case "calibrate": {
        const m = measure.length >= 2 ? [p] : [...measure, p];
        setMeasure(m);
        if (m.length === 2) {
          const px = Math.hypot(m[1].x - m[0].x, m[1].y - m[0].y);
          void askText({ title: "כיול קנה מידה", label: "מה המרחק האמיתי בין שתי הנקודות, במטרים?", value: "5", inputMode: "decimal" }).then((ans) => {
            const meters = Number(ans?.replace(",", "."));
            if (meters > 0 && px > 0) {
              updateFloor(floor.id, { pxPerMeter: px / meters });
              ed.setTool("select");
            }
            setMeasure([]);
          });
        }
        return;
      }
    }
  };

  // ---- pointer handling ----
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dragRef = useRef<Drag | null>(null);
  useEffect(() => {
    dragRef.current = drag;
  });
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  /**
   * Touch: a finger that lands on an item that isn't selected pans the map, and a tap selects the
   * item. Holding the finger still for a moment picks the item up so it can be moved. A selected
   * item moves right away. Returns true when it handled the press.
   */
  const touchGate = (e: React.PointerEvent, pick: NonNullable<Selection>, pickUp: () => void) => {
    if (e.pointerType !== "touch") return false;
    if (selection?.kind === pick.kind && selection.id === pick.id) return false;
    onBackgroundDown(e, pick);
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      const cur = dragRef.current;
      if (cur?.type !== "pan" || cur.moved || pointers.current.size !== 1) return;
      navigator.vibrate?.(12);
      pickUp();
    }, 380);
    return true;
  };

  const capture = (e: React.PointerEvent) => {
    // a primary press (mouse, or the first finger) starts a fresh gesture: drop pointers whose
    // release was never delivered, or every later click would be mistaken for a pinch
    if (e.isPrimary) pointers.current.clear();
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // pointer already released (e.g. a very quick tap) — the gesture still works without capture
    }
    pointers.current.set(e.pointerId, local(e));
  };

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    setDrag({ type: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y), m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v: view });
  };

  const onBackgroundDown = (e: React.PointerEvent, pick?: Selection) => {
    capture(e);
    if (pointers.current.size === 2) return startPinch();
    if (e.button === 1 || tool === "select" || e.button === 2) {
      const p = local(e);
      setDrag({ type: "pan", sx: p.x, sy: p.y, v: view, moved: false, pick });
      return;
    }
    // drawing tools: allow panning by dragging, act on click (pointer up without movement)
    const p = local(e);
    setDrag({ type: "pan", sx: p.x, sy: p.y, v: view, moved: false, pick: { kind: "device", id: "__tool__" } });
  };

  const onDeviceDown = (e: React.PointerEvent, d: Device) => {
    e.stopPropagation();
    if (ed.pickMode) return onBackgroundDown(e, { kind: "device", id: d.id });
    capture(e);
    if (pointers.current.size === 2) return startPinch();
    if (tool === "select") {
      if (canEdit) {
        // selected on release: opening the side panel mid-drag would shift the map under the pointer
        const w = toWorld(e);
        const start = () => setDrag({ type: "device", id: d.id, ox: d.x, oy: d.y, sx: w.x, sy: w.y, x: d.x, y: d.y, moved: false });
        if (!touchGate(e, { kind: "device", id: d.id }, start)) start();
      } else ed.select({ kind: "device", id: d.id });
      return;
    }
    if (tool === "cable" || tool === "tray") {
      toolClick({ x: d.x, y: d.y }, tool === "cable" ? d : undefined);
      return;
    }
    if (tool === "place" && d.type === "rack" && canEdit && rackKindForDevice(ed.placeType)) {
      // clicking a rack with rack-mountable equipment mounts it straight into the cabinet
      const problem = mountProblem(ed.placeType, d);
      if (problem) return toast(problem, "error");
      const id = addDevice({ siteId: floor.siteId, floorId: floor.id, type: ed.placeType, x: d.x, y: d.y });
      const r = mountInRack(id, d.id);
      if (r.ok) {
        toast(`"${useApp.getState().devices.find((x) => x.id === id)?.label}" הוכנס לארון "${d.label}" בחריץ U${r.u}`);
        ed.select({ kind: "device", id: d.id });
      }
      return;
    }
    toolClick(toWorld(e));
  };

  const startCamDrag = (e: React.PointerEvent, id: string, dir: number, range: number) => {
    e.stopPropagation();
    capture(e);
    setDrag({ type: "cam", id, dir, range });
  };

  const startFovDrag = (e: React.PointerEvent, id: string, fov: number) => {
    e.stopPropagation();
    capture(e);
    setDrag({ type: "camFov", id, fov });
  };

  /** aiming: the camera looks at the tapped point, and sees as far as it */
  const aimAt = (p: Point) => {
    const d = aimDev;
    if (!d?.camera) return;
    const range = Math.hypot(p.x - d.x, p.y - d.y) / (ppm ?? 40);
    if (range < 0.5) return;
    const dir = ((Math.atan2(p.y - d.y, p.x - d.x) * 180) / Math.PI + 360) % 360;
    updateDevice(d.id, { camera: { ...d.camera, dir: Math.round(dir), range: Math.round(range * 2) / 2 } });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, local(e));
    const w = toWorld(e);
    if (tool !== "select" || ed.pickMode === "region") setCursor(w);
    if (!drag) return;
    switch (drag.type) {
      case "pinch": {
        const pts = [...pointers.current.values()];
        if (pts.length < 2) return;
        const [a, b] = pts;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        userMoved.current = true;
        const k = clamp((drag.v.k * d) / drag.d0, 0.05, 8);
        const wx = (drag.m0.x - drag.v.x) / drag.v.k;
        const wy = (drag.m0.y - drag.v.y) / drag.v.k;
        setView({ k, x: m.x - wx * k, y: m.y - wy * k });
        return;
      }
      case "pan": {
        const p = local(e);
        const dx = p.x - drag.sx;
        const dy = p.y - drag.sy;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return;
        userMoved.current = true;
        setView({ ...drag.v, x: drag.v.x + dx, y: drag.v.y + dy });
        if (!drag.moved) setDrag({ ...drag, moved: true });
        return;
      }
      case "device":
      case "note": {
        const x = drag.ox + (w.x - drag.sx);
        const y = drag.oy + (w.y - drag.sy);
        const moved = drag.moved || Math.hypot(x - drag.ox, y - drag.oy) > 3 * s;
        if (drag.type === "device") {
          const dev = devices.find((d) => d.id === drag.id);
          const over =
            dev && rackKindForDevice(dev.type)
              ? visibleDevices.find((r) => r.type === "rack" && r.id !== dev.id && Math.hypot(r.x - x, r.y - y) < 26 * s)
              : undefined;
          setDrag({ ...drag, x, y, moved, overRack: over?.id });
        } else setDrag({ ...drag, x, y, moved });
        return;
      }
      case "vertex":
      case "areaVertex":
        setDrag({ ...drag, x: w.x, y: w.y });
        return;
      case "wallEnd": {
        const wall = walls.find((x) => x.id === drag.wallId);
        if (!wall) return;
        const other = drag.end === "a" ? wall.b : wall.a;
        const q = snapWallPoint(w, other, wallEndpoints(drag.orig), SNAP_PX * s, e.shiftKey, sppm / 10);
        setDrag({ ...drag, x: q.x, y: q.y });
        return;
      }
      case "obstacle": {
        const x = drag.ox + (w.x - drag.sx);
        const y = drag.oy + (w.y - drag.sy);
        setDrag({ ...drag, x, y, moved: drag.moved || Math.hypot(x - drag.ox, y - drag.oy) > 3 * s });
        return;
      }
      case "wall":
      case "area": {
        // moves snap to a 10 cm grid; nothing happens until the pointer really moves
        const g = sppm / 10;
        const dx = Math.round((w.x - drag.sx) / g) * g;
        const dy = Math.round((w.y - drag.sy) / g) * g;
        const moved = drag.moved || Math.hypot(w.x - drag.sx, w.y - drag.sy) > 4 * s;
        if (moved) userMoved.current = true;
        setDrag({ ...drag, dx: moved ? dx : 0, dy: moved ? dy : 0, moved });
        return;
      }
      case "opening": {
        const o = openings.find((x) => x.id === drag.id);
        const wall = o && walls.find((x) => x.id === o.wallId);
        if (!o || !wall) return;
        const len = wallLength(wall) / sppm;
        const t = projectOnWall(w, wall).t;
        const offsetM = Math.max(o.widthM / 2, Math.min(len - o.widthM / 2, t * len));
        setDrag({ ...drag, offsetM: Math.round(offsetM * 100) / 100 });
        return;
      }
      case "cam": {
        const d = devices.find((x) => x.id === drag.id);
        if (!d) return;
        const dir = (Math.atan2(w.y - d.y, w.x - d.x) * 180) / Math.PI;
        const range = Math.max(1, Math.hypot(w.x - d.x, w.y - d.y) / (ppm ?? 40));
        setDrag({ ...drag, dir: (dir + 360) % 360, range: Math.round(range * 2) / 2 });
        return;
      }
      case "camFov": {
        // the edge follows the pointer: twice its angle from the camera's direction
        const d = devices.find((x) => x.id === drag.id);
        if (!d?.camera) return;
        const a = (Math.atan2(w.y - d.y, w.x - d.x) * 180) / Math.PI;
        const off = Math.abs(((((a - d.camera.dir) % 360) + 540) % 360) - 180);
        setDrag({ ...drag, fov: clamp(Math.round(off * 2), 5, 360) });
        return;
      }
    }
  };

  const zoomAt = (p: Point, factor: number) => {
    userMoved.current = true;
    setView((v) => {
      const k = clamp(v.k * factor, 0.05, 8);
      return { k, x: p.x - ((p.x - v.x) / v.k) * k, y: p.y - ((p.y - v.y) / v.k) * k };
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    clearTimeout(holdTimer.current);
    const cluster = pendingCluster.current;
    pendingCluster.current = null;
    if (cluster && drag?.type === "pan" && !drag.moved) {
      setDrag(null);
      return openCluster(cluster);
    }
    if (!drag) return;
    // a double tap on an empty spot zooms in there
    if (drag.type === "pan" && !drag.moved && !drag.pick && !ed.pickMode && !aimDev && e.pointerType === "touch") {
      const p = local(e);
      const last = lastTap.current;
      if (last && e.timeStamp - last.t < 320 && Math.hypot(p.x - last.x, p.y - last.y) < 30) {
        lastTap.current = null;
        zoomAt(p, 2);
      } else lastTap.current = { t: e.timeStamp, x: p.x, y: p.y };
    }
    if (drag.type === "pinch") {
      if (pointers.current.size < 2) setDrag(null);
      return;
    }
    switch (drag.type) {
      case "pan":
        if (!drag.moved) {
          if (aimDev) aimAt(toWorld(e));
          else if (ed.pickMode === "region") {
            const p = toWorld(e);
            if (!regionStart) setRegionStart(p);
            else {
              const rect = { x1: Math.min(regionStart.x, p.x), y1: Math.min(regionStart.y, p.y), x2: Math.max(regionStart.x, p.x), y2: Math.max(regionStart.y, p.y) };
              const wM = (rect.x2 - rect.x1) / sppm;
              const hM = (rect.y2 - rect.y1) / sppm;
              ed.addRef({ kind: "region", label: `אזור ${wM.toFixed(1)}×${hM.toFixed(1)} מ׳`, rect });
              setRegionStart(null);
            }
          } else if (ed.pickMode === "object") {
            const ref = drag.pick && drag.pick.id !== "__tool__" ? refFromSelection(drag.pick, floor.id, sppm, { W, H }) : null;
            if (ref) ed.addRef(ref);
          } else if (drag.pick?.id === "__tool__") toolClick(toWorld(e), undefined, e.shiftKey);
          else ed.select(drag.pick ?? null);
        }
        break;
      case "device":
        if (drag.moved && drag.overRack) {
          const r = mountInRack(drag.id, drag.overRack);
          const rack = devices.find((d) => d.id === drag.overRack);
          const dev = devices.find((d) => d.id === drag.id);
          if (r.ok) {
            toast(`"${dev?.label}" הוכנס לארון "${rack?.label}" בחריץ U${r.u}`);
            ed.select({ kind: "device", id: drag.overRack });
          } else toast(r.reason, "error"); // stays where it was
          break;
        }
        if (drag.moved) moveDevice(drag.id, round(drag.x), round(drag.y));
        ed.select({ kind: "device", id: drag.id });
        break;
      case "note":
        if (drag.moved) updateNote(drag.id, { x: round(drag.x), y: round(drag.y) });
        else ed.select({ kind: "note", id: drag.id });
        break;
      case "vertex": {
        const l = links.find((x) => x.id === drag.linkId);
        if (l) {
          const pts = [...l.points];
          const p = { x: round(drag.x), y: round(drag.y) };
          if (drag.insert) pts.splice(drag.index, 0, p);
          else pts[drag.index] = p;
          updateLink(l.id, { points: pts });
        }
        break;
      }
      case "areaVertex": {
        const a = areas.find((x) => x.id === drag.areaId);
        if (a) {
          const pts = [...a.points];
          pts[drag.index] = { x: round(drag.x), y: round(drag.y) };
          updateArea(a.id, { points: pts });
        }
        break;
      }
      case "cam": {
        const d = devices.find((x) => x.id === drag.id);
        if (d?.camera) updateDevice(d.id, { camera: { ...d.camera, dir: Math.round(drag.dir), range: drag.range } });
        break;
      }
      case "camFov": {
        const d = devices.find((x) => x.id === drag.id);
        if (d?.camera) updateDevice(d.id, { camera: { ...d.camera, fov: drag.fov } });
        break;
      }
      case "wallEnd": {
        // move every wall end and room corner that shared this point, so connected walls stay joined
        const np = { x: round(drag.x), y: round(drag.y) };
        const same = (q: Point) => Math.hypot(q.x - drag.orig.x, q.y - drag.orig.y) < 0.5;
        for (const w of walls) {
          if (same(w.a) || same(w.b)) updateWall(w.id, { a: same(w.a) ? np : w.a, b: same(w.b) ? np : w.b });
        }
        for (const a of areas) {
          if (a.points.some(same)) updateArea(a.id, { points: a.points.map((q) => (same(q) ? np : q)) });
        }
        break;
      }
      case "obstacle":
        if (drag.moved) updateObstacle(drag.id, { x: round(drag.x), y: round(drag.y) });
        ed.select({ kind: "obstacle", id: drag.id });
        break;
      case "opening":
        if (drag.offsetM !== drag.orig) updateOpening(drag.id, { offsetM: drag.offsetM });
        ed.select({ kind: "opening", id: drag.id });
        break;
      case "wall": {
        ed.select({ kind: "wall", id: drag.id });
        if (!drag.moved || (!drag.dx && !drag.dy)) break;
        // the wall and every wall end / room corner joined to it move together (one undo step)
        const shift = (q: Point) => ({ x: round(q.x + drag.dx), y: round(q.y + drag.dy) });
        const joined = (q: Point) => Math.hypot(q.x - drag.a.x, q.y - drag.a.y) < 0.5 || Math.hypot(q.x - drag.b.x, q.y - drag.b.y) < 0.5;
        for (const w of walls) {
          if (w.id === drag.id) updateWall(w.id, { a: shift(w.a), b: shift(w.b) });
          else if (joined(w.a) || joined(w.b)) updateWall(w.id, { a: joined(w.a) ? shift(w.a) : w.a, b: joined(w.b) ? shift(w.b) : w.b });
        }
        for (const a of areas) if (a.points.some(joined)) updateArea(a.id, { points: a.points.map((q) => (joined(q) ? shift(q) : q)) });
        break;
      }
      case "area": {
        const a = areas.find((x) => x.id === drag.id);
        if (a && drag.moved && (drag.dx || drag.dy)) updateArea(a.id, { points: a.points.map((q) => ({ x: round(q.x + drag.dx), y: round(q.y + drag.dy) })) });
        break;
      }
    }
    setDrag(null);
  };

  const deleteSelection = () => {
    if (!selection) return;
    const st = useApp.getState();
    const done = () => ed.select(null);
    switch (selection.kind) {
      case "wall":
        st.deleteWall(selection.id);
        return done();
      case "opening":
        st.deleteOpening(selection.id);
        return done();
      case "obstacle":
        st.deleteObstacle(selection.id);
        return done();
      case "link":
        st.deleteLink(selection.id);
        return done();
      case "note":
        st.deleteNote(selection.id);
        return done();
      case "area":
        st.deleteArea(selection.id);
        return done();
      case "device": {
        const d = st.devices.find((x) => x.id === selection.id);
        if (!d) return;
        void askConfirm({ title: "מחיקת ציוד", message: `למחוק את "${d.label}"?`, danger: true, okLabel: "מחק" }).then(
          (ok) => ok && (st.deleteDevice(d.id), done()),
        );
        return;
      }
    }
  };

  // ---- phone tool bar: it shows "סיום / ביטול" for the line being drawn and sends the taps here ----
  useEffect(() => {
    useEditor.setState({ drawingN: drawing?.points.length ?? 0, regionStarted: !!regionStart });
  }, [drawing, regionStart]);
  useEffect(() => () => useEditor.setState({ drawingN: 0, regionStarted: false }), []);
  const requestsRef = useRef({ finish: () => finishLine(), cancel: () => setDrawing(null), clearRegion: () => setRegionStart(null) });
  useEffect(() => {
    requestsRef.current = { finish: () => finishLine(), cancel: () => setDrawing(null), clearRegion: () => setRegionStart(null) };
  });
  useEffect(() => {
    if (ed.finishReq) requestsRef.current.finish();
  }, [ed.finishReq]);
  useEffect(() => {
    if (ed.cancelReq) requestsRef.current.cancel();
  }, [ed.cancelReq]);
  useEffect(() => {
    if (!ed.pickMode) requestsRef.current.clearRegion();
  }, [ed.pickMode]);

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape") {
        if (ed.pickMode) {
          ed.setPickMode(null);
          setRegionStart(null);
          return;
        }
        if (drawing) setDrawing(null);
        else if (tool !== "select") ed.setTool("select");
        else ed.select(null);
        setMeasure([]);
      } else if (e.key === "Enter" && drawing) {
        finishLine();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selection && canEdit) {
        e.preventDefault();
        deleteSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- derived positions during drag ----
  const ownPos = (d: Device): Point =>
    drag?.type === "device" && drag.id === d.id ? { x: drag.x, y: drag.y } : { x: d.x, y: d.y };
  const devPos = (d: Device): Point => {
    const rack = mountedIn.get(d.id);
    return rack ? ownPos(rack) : ownPos(d);
  };
  /** a camera's view, following its handles while they're dragged */
  const liveCam = (d: Device) => {
    const cam = d.camera!;
    if (drag?.type === "cam" && drag.id === d.id) return { ...cam, dir: drag.dir, range: drag.range };
    if (drag?.type === "camFov" && drag.id === d.id) return { ...cam, fov: drag.fov };
    return cam;
  };
  const devById = new Map(devices.map((d) => [d.id, d]));
  const movePt = (q: Point) => {
    if (drag?.type === "wallEnd" && Math.hypot(q.x - drag.orig.x, q.y - drag.orig.y) < 0.5) return { x: drag.x, y: drag.y };
    if (
      drag?.type === "wall" &&
      (Math.hypot(q.x - drag.a.x, q.y - drag.a.y) < 0.5 || Math.hypot(q.x - drag.b.x, q.y - drag.b.y) < 0.5)
    )
      return { x: q.x + drag.dx, y: q.y + drag.dy };
    return q;
  };
  const wallPos = (w: Wall) => ({ a: movePt(w.a), b: movePt(w.b) });
  const obstaclePos = (o: Obstacle): Point => (drag?.type === "obstacle" && drag.id === o.id ? drag : o);
  const openingOffset = (o: Opening) => (drag?.type === "opening" && drag.id === o.id ? drag.offsetM : o.offsetM);
  const editingStructure = canEdit && tool === "select";
  const livePreview = ed.preview?.floorId === floor.id ? ed.preview : null;
  const linkPoints = (l: (typeof links)[number]): Point[] => {
    const pts = [...l.points];
    if (drag?.type === "vertex" && drag.linkId === l.id) {
      if (drag.insert) pts.splice(drag.index, 0, { x: drag.x, y: drag.y });
      else pts[drag.index] = { x: drag.x, y: drag.y };
    }
    if (pts.length >= 2) {
      const a = l.a && devById.get(l.a.deviceId);
      const b = l.b && devById.get(l.b.deviceId);
      if (a) pts[0] = devPos(a);
      if (b) pts[pts.length - 1] = devPos(b);
    }
    return pts;
  };

  /** Where a selected element is on the map. */
  const selectionAnchor = (sel: NonNullable<Selection>): Point | null => {
    if (sel.kind === "device") {
      const d = siteDevices.find((x) => x.id === sel.id && x.floorId === floor.id);
      return d ? devPos(d) : null;
    }
    if (sel.kind === "note") {
      const n = notes.find((x) => x.id === sel.id);
      return n ? { x: n.x, y: n.y } : null;
    }
    if (sel.kind === "link") {
      const l = links.find((x) => x.id === sel.id);
      if (!l) return null;
      const pts = linkPoints(l);
      return pts[Math.floor(pts.length / 2)] ?? null;
    }
    if (!useApp.getState()[sel.kind === "wall" ? "walls" : sel.kind === "area" ? "areas" : sel.kind === "opening" ? "openings" : "obstacles"].some((x) => x.id === sel.id && x.floorId === floor.id)) return null;
    return refAnchor({ kind: sel.kind, id: sel.id, label: "" }, sppm);
  };

  /** Phones: when the sheet opens (or grows) over the selected item, slide the map so the item stays in view. */
  const keepSelectionVisible = () => {
    const el = wrapRef.current;
    const sel = useEditor.getState().selection;
    if (!el || !sel || !isPhone()) return;
    const a = selectionAnchor(sel);
    if (!a) return;
    const w = el.clientWidth;
    const top = 16;
    const bottom = el.clientHeight - 16;
    if (bottom - top < 48) return; // the sheet is at full height: hardly any map to show
    setView((v) => {
      const sx = v.x + a.x * v.k;
      const sy = v.y + a.y * v.k;
      if (sx > 24 && sx < w - 24 && sy > top && sy < bottom) return v;
      userMoved.current = true;
      return { ...v, x: w / 2 - a.x * v.k, y: (top + bottom) / 2 - a.y * v.k };
    });
  };
  const keepVisibleRef = useRef(keepSelectionVisible);
  useEffect(() => {
    keepVisibleRef.current = keepSelectionVisible;
  });
  useEffect(() => {
    keepVisibleRef.current();
  }, [selection?.kind, selection?.id, ed.sheetH, ed.barH]);

  /** Aiming a camera: frame it and its whole view in the map that shows (on phones, above the sheet). */
  const showAim = () => {
    const el = wrapRef.current;
    const id = useEditor.getState().aim;
    const d = id ? devices.find((x) => x.id === id) : undefined;
    if (!el || !d?.camera) return;
    const { dir, fov, range } = d.camera;
    const r = range * (ppm ?? 40);
    const pts: Point[] = [{ x: d.x, y: d.y }];
    for (let i = 0; i <= 8; i++) {
      const a = ((dir - fov / 2 + (fov * i) / 8) * Math.PI) / 180;
      pts.push({ x: d.x + Math.cos(a) * r, y: d.y + Math.sin(a) * r });
    }
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    const [x1, x2, y1, y2] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    // room for the tool bar and the top buttons on computers, and for the label at the tip
    const m = isPhone() ? { l: 56, r: 56, t: 56, b: 56 } : { l: 72, r: 112, t: 120, b: 64 };
    const aw = el.clientWidth - m.l - m.r;
    const ah = el.clientHeight - m.t - m.b;
    if (aw < 80 || ah < 80) return; // the sheet is up: hardly any map to show
    const k = clamp(Math.min(aw / Math.max(1, x2 - x1), ah / Math.max(1, y2 - y1)), 0.05, 2);
    userMoved.current = true;
    setView({ k, x: m.l + aw / 2 - ((x1 + x2) / 2) * k, y: m.t + ah / 2 - ((y1 + y2) / 2) * k });
  };
  const showAimRef = useRef(showAim);
  useEffect(() => {
    showAimRef.current = showAim;
  });
  // when aiming starts, and when the sheet goes back down for it
  useEffect(() => {
    if (ed.aim) showAimRef.current();
  }, [ed.aim, ed.sheetH]);


  const tracing = !!trace && trace.linkIds.size > 0;
  const dimLink = (id: string) => tracing && !trace!.linkIds.has(id);
  const dimDevice = (id: string) => tracing && !trace!.deviceIds.has(id);

  const cursorStyle =
    drag?.type === "pan" && drag.moved
      ? "grabbing"
      : ed.pickMode
        ? "crosshair"
        : tool === "select"
        ? "default"
        : tool === "place"
          ? "copy"
          : "crosshair";

  const trays = links.filter((l) => l.kind === "tray" && layers.infra);
  const cables = links.filter((l) => l.kind === "cable" && layers[l.layer]);
  // equipment mounted in a rack on this floor, drawn inside the rack while racks are collapsed
  const mountedIn = new Map<string, Device>();
  if (ed.rackCollapse) {
    for (const r of devices) {
      if (r.type !== "rack" || !r.rack) continue;
      for (const i of r.rack.items) if (i.deviceId && devById.has(i.deviceId)) mountedIn.set(i.deviceId, r);
    }
  }
  const visibleDevices = devices.filter((d) => layers[deviceTypeById(d.type).layer] && !mountedIn.has(d.id));

  /**
   * Phones: nothing may cover anything. Equipment that would overlap on screen is drawn as one
   * numbered circle (a tap zooms in until it separates), and a name is shown only where it fits
   * without covering a marker or another name. The selected item always stands on its own.
   */
  const phoneLayout = (() => {
    if (!phone) return null;
    const r = 14 * ms; // marker radius on screen
    const near = 2 * r + 4;
    const pinned = new Set<string>();
    if (selection?.kind === "device") pinned.add(selection.id);
    if (drag?.type === "device") pinned.add(drag.id);
    if (drawing?.a) pinned.add(drawing.a.deviceId);
    const rank = (d: Device) => (pinned.has(d.id) ? 0 : d.type === "rack" ? 1 : deviceTypeById(d.type).camera ? 2 : 3);
    const pts = visibleDevices
      .map((d) => {
        const p = devPos(d);
        return { d, wx: p.x, wy: p.y, x: view.x + p.x * view.k, y: view.y + p.y * view.k };
      })
      .sort((a, b) => rank(a.d) - rank(b.d));
    const taken = new Set<string>();
    const groups: (typeof pts)[] = [];
    for (const a of pts) {
      if (taken.has(a.d.id)) continue;
      taken.add(a.d.id);
      const members = [a];
      if (!pinned.has(a.d.id)) {
        for (const b of pts) {
          if (taken.has(b.d.id) || pinned.has(b.d.id) || Math.hypot(a.x - b.x, a.y - b.y) >= near) continue;
          members.push(b);
          taken.add(b.d.id);
        }
      }
      groups.push(members);
    }
    const clusters = groups.filter((g) => g.length > 1);
    const grouped = new Set(clusters.flat().map((m) => m.d.id));
    // names: one at a time, in priority order, only where they cover nothing
    type Box = { x0: number; x1: number; y0: number; y1: number };
    const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    const marks: Box[] = groups.map((g) => {
      const x = g.reduce((t, m) => t + m.x, 0) / g.length;
      const y = g.reduce((t, m) => t + m.y, 0) / g.length;
      const rr = g.length > 1 ? 18 : r;
      return { x0: x - rr, x1: x + rr, y0: y - rr, y1: y + rr };
    });
    const names: Box[] = [];
    const labeled = new Set<string>();
    for (const g of groups) {
      if (g.length > 1) continue;
      const a = g[0];
      const text = a.d.label + (a.d.type === "rack" && a.d.rack ? " · 00/00U" : "");
      const w = text.length * 6.2 * ms + 6;
      const box = { x0: a.x - w / 2, x1: a.x + w / 2, y0: a.y + 20 * ms, y1: a.y + 35 * ms };
      if (marks.some((m) => hit(m, box)) || names.some((n) => hit(n, box))) continue;
      names.push(box);
      labeled.add(a.d.id);
    }
    return { clusters, grouped, labeled, near };
  })();

  /** Zooms in on a group of overlapping equipment until its members separate. */
  const openCluster = (members: { wx: number; wy: number }[]) => {
    const el = wrapRef.current;
    if (!el || !phoneLayout) return;
    let minD = Infinity;
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) minD = Math.min(minD, Math.hypot(members[i].wx - members[j].wx, members[i].wy - members[j].wy));
    const cx = members.reduce((t, m) => t + m.wx, 0) / members.length;
    const cy = members.reduce((t, m) => t + m.wy, 0) / members.length;
    userMoved.current = true;
    setView((v) => {
      const k = clamp(Math.max(v.k * 1.8, minD > 0.5 ? (phoneLayout.near * 1.5) / minD : v.k * 3), 0.05, 8);
      return { k, x: el.clientWidth / 2 - cx * k, y: el.clientHeight / 2 - cy * k };
    });
  };
  /** a press that started on a group: opened on release unless the finger moved (then it was a pan) */
  const pendingCluster = useRef<{ wx: number; wy: number }[] | null>(null);
  const selectedLink = selection?.kind === "link" ? links.find((l) => l.id === selection.id) : undefined;
  // segments shared by several drawn cables (identical corners), counted once per segment
  const bundles = (() => {
    const seg = new Map<string, { key: string; a: Point; b: Point; n: number }>();
    const k = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;
    for (const l of cables) {
      const pts = linkPoints(l);
      const seen = new Set<string>();
      for (let i = 0; i < pts.length - 1; i++) {
        const [ka, kb] = [k(pts[i]), k(pts[i + 1])];
        if (ka === kb) continue;
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const cur = seg.get(key);
        if (cur) cur.n++;
        else seg.set(key, { key, a: pts[i], b: pts[i + 1], n: 1 });
      }
    }
    return [...seg.values()].filter((x) => x.n > 1);
  })();
  // devices with cables that rise from them into the ceiling
  const ceilingExits = (() => {
    const n = new Map<string, number>();
    for (const l of cables) if (l.run === "ceiling" && l.a) n.set(l.a.deviceId, (n.get(l.a.deviceId) ?? 0) + 1);
    // equipment mounted in a collapsed rack counts for the rack
    const byShown = new Map<string, { dev: Device; n: number }>();
    for (const [id, cnt] of n) {
      const dev = mountedIn.get(id) ?? devById.get(id);
      if (!dev) continue;
      const cur = byShown.get(dev.id);
      byShown.set(dev.id, { dev, n: (cur?.n ?? 0) + cnt });
    }
    return [...byShown.values()];
  })();

  // the red handle at the tip of the selected camera's view, for aiming it on the map
  const camHandle = (() => {
    if (!canEdit || tool !== "select" || !selectedDevice?.camera || selectedDevice.floorId !== floor.id) return null;
    const cam = liveCam(selectedDevice);
    const r = cam.range * (ppm ?? 40);
    const p = devPos(selectedDevice);
    const at = (deg: number, f = 1) => ({ x: p.x + Math.cos((deg * Math.PI) / 180) * r * f, y: p.y + Math.sin((deg * Math.PI) / 180) * r * f });
    const tip = at(cam.dir);
    return {
      id: selectedDevice.id,
      dir: cam.dir,
      range: cam.range,
      fov: cam.fov,
      p,
      hx: tip.x,
      hy: tip.y,
      // while aiming: a handle on each edge of the cone sets its width (part way out, so they stay in view)
      edges: aimDev?.id === selectedDevice.id ? [at(cam.dir - cam.fov / 2, 0.6), at(cam.dir + cam.fov / 2, 0.6)] : null,
    };
  })();
  const selectedArea = selection?.kind === "area" ? areas.find((a) => a.id === selection.id) : undefined;

  const camHandleEl = (() => {
    const h = camHandle;
    if (!h) return null;
    const r = 7 * s * hs;
    // while aiming: the distance, angle and width on the middle line, inside the framed view
    const lx = h.p.x + Math.cos((h.dir * Math.PI) / 180) * h.range * (ppm ?? 40) * 0.5;
    const ly = h.p.y + Math.sin((h.dir * Math.PI) / 180) * h.range * (ppm ?? 40) * 0.5;
    const width = h.fov < 170 ? 2 * h.range * Math.tan((h.fov * Math.PI) / 360) : null;
    return (
      <g>
        <line x1={h.p.x} y1={h.p.y} x2={h.hx} y2={h.hy} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {h.edges?.map((q, i) => (
          <circle
            key={i}
            cx={q.x}
            cy={q.y}
            r={r * 0.85}
            fill="#fff"
            stroke="#ef4444"
            strokeWidth={2.5 * s}
            style={{ cursor: "ew-resize" }}
            onPointerDown={(e) => startFovDrag(e, h.id, h.fov)}
          />
        ))}
        <circle cx={h.hx} cy={h.hy} r={r} fill="#ef4444" stroke="#fff" strokeWidth={2 * s} style={{ cursor: "grab" }} onPointerDown={(e) => startCamDrag(e, h.id, h.dir, h.range)} />
        {h.edges && (
          <text x={lx} y={ly + 4 * s} fontSize={12 * s} fontWeight={700} textAnchor="middle" fill="#b91c1c" style={halo(s)} pointerEvents="none">
            {`${fmtM(h.range)} מ׳ · ${Math.round(h.fov)}°${width ? ` · רוחב ${fmtM(width)} מ׳` : ""}`}
          </text>
        )}
      </g>
    );
  })();

  return (
    <div className="absolute inset-0 flex flex-col">
    {phone && <PhoneMapInfo k={view.k} ppm={ppm} cableM={selectedLink?.kind === "cable" ? linkLengthM(selectedLink, ppm) : undefined} />}
    <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden bg-slate-200">
      <svg
        ref={svgRef}
        className="map-canvas absolute inset-0 h-full w-full"
        style={{ cursor: cursorStyle }}
        onPointerDown={(e) => onBackgroundDown(e)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        onDoubleClick={() => drawing && finishLine()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {/* plan */}
          <rect width={W} height={H} fill="#fff" />
          {planSrc ? (
            <image href={planSrc} width={W} height={H} preserveAspectRatio="none" />
          ) : (
            <EmptyPlan W={W} H={H} grid={sppm} hint={walls.length === 0 && areas.length === 0} />
          )}

          {/* areas */}
          {areas.map((a) => {
            const pts = a.points.map((p, i) =>
              drag?.type === "areaVertex" && drag.areaId === a.id && drag.index === i
                ? { x: drag.x, y: drag.y }
                : drag?.type === "area" && drag.id === a.id
                  ? { x: p.x + drag.dx, y: p.y + drag.dy }
                  : movePt(p),
            );
            const c = centroid(pts);
            const sel = selection?.kind === "area" && selection.id === a.id;
            return (
              <g
                key={a.id}
                style={sel && canEdit && tool === "select" && !ed.pickMode ? { cursor: "move" } : undefined}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  // a selected room can be dragged; otherwise dragging on a room pans the map
                  if (sel && canEdit && tool === "select" && !ed.pickMode) {
                    capture(e);
                    const wpt = toWorld(e);
                    setDrag({ type: "area", id: a.id, sx: wpt.x, sy: wpt.y, dx: 0, dy: 0, moved: false });
                    return;
                  }
                  onBackgroundDown(e, tool === "select" ? { kind: "area", id: a.id } : undefined);
                }}
              >
                <polygon
                  points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill={a.color}
                  fillOpacity={sel ? 0.28 : 0.15}
                  stroke={a.color}
                  strokeWidth={sel ? 3 : 2}
                  strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke"
                />
                <text x={c.x} y={c.y} fontSize={13 * s} fontWeight={600} fill={shade(a.color)} textAnchor="middle" className="halo" style={halo(s)}>
                  {a.name}
                </text>
                <RoomBadges a={a} x={c.x} y={c.y + 15 * s} s={s} />
              </g>
            );
          })}

          {/* structure: walls, doors/windows, columns (faded while the assistant draws a new version) */}
          {ed.showStructure && (
            <g opacity={livePreview ? 0.25 : 1}>
            <StructureLayer
              walls={walls}
              openings={openings}
              obstacles={obstacles}
              ppm={sppm}
              s={s}
              colorBy={ed.wallColorBy}
              selection={selection}
              wallPos={wallPos}
              obstaclePos={obstaclePos}
              openingOffset={openingOffset}
              onPick={(e, pick) => {
                e.stopPropagation();
                onBackgroundDown(e, tool === "select" ? pick : undefined);
              }}
              touch={coarse}
              onWallDown={
                editingStructure && !ed.pickMode
                  ? (e, w) => {
                      e.stopPropagation();
                      const wpt = toWorld(e);
                      const start = () => setDrag({ type: "wall", id: w.id, a: w.a, b: w.b, sx: wpt.x, sy: wpt.y, dx: 0, dy: 0, moved: false });
                      if (touchGate(e, { kind: "wall", id: w.id }, start)) return;
                      capture(e);
                      start();
                    }
                  : undefined
              }
              onWallEndDown={
                editingStructure
                  ? (e, w, end) => {
                      e.stopPropagation();
                      capture(e);
                      setDrag({ type: "wallEnd", wallId: w.id, end, orig: w[end], x: w[end].x, y: w[end].y });
                    }
                  : undefined
              }
              onOpeningDown={
                editingStructure && !ed.pickMode
                  ? (e, o) => {
                      e.stopPropagation();
                      const start = () => setDrag({ type: "opening", id: o.id, offsetM: o.offsetM, orig: o.offsetM });
                      if (touchGate(e, { kind: "opening", id: o.id }, start)) return;
                      capture(e);
                      start();
                    }
                  : undefined
              }
              onObstacleDown={
                editingStructure && !ed.pickMode
                  ? (e, o) => {
                      e.stopPropagation();
                      const wpt = toWorld(e);
                      const start = () => setDrag({ type: "obstacle", id: o.id, ox: o.x, oy: o.y, sx: wpt.x, sy: wpt.y, x: o.x, y: o.y, moved: false });
                      if (touchGate(e, { kind: "obstacle", id: o.id }, start)) return;
                      capture(e);
                      start();
                    }
                  : undefined
              }
            />
            </g>
          )}

          {livePreview && <AssistantPreviewLayer preview={livePreview} ppm={sppm} s={s} />}

          {/* trays / conduits */}
          {trays.map((l) => {
            const t = linkTypeById(l.cableType);
            const pts = linkPoints(l);
            const sel = selectedLink?.id === l.id;
            return (
              <g key={l.id} opacity={tracing ? 0.35 : 1}>
                <polyline
                  points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={t.color}
                  strokeOpacity={0.35}
                  strokeWidth={(t.width ?? 8) + (sel ? 4 : 0)}
                  strokeDasharray={t.dash}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                <HitLine pts={pts} width={16} onDown={(e) => { e.stopPropagation(); onBackgroundDown(e, tool === "select" ? { kind: "link", id: l.id } : undefined); }} />
              </g>
            );
          })}

          {/* camera cones */}
          {showCones &&
            layers.cctv &&
            visibleDevices
              .filter((d) => d.camera)
              .map((d) => {
                const cam = liveCam(d);
                const p = devPos(d);
                const aiming = aimDev?.id === d.id;
                return (
                  <path
                    key={`cone-${d.id}`}
                    d={wedge(p, cam.range * (ppm ?? 40), cam.dir, cam.fov)}
                    fill="#ef4444"
                    fillOpacity={aiming ? 0.16 : dimDevice(d.id) ? 0.03 : 0.08}
                    stroke="#ef4444"
                    strokeOpacity={aiming ? 0.8 : 0.35}
                    strokeWidth={aiming ? 2 : 1}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                );
              })}

          {/* cables */}
          {cables.map((l) => {
            const t = linkTypeById(l.cableType);
            const pts = linkPoints(l);
            if (pts.length < 2) return null;
            const sel = selectedLink?.id === l.id;
            const hot = tracing && trace!.linkIds.has(l.id);
            return (
              <g key={l.id} opacity={dimLink(l.id) ? 0.18 : 1}>
                {(sel || hot) && (
                  <polyline
                    points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={hot ? "#facc15" : "#93c5fd"}
                    strokeWidth={9}
                    strokeOpacity={0.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <polyline
                  points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={l.color || t.color}
                  strokeWidth={hot ? 3.5 : l.run === "ceiling" ? 3.2 : 2.2}
                  strokeDasharray={t.dash}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                {l.run === "ceiling" && (
                  // above the ceiling: a white dashed core inside the cable
                  <polyline
                    points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke="#fff"
                    strokeWidth={1}
                    strokeDasharray="5 4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <HitLine pts={pts} width={12} onDown={(e) => { e.stopPropagation(); onBackgroundDown(e, tool === "select" ? { kind: "link", id: l.id } : undefined); }} />
              </g>
            );
          })}

          {/* cables sharing a route: count on each shared segment */}
          {bundles.map((b) => (
            <g key={b.key} pointerEvents="none">
              <line x1={b.a.x} y1={b.a.y} x2={b.b.x} y2={b.b.y} stroke="#0f172a" strokeOpacity={0.12} strokeWidth={6 + b.n * 2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              {/* a third of the way along, clear of the selected cable's mid-segment handle */}
              <g transform={`translate(${b.a.x + (b.b.x - b.a.x) / 3} ${b.a.y + (b.b.y - b.a.y) / 3}) scale(${s})`}>
                <rect x={-13} y={-8} width={26} height={16} rx={8} fill="#0f172a" />
                <text y={4} fontSize={10} fontWeight={700} fill="#fff" textAnchor="middle" direction="ltr">
                  ×{b.n}
                </text>
              </g>
            </g>
          ))}

          {/* vertex handles for selected line */}
          {canEdit && tool === "select" && selectedLink && (
            <g>
              {linkPoints(selectedLink).map((p, i, arr) => {
                const isEnd = i === 0 || i === arr.length - 1;
                const anchored = (i === 0 && selectedLink.a) || (i === arr.length - 1 && selectedLink.b);
                const mid = i > 0 ? { x: (arr[i - 1].x + p.x) / 2, y: (arr[i - 1].y + p.y) / 2 } : null;
                return (
                  <g key={i}>
                    {mid && (
                      <circle
                        cx={mid.x}
                        cy={mid.y}
                        r={4.5 * s * hs}
                        fill="#fff"
                        stroke="#3b82f6"
                        strokeWidth={1.5 * s}
                        strokeDasharray={`${2 * s} ${2 * s}`}
                        style={{ cursor: "grab" }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          capture(e);
                          setDrag({ type: "vertex", linkId: selectedLink.id, index: i, insert: true, x: mid.x, y: mid.y });
                        }}
                      />
                    )}
                    {!anchored && (
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={(isEnd ? 6 : 5.5) * s * hs}
                        fill="#3b82f6"
                        stroke="#fff"
                        strokeWidth={2 * s}
                        style={{ cursor: "grab" }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          capture(e);
                          setDrag({ type: "vertex", linkId: selectedLink.id, index: i, insert: false, x: p.x, y: p.y });
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (selectedLink.points.length > 2 && !isEnd) {
                            updateLink(selectedLink.id, { points: selectedLink.points.filter((_, j) => j !== i) });
                          }
                        }}
                      />
                    )}
                  </g>
                );
              })}
            </g>
          )}

          {/* area vertex handles */}
          {canEdit && tool === "select" && selectedArea &&
            selectedArea.points.map((p, i) => {
              const q = drag?.type === "areaVertex" && drag.areaId === selectedArea.id && drag.index === i ? drag : p;
              return (
                <circle
                  key={i}
                  cx={q.x}
                  cy={q.y}
                  r={5.5 * s * hs}
                  fill={selectedArea.color}
                  stroke="#fff"
                  strokeWidth={2 * s}
                  style={{ cursor: "grab" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    capture(e);
                    setDrag({ type: "areaVertex", areaId: selectedArea.id, index: i, x: p.x, y: p.y });
                  }}
                />
              );
            })}

          {/* devices */}
          {visibleDevices.map((d) => {
            if (phoneLayout?.grouped.has(d.id)) return null;
            const def = deviceTypeById(d.type);
            const color = layerById(def.layer).color;
            const Icon = def.icon;
            const p = devPos(d);
            const sel = selection?.kind === "device" && selection.id === d.id;
            // a collapsed rack stands in for the equipment inside it
            const inside = d.type === "rack" ? [...mountedIn].filter(([, r]) => r.id === d.id).map(([id]) => id) : [];
            const holdsSelected = selection?.kind === "device" && inside.includes(selection.id);
            const inTrace = tracing && (trace!.deviceIds.has(d.id) || inside.some((id) => trace!.deviceIds.has(id)));
            const dropTarget = drag?.type === "device" && drag.overRack === d.id;
            const rackItems = d.type === "rack" ? (d.rack?.items ?? []) : [];
            return (
              <g
                key={d.id}
                data-device={d.id}
                transform={`translate(${p.x} ${p.y}) scale(${s * (sel || dropTarget ? 1 : ms)})`}
                opacity={dimDevice(d.id) && !inTrace ? 0.3 : 1}
                style={{ cursor: tool === "select" ? (canEdit ? "grab" : "pointer") : undefined }}
                onPointerDown={(e) => onDeviceDown(e, d)}
              >
                {dropTarget && (
                  <>
                    <circle r={27} fill="#22c55e" fillOpacity={0.15} stroke="#16a34a" strokeWidth={3} />
                    <text y={-34} fontSize={11} fontWeight={700} textAnchor="middle" fill="#15803d" style={halo(1)}>
                      שחרר כדי להכניס לארון
                    </text>
                  </>
                )}
                {coarse && <circle r={24} fill="transparent" />}
                {holdsSelected && !sel && <circle r={20} fill="none" stroke="#2563eb" strokeWidth={3} strokeDasharray="4 3" />}
                {(sel || inTrace) && <circle r={20} fill="none" stroke={sel ? "#2563eb" : "#facc15"} strokeWidth={sel ? 3 : 4} />}
                <circle r={14} fill="#fff" stroke={color} strokeWidth={2.5} />
                <Icon x={-8} y={-8} width={16} height={16} color={color} strokeWidth={2.2} />
                {rackItems.length > 0 && (
                  // how much is mounted in the cabinet
                  <g transform="translate(13 -12)">
                    <rect x={-11} y={-7} width={22} height={14} rx={7} fill="#0f172a" />
                    <text y={3.5} fontSize={9} fontWeight={700} fill="#fff" textAnchor="middle">
                      {rackItems.length}
                    </text>
                  </g>
                )}
                {(phoneLayout ? sel || (labelsVisible && phoneLayout.labeled.has(d.id)) : labelsVisible || sel || inTrace) && (
                  <text y={28} fontSize={11} fontWeight={sel ? 700 : 500} textAnchor="middle" fill="#0f172a" style={halo(1)}>
                    {d.label}
                    {d.type === "rack" && d.rack ? ` · ${usedUnits(d.rack.items)}/${d.rack.spec.units}U` : ""}
                  </text>
                )}
              </g>
            );
          })}

          {/* phones: overlapping equipment as one numbered circle */}
          {phoneLayout?.clusters.map((g) => {
            const cx = g.reduce((t, m) => t + m.wx, 0) / g.length;
            const cy = g.reduce((t, m) => t + m.wy, 0) / g.length;
            const colors = [...new Set(g.map((m) => layerById(deviceTypeById(m.d.type).layer).color))].slice(0, 4);
            return (
              <g
                key={`cluster-${g[0].d.id}`}
                transform={`translate(${cx} ${cy}) scale(${s})`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onBackgroundDown(e);
                  pendingCluster.current = g;
                }}
              >
                <circle r={26} fill="transparent" />
                <circle r={18} fill="#0f172a" stroke="#fff" strokeWidth={3} />
                {colors.map((c, i) => (
                  <circle key={c} cx={-((colors.length - 1) * 5) / 2 + i * 5} cy={11} r={2.2} fill={c} />
                ))}
                <text y={3} fontSize={13} fontWeight={700} fill="#fff" textAnchor="middle">
                  {g.length}
                </text>
              </g>
            );
          })}

          {/* cables going up into the ceiling from a device: "↑N" */}
          {ceilingExits.map(({ dev, n }) => {
            const p = devPos(dev);
            return (
              <g key={`exit-${dev.id}`} transform={`translate(${p.x} ${p.y}) scale(${s})`} pointerEvents="none">
                <rect x={-34} y={-30} width={26} height={15} rx={4} fill="#fff" stroke="#475569" strokeWidth={1} />
                <text x={-21} y={-19} fontSize={10} fontWeight={700} fill="#0f172a" textAnchor="middle">
                  ↑{n}
                </text>
              </g>
            );
          })}

          {/* camera direction handle (while aiming it's drawn on top of everything, below) */}
          {!camHandle?.edges && camHandleEl}

          {/* notes */}
          {notes.map((n) => {
            const p = drag?.type === "note" && drag.id === n.id ? drag : n;
            const sel = selection?.kind === "note" && selection.id === n.id;
            // phones: just an icon until zoomed in or selected, so notes don't hide the equipment
            const compact = phone && !sel && view.k < 1.2;
            const w = compact ? 26 : Math.min(260, n.text.length * 6.4 + 30);
            return (
              <g
                key={n.id}
                transform={`translate(${p.x} ${p.y}) scale(${s})`}
                style={{ cursor: "pointer" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (tool !== "select") {
                    capture(e);
                    return toolClick(toWorld(e));
                  }
                  const wpt = toWorld(e);
                  const start = () => setDrag({ type: "note", id: n.id, ox: n.x, oy: n.y, sx: wpt.x, sy: wpt.y, x: n.x, y: n.y, moved: false });
                  if (touchGate(e, { kind: "note", id: n.id }, start)) return;
                  capture(e);
                  start();
                }}
              >
                {coarse && <rect x={-w / 2 - 8} y={-20} width={w + 16} height={40} fill="transparent" />}
                <rect x={-w / 2} y={-12} width={w} height={24} rx={6} fill="#fef9c3" stroke={sel ? "#2563eb" : "#eab308"} strokeWidth={sel ? 2 : 1} />
                <StickyNote x={compact ? -7 : w / 2 - 20} y={-7} width={14} height={14} color="#a16207" />
                {!compact && (
                  <text x={w / 2 - 24} y={4} fontSize={11} fill="#713f12" textAnchor="start" direction="rtl">
                    {n.text.length > 38 ? n.text.slice(0, 37) + "…" : n.text}
                  </text>
                )}
              </g>
            );
          })}

          {/* references attached to the next assistant message */}
          {ed.refs.map((r, i) => {
            const at = refAnchor(r, sppm);
            if (!at) return null;
            return (
              <g key={`ref${i}`} pointerEvents="none">
                {r.rect && (
                  <rect
                    x={r.rect.x1}
                    y={r.rect.y1}
                    width={r.rect.x2 - r.rect.x1}
                    height={r.rect.y2 - r.rect.y1}
                    fill="#8b5cf6"
                    fillOpacity={0.1}
                    stroke="#7c3aed"
                    strokeWidth={2}
                    strokeDasharray="7 4"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {!r.rect && <circle cx={at.x} cy={at.y} r={20 * s} fill="none" stroke="#7c3aed" strokeWidth={3 * s} />}
                <g transform={`translate(${at.x} ${at.y - (r.rect ? 0 : 26 * s)}) scale(${s})`}>
                  <circle r={10} fill="#7c3aed" stroke="#fff" strokeWidth={2} />
                  <text y={4} fontSize={11} fontWeight={700} fill="#fff" textAnchor="middle">
                    {i + 1}
                  </text>
                </g>
              </g>
            );
          })}
          {ed.pickMode === "region" && regionStart && cursor && (
            <rect
              x={Math.min(regionStart.x, cursor.x)}
              y={Math.min(regionStart.y, cursor.y)}
              width={Math.abs(cursor.x - regionStart.x)}
              height={Math.abs(cursor.y - regionStart.y)}
              fill="#8b5cf6"
              fillOpacity={0.12}
              stroke="#7c3aed"
              strokeWidth={2}
              strokeDasharray="7 4"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}

          {/* wall / room preview */}
          {drawing && (tool === "wall" || tool === "room") && cursor && (
            <g pointerEvents="none">
              {(() => {
                const last = drawing.points[drawing.points.length - 1];
                if (tool === "wall") {
                  const q = snapWallPoint(cursor, last, wallEndpoints(), SNAP_PX * s, false, sppm / 10);
                  const def = wallTypeById(ed.wallType);
                  const width = wallWidth({ type: ed.wallType } as Wall, sppm, s);
                  return (
                    <>
                      <line x1={last.x} y1={last.y} x2={q.x} y2={q.y} stroke={def.color} strokeOpacity={0.6} strokeWidth={width} />
                      <circle cx={q.x} cy={q.y} r={4 * s} fill="#2563eb" />
                      <text x={(last.x + q.x) / 2} y={(last.y + q.y) / 2 - 10 * s} fontSize={12 * s} fontWeight={700} textAnchor="middle" fill="#1e3a8a" style={halo(s)}>
                        {(Math.hypot(q.x - last.x, q.y - last.y) / sppm).toFixed(2)} מ׳
                      </text>
                    </>
                  );
                }
                const q = snapWallPoint(cursor, undefined, wallEndpoints(), SNAP_PX * s, true, sppm / 10);
                const x = Math.min(last.x, q.x);
                const y = Math.min(last.y, q.y);
                const w = Math.abs(q.x - last.x);
                const h = Math.abs(q.y - last.y);
                return (
                  <>
                    <rect x={x} y={y} width={w} height={h} fill="#60a5fa22" stroke={wallTypeById(ed.wallType).color} strokeWidth={wallWidth({ type: ed.wallType } as Wall, sppm, s)} strokeOpacity={0.6} />
                    <text x={x + w / 2} y={y + h / 2} fontSize={13 * s} fontWeight={700} textAnchor="middle" fill="#1e3a8a" style={halo(s)}>
                      {(w / sppm).toFixed(1)} × {(h / sppm).toFixed(1)} מ׳
                    </text>
                  </>
                );
              })()}
            </g>
          )}

          {/* drawing preview */}
          {drawing && tool !== "wall" && tool !== "room" && (
            <g pointerEvents="none">
              <polyline
                points={[...drawing.points, ...(cursor ? [cursor] : [])].map((p) => `${p.x},${p.y}`).join(" ")}
                fill={tool === "area" ? "#60a5fa22" : "none"}
                stroke={tool === "cable" ? linkTypeById(ed.cableType).color : tool === "tray" ? "#475569" : "#2563eb"}
                strokeWidth={tool === "tray" ? 8 : 2.5}
                strokeOpacity={tool === "tray" ? 0.5 : 1}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
              {drawing.points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={4 * s} fill="#2563eb" />
              ))}
              {ppm && cursor && (
                <text
                  x={cursor.x + 12 * s}
                  y={cursor.y - 12 * s}
                  fontSize={12 * s}
                  fontWeight={600}
                  fill="#1e3a8a"
                  style={halo(s)}
                >
                  {(polyLen([...drawing.points, cursor]) / ppm).toFixed(1)} מ׳
                </text>
              )}
            </g>
          )}

          {/* measure / calibrate */}
          {(tool === "measure" || tool === "calibrate") && measure.length > 0 && (
            <g pointerEvents="none">
              {(() => {
                const a = measure[0];
                const b = measure[1] ?? cursor ?? a;
                const px = Math.hypot(b.x - a.x, b.y - a.y);
                const color = tool === "calibrate" ? "#9333ea" : "#0f172a";
                return (
                  <>
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={2} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
                    <circle cx={a.x} cy={a.y} r={4 * s} fill={color} />
                    <circle cx={b.x} cy={b.y} r={4 * s} fill={color} />
                    {tool === "measure" && (
                      <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8 * s} fontSize={13 * s} fontWeight={700} textAnchor="middle" fill={color} style={halo(s)}>
                        {ppm ? `${(px / ppm).toFixed(2)} מ׳` : "יש לכייל קנה מידה"}
                      </text>
                    )}
                  </>
                );
              })()}
            </g>
          )}

          {/* aiming a camera: the whole map takes taps (they aim it), its handles stay on top */}
          {aimDev && camHandle?.edges && (
            <>
              <rect
                x={-1e5}
                y={-1e5}
                width={2e5}
                height={2e5}
                fill="transparent"
                style={{ cursor: "crosshair" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onBackgroundDown(e);
                }}
              />
              {camHandleEl}
            </>
          )}
        </g>
      </svg>

      {/* desktop only: on phones these live in the info row and the tool bar, never on top of the map */}
      {!phone && <Compass view={view} W={W} H={H} wrap={wrapRef} />}

      {ed.pickMode && !phone && (
        <div className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-violet-700 px-3 py-2 text-xs text-white shadow-lg">
          <span>
            {ed.pickMode === "object"
              ? "לחצו על קיר, חדר, פתח, עמוד או ציוד כדי לסמן אותו לעוזר"
              : regionStart
                ? "עכשיו לחצו על הפינה הנגדית של האזור"
                : "לחצו על פינה אחת של האזור שרוצים לסמן"}
          </span>
          <button
            onClick={() => {
              ed.setPickMode(null);
              setRegionStart(null);
            }}
            className="rounded-md bg-white/20 px-2 py-0.5 font-medium hover:bg-white/30"
          >
            סיום
          </button>
        </div>
      )}

      {/* scale bar */}
      {ppm && !phone && <ScaleBar k={view.k} ppm={ppm} />}

      {/* finish / cancel for the line being drawn (phones have them in the tool bar) */}
      {drawing && !phone && (
        <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2">
          {drawing.points.length >= (tool === "area" ? 3 : 2) && (
            <button onClick={() => finishLine()} className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
              סיום
            </button>
          )}
          <button onClick={() => setDrawing(null)} className="rounded-full bg-white px-5 py-2.5 text-sm shadow-lg ring-1 ring-slate-200">
            ביטול
          </button>
        </div>
      )}

      {/* cable length tip for selected link */}
      {selectedLink && selectedLink.kind === "cable" && !phone && (() => {
        const len = linkLengthM(selectedLink, ppm);
        return len ? (
          <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg bg-slate-900/80 px-2 py-1 text-xs text-white">
            אורך משוער: {len.toFixed(1)} מ׳
          </div>
        ) : null;
      })()}
    </div>
    </div>
  );
}

/** Phones: north, the selected cable's length and the scale, in a row of their own above the map. */
function PhoneMapInfo({ k, ppm, cableM }: { k: number; ppm?: number; cableM?: number }) {
  const pxPerM = (ppm ?? 0) * k;
  const m = [0.5, 1, 2, 5, 10, 20, 50, 100].find((n) => n * pxPerM >= 48) ?? 100;
  return (
    <div className="flex h-8 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 text-[11px] text-slate-600">
      <span className="flex items-center gap-1 font-semibold">
        <span aria-hidden>↑</span> צפון
      </span>
      {cableM ? <span className="truncate">אורך הכבל: {cableM.toFixed(1)} מ׳</span> : null}
      {ppm ? (
        <span className="ms-auto flex items-center gap-1.5">
          {m} מ׳
          <span className="h-1.5 border-x-2 border-b-2 border-slate-600" style={{ width: m * pxPerM }} />
        </span>
      ) : (
        <span className="ms-auto text-slate-400">קנה מידה לא מכויל</span>
      )}
    </div>
  );
}

/** North / south / east / west labels just outside the plan; they stick to the screen edge when the plan runs off it. */
function Compass({ view, W, H, wrap }: { view: View; W: number; H: number; wrap: React.RefObject<HTMLDivElement | null> }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wrap]);
  if (!box.w) return null;

  // the part of the canvas that is actually visible (not under the tool bar or the top buttons)
  const x0 = 28;
  const x1 = box.w - 74; // tool bar on the right
  const y0 = 70; // layer / assistant buttons on top
  const y1 = box.h - 18;

  const left = view.x;
  const top = view.y;
  const right = view.x + W * view.k;
  const bottom = view.y + H * view.k;
  // along each edge: the middle of the visible part of the plan (or of the screen if none is visible)
  const ox0 = Math.max(left, x0);
  const ox1 = Math.min(right, x1);
  const oy0 = Math.max(top, y0);
  const oy1 = Math.min(bottom, y1);
  const cx = clampSafe(ox0 < ox1 ? (ox0 + ox1) / 2 : (x0 + x1) / 2, x0 + 30, x1 - 30);
  const cy = clampSafe(oy0 < oy1 ? (oy0 + oy1) / 2 : (y0 + y1) / 2, y0 + 30, y1 - 30);
  // across: just outside the plan's edge; when that edge is off-screen, on the screen's own edge
  // (north is always up, so "צפון" never ends up below "דרום")
  let n = top - 16 > y1 ? y0 : Math.max(y0, top - 16);
  let sth = bottom + 16 < y0 ? y1 : Math.min(y1, bottom + 16);
  let e = right + 28 < x0 ? x1 : Math.min(x1, right + 28);
  let w = left - 28 > x1 ? x0 : Math.max(x0, left - 28);
  if (sth - n < 28) [n, sth] = [y0, y1];
  if (e - w < 56) [w, e] = [x0, x1];
  const labels = [
    { t: "צפון", x: cx, y: n },
    { t: "דרום", x: cx, y: sth },
    { t: "מזרח", x: e, y: cy },
    { t: "מערב", x: w, y: cy },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {labels.map((l) => (
        <span
          key={l.t}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200"
          // CSS clamp is a safety net that uses the live container size, even if the measured box is stale
          style={{ left: `clamp(28px, ${l.x}px, calc(100% - 74px))`, top: `clamp(70px, ${l.y}px, calc(100% - 18px))` }}
        >
          {l.t}
        </span>
      ))}
    </div>
  );
}

/** clamp that never inverts: if the range is empty, use its middle */
const clampSafe = (v: number, a: number, b: number) => (a > b ? (a + b) / 2 : Math.max(a, Math.min(b, v)));

function HitLine({ pts, width, onDown }: { pts: Point[]; width: number; onDown: (e: React.PointerEvent) => void }) {
  return (
    <polyline
      points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
      fill="none"
      stroke="transparent"
      strokeWidth={width}
      vectorEffect="non-scaling-stroke"
      style={{ cursor: "pointer" }}
      onPointerDown={onDown}
    />
  );
}

/** 1-meter grid for floors drawn without a plan image */
function EmptyPlan({ W, H, grid, hint }: { W: number; H: number; grid: number; hint: boolean }) {
  return (
    <g>
      <defs>
        <pattern id="emptygrid" width={grid} height={grid} patternUnits="userSpaceOnUse">
          <path d={`M${grid} 0H0V${grid}`} fill="none" stroke="#e2e8f0" strokeWidth="1" />
        </pattern>
        <pattern id="emptygrid5" width={grid * 5} height={grid * 5} patternUnits="userSpaceOnUse">
          <path d={`M${grid * 5} 0H0V${grid * 5}`} fill="none" stroke="#cbd5e1" strokeWidth="1.5" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#emptygrid)" />
      <rect width={W} height={H} fill="url(#emptygrid5)" />
      {hint && (
        <>
          <text x={W / 2} y={H / 2 - 20} fontSize={30} fill="#94a3b8" textAnchor="middle">
            אין תוכנית לקומה הזו
          </text>
          <text x={W / 2} y={H / 2 + 24} fontSize={22} fill="#94a3b8" textAnchor="middle">
            ציירו קירות וחדרים בכלים, העלו תמונה או PDF, או תארו את השטח לעוזר
          </text>
        </>
      )}
    </g>
  );
}

/** The space the assistant is writing right now: violet walls and dashed rooms, not yet saved. */
function AssistantPreviewLayer({ preview, ppm, s }: { preview: SpacePreview; ppm: number; s: number }) {
  return (
    <g pointerEvents="none">
      {preview.rooms.map((r, i) => {
        const c = centroid(r.points);
        return (
          <g key={`r${i}`}>
            <polygon
              points={r.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="#8b5cf6"
              fillOpacity={0.08}
              stroke="#8b5cf6"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
            <text x={c.x} y={c.y} fontSize={13 * s} fontWeight={700} fill="#6d28d9" textAnchor="middle" style={halo(s)}>
              {r.name}
            </text>
          </g>
        );
      })}
      {preview.walls.map((w, i) => (
        <line
          key={`w${i}`}
          x1={w.a.x}
          y1={w.a.y}
          x2={w.b.x}
          y2={w.b.y}
          stroke="#7c3aed"
          strokeOpacity={0.85}
          strokeWidth={Math.max(((w.thicknessCm ?? wallTypeById(w.type).thickness) / 100) * ppm, 3 * s)}
          strokeLinecap="square"
        >
          <animate attributeName="stroke-opacity" from="0" to="0.85" dur="0.4s" fill="freeze" />
        </line>
      ))}
    </g>
  );
}

/** small status line under a room's name: privacy / outdoor */
function RoomBadges({ a, x, y, s }: { a: Area; x: number; y: number; s: number }) {
  const parts = [a.noCameras ? "🚫 אסור לצלם" : null, a.outdoor ? "חוץ" : null].filter(Boolean);
  if (!parts.length) return null;
  return (
    <text x={x} y={y} fontSize={10 * s} fontWeight={600} fill={a.noCameras ? "#b91c1c" : "#475569"} textAnchor="middle" style={halo(s)}>
      {parts.join(" · ")}
    </text>
  );
}

function ScaleBar({ k, ppm }: { k: number; ppm: number }) {
  const pxPerM = ppm * k;
  const nice = [0.5, 1, 2, 5, 10, 20, 50, 100];
  const m = nice.find((n) => n * pxPerM >= 70) ?? 100;
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 rounded bg-white/85 px-2 py-1 text-[11px] text-slate-700 shadow-sm">
      <div className="h-1.5 border-x-2 border-b-2 border-slate-700" style={{ width: m * pxPerM }} />
      <div className="mt-0.5 text-center">{m} מ׳</div>
    </div>
  );
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const round = (v: number) => Math.round(v * 10) / 10;
const halo = (s: number): React.CSSProperties => ({
  paintOrder: "stroke",
  stroke: "#fff",
  strokeWidth: 3 * s,
  strokeLinejoin: "round",
});

function polyLen(pts: Point[]) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return l;
}

function centroid(pts: Point[]): Point {
  const n = pts.length || 1;
  return { x: pts.reduce((a, p) => a + p.x, 0) / n, y: pts.reduce((a, p) => a + p.y, 0) / n };
}

function wedge(c: Point, r: number, dir: number, fov: number) {
  const a1 = ((dir - fov / 2) * Math.PI) / 180;
  const a2 = ((dir + fov / 2) * Math.PI) / 180;
  const x1 = c.x + Math.cos(a1) * r;
  const y1 = c.y + Math.sin(a1) * r;
  const x2 = c.x + Math.cos(a2) * r;
  const y2 = c.y + Math.sin(a2) * r;
  const large = fov > 180 ? 1 : 0;
  return `M${c.x} ${c.y} L${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

/** darker variant of an area color for its label */
function shade(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.55);
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}
