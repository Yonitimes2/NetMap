"use client";

import { useEffect, useRef, useState } from "react";

export type ZoomView = { k: number; x: number; y: number };
const FIT: ZoomView = { k: 1, x: 0, y: 0 };

/**
 * Zooming a picture in its frame: two fingers pinch (around where they are), one finger or the
 * mouse drags it once zoomed, a double tap / double click zooms in there or back to the whole
 * picture, and the wheel zooms — any wheel, or (in a page that scrolls) only a trackpad pinch or
 * Ctrl + wheel, so the page still scrolls. A sideways swipe while not zoomed calls onSwipe.
 */
export function usePinchZoom<T extends HTMLElement = HTMLImageElement>({
  max = 6,
  wheel = "always",
  onSwipe,
}: { max?: number; wheel?: "always" | "ctrl"; onSwipe?: (dir: 1 | -1) => void } = {}) {
  const stageRef = useRef<HTMLDivElement>(null);
  /** what's zoomed: a picture, or anything drawn (a plan) */
  const imgRef = useRef<T>(null);
  const [view, setView] = useState<ZoomView>(FIT);
  /** fingers / the mouse are moving it: no easing then */
  const [active, setActive] = useState(false);

  /** keep the picture over its frame: no empty margins beyond its edges when zoomed */
  const clamp = (v: ZoomView): ZoomView => {
    const k = Math.min(max, Math.max(1, v.k));
    if (k === 1) return FIT;
    const img = imgRef.current;
    const stage = stageRef.current;
    if (!img || !stage) return { ...v, k };
    const mx = Math.max(0, (img.offsetWidth * k - stage.clientWidth) / 2);
    const my = Math.max(0, (img.offsetHeight * k - stage.clientHeight) / 2);
    return { k, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) };
  };
  /** a point relative to the middle of the frame, where the picture's transform starts */
  const centered = (cx: number, cy: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: cx - (r.left + r.width / 2), y: cy - (r.top + r.height / 2) };
  };
  /** zoom to k keeping the point p where it is */
  const zoomAt = (v: ZoomView, k: number, p: { x: number; y: number }): ZoomView => {
    const f = Math.min(max, Math.max(1, k)) / v.k;
    return clamp({ k: v.k * f, x: p.x - (p.x - v.x) * f, y: p.y - (p.y - v.y) * f });
  };

  // the wheel needs a non-passive listener, to keep the page from scrolling while it zooms
  const wheelRef = useRef<(e: WheelEvent) => void>(() => undefined);
  useEffect(() => {
    wheelRef.current = (e: WheelEvent) => {
      // a trackpad pinch arrives as a wheel with Ctrl
      if (wheel === "ctrl" && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const p = centered(e.clientX, e.clientY);
      setView((v) => zoomAt(v, v.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), p));
    };
  });
  useEffect(() => {
    const stage = stageRef.current;
    const on = (e: WheelEvent) => wheelRef.current(e);
    stage?.addEventListener("wheel", on, { passive: false });
    return () => stage?.removeEventListener("wheel", on);
  }, []);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ kind: "pan" | "pinch"; v: ZoomView; p0: { x: number; y: number }; d0: number; moved: boolean } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const start = () => {
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const [a, b] = pts;
      gesture.current = { kind: "pinch", v: view, p0: centered((a.x + b.x) / 2, (a.y + b.y) / 2), d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, moved: true };
    } else if (pts.length === 1) {
      gesture.current = { kind: "pan", v: view, p0: pts[0], d0: 0, moved: false };
    }
  };

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // the pointer is already gone (a very quick tap): the gesture works without capture
      }
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      setActive(true);
      start();
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture.current;
      if (!g) return;
      const pts = [...pointers.current.values()];
      if (g.kind === "pinch" && pts.length >= 2) {
        const [a, b] = pts;
        const mid = centered((a.x + b.x) / 2, (a.y + b.y) / 2);
        // the picture follows the fingers: zoom around where they started, then move with them
        const z = zoomAt(g.v, g.v.k * (Math.hypot(a.x - b.x, a.y - b.y) / g.d0), g.p0);
        setView(clamp({ ...z, x: z.x + mid.x - g.p0.x, y: z.y + mid.y - g.p0.y }));
      } else if (g.kind === "pan") {
        const dx = e.clientX - g.p0.x;
        const dy = e.clientY - g.p0.y;
        if (Math.hypot(dx, dy) > 6) g.moved = true;
        if (g.v.k > 1) setView(clamp({ ...g.v, x: g.v.x + dx, y: g.v.y + dy }));
      }
    },
    onPointerUp: (e: React.PointerEvent) => {
      const g = gesture.current;
      pointers.current.delete(e.pointerId);
      if (pointers.current.size) return start(); // one finger lifted from a pinch: carry on with the other
      gesture.current = null;
      setActive(false);
      if (!g || g.kind !== "pan" || e.type === "pointercancel") return;
      const dx = e.clientX - g.p0.x;
      if (g.v.k === 1 && onSwipe && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - g.p0.y)) return onSwipe(dx > 0 ? 1 : -1);
      if (g.moved) return;
      // a double tap / double click: zoom in there, or back to the whole picture
      const last = lastTap.current;
      if (last && e.timeStamp - last.t < 320 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) {
        lastTap.current = null;
        setView((v) => (v.k > 1 ? FIT : zoomAt(v, 2.5, centered(e.clientX, e.clientY))));
      } else lastTap.current = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    },
  };

  return {
    stageRef,
    imgRef,
    view,
    handlers: { ...handlers, onPointerCancel: handlers.onPointerUp },
    /** for the picture's style */
    transform: { transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transition: active ? "none" : "transform 120ms ease-out" },
    zoomBy: (f: number) => setView((v) => zoomAt(v, v.k * f, { x: 0, y: 0 })),
    reset: () => setView(FIT),
  };
}
