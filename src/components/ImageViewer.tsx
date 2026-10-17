"use client";

import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useImageSrc } from "@/lib/images";
import { usePinchZoom } from "@/lib/use-pinch-zoom";

const MAX = 6;

/**
 * A picture on the whole screen, to look at closely: pinch with two fingers or turn the mouse wheel
 * to zoom (where the fingers / pointer are), drag to move, double-tap or double-click to zoom in and
 * back. With several pictures: arrows, or a swipe while not zoomed.
 */
export function ImageViewer({ srcs, index = 0, title, actions, onClose }: { srcs: string[]; index?: number; title?: string; actions?: (src: string) => ReactNode; onClose: () => void }) {
  const [i, setI] = useState(Math.min(index, srcs.length - 1));
  const many = srcs.length > 1;
  // RTL: a swipe right goes forward
  const { stageRef, imgRef, view, handlers, transform, zoomBy, reset } = usePinchZoom({ max: MAX, onSwipe: many ? (dir) => go(dir) : undefined });
  const go = (d: number) => {
    setI((n) => (n + d + srcs.length) % srcs.length);
    reset();
  };
  const src = srcs[i];
  const url = useImageSrc(src);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (many && e.key === "ArrowLeft") go(1);
      if (many && e.key === "ArrowRight") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white">
      <div className="pt-safe flex shrink-0 items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {title}
          {many && (
            <span className="text-white/60">
              {" "}
              · {i + 1}/{srcs.length}
            </span>
          )}
        </span>
        <button onClick={() => zoomBy(1 / 1.6)} disabled={view.k <= 1} className="grid size-10 place-items-center rounded-full bg-white/15 disabled:opacity-40" aria-label="הקטנה">
          <Minus size={18} />
        </button>
        <button onClick={() => zoomBy(1.6)} disabled={view.k >= MAX} className="grid size-10 place-items-center rounded-full bg-white/15 disabled:opacity-40" aria-label="הגדלה">
          <Plus size={18} />
        </button>
        <button onClick={onClose} className="grid size-10 place-items-center rounded-full bg-white/15" aria-label="סגירה">
          <X size={20} />
        </button>
      </div>

      <div ref={stageRef} className="relative min-h-0 flex-1 touch-none select-none overflow-hidden" style={{ cursor: view.k > 1 ? "grab" : "zoom-in" }} {...handlers}>
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={imgRef} src={url} alt="" draggable={false} className="absolute inset-0 m-auto max-h-full max-w-full object-contain" style={transform} />
        )}
        {many && (
          <>
            <button onClick={() => go(-1)} onPointerDown={(e) => e.stopPropagation()} className="absolute start-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50" aria-label="הקודמת">
              <ChevronRight size={22} />
            </button>
            <button onClick={() => go(1)} onPointerDown={(e) => e.stopPropagation()} className="absolute end-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50" aria-label="הבאה">
              <ChevronLeft size={22} />
            </button>
          </>
        )}
      </div>

      <div className="pb-safe flex shrink-0 items-center justify-center gap-2 px-3 py-2 text-xs text-white/60">
        {actions?.(src) ?? <span>{"ontouchstart" in globalThis ? "צביטה באצבעות או הקשה כפולה להגדלה" : "גלגלת העכבר או לחיצה כפולה להגדלה"}</span>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * A picture that zooms where it is, inside its frame: pinch with two fingers (one finger still
 * scrolls the page until it's zoomed), a trackpad pinch or Ctrl + wheel, double-tap or
 * double-click to zoom in and back.
 */
export function ZoomableImage({ src, className, children }: { src: string; className?: string; children?: ReactNode }) {
  const { stageRef, imgRef, view, handlers, transform } = usePinchZoom({ max: MAX, wheel: "ctrl" });
  const zoomed = view.k > 1;
  return (
    <div
      ref={stageRef}
      className={`relative select-none overflow-hidden ${className ?? ""}`}
      // until it's zoomed, one finger scrolls the page; zoomed, it moves the picture
      style={{ touchAction: zoomed ? "none" : "pan-y", cursor: zoomed ? "grab" : "zoom-in" }}
      {...handlers}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- served by our API with the session cookie */}
      <img ref={imgRef} src={src} alt="" draggable={false} className="absolute inset-0 m-auto max-h-full max-w-full object-contain" style={transform} />
      {children}
    </div>
  );
}
