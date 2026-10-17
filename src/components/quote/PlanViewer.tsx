"use client";

import { Maximize, Minus, Plus } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { usePinchZoom } from "@/lib/use-pinch-zoom";
import { useIsPhone } from "@/lib/use-media";

const MAX = 5;
/** a phone's frame for a wide plan: about square, so the plan isn't a thin strip */
const PHONE_FRAME = 1.15;

/**
 * The plan, to look into: pinch with two fingers (or Ctrl + wheel, a trackpad pinch) or the buttons
 * to zoom, drag to move around once zoomed, double-tap to zoom in and back. On a phone a wide plan
 * opens filling a taller frame, to be dragged sideways (one finger up and down still scrolls the
 * page). Printed, it's the whole plan.
 */
export function PlanViewer({ children, ratio }: { children: ReactNode; ratio: number }) {
  const { stageRef, imgRef, view, handlers, transform, zoomBy, reset } = usePinchZoom<HTMLDivElement>({ max: MAX, wheel: "ctrl" });
  const phone = useIsPhone();
  // how far in a phone starts, so the plan fills the frame's height
  const cover = phone && ratio > PHONE_FRAME * 1.05 ? ratio / PHONE_FRAME : 1;

  useEffect(() => {
    if (cover > 1) zoomBy(cover);
    // only when the frame changes: zooming in and out by hand is the user's
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cover]);

  const zoomed = view.k > 1.01;
  // beyond the starting zoom one finger moves the plan every way; up to it, up and down scrolls the page
  const deep = view.k > cover + 0.01;
  return (
    <>
      <div
        ref={stageRef}
        dir="ltr"
        className="relative w-full select-none overflow-hidden bg-white print:overflow-visible"
        style={{ aspectRatio: `${cover > 1 ? PHONE_FRAME : ratio}`, maxHeight: "78vh", touchAction: deep ? "none" : "pan-y", cursor: zoomed ? "grab" : "zoom-in" }}
        {...handlers}
      >
        <div ref={imgRef} className="absolute inset-0 print:![transform:none]" style={transform}>
          {children}
        </div>
      </div>
      <div className="flex items-center gap-1 border-t border-slate-100 px-2 py-1.5 print:hidden">
        <button onClick={() => zoomBy(1 / 1.5)} disabled={!zoomed} className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30" aria-label="הקטנה">
          <Minus size={17} />
        </button>
        <button onClick={() => zoomBy(1.5)} disabled={view.k >= MAX} className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30" aria-label="הגדלה">
          <Plus size={17} />
        </button>
        <button onClick={reset} disabled={!zoomed} className="flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-30">
          <Maximize size={14} /> כל התכנית
        </button>
        <span className="min-w-0 flex-1 truncate text-end text-[11px] text-slate-400">
          {cover > 1 && !deep ? "גוררים לצדדים · צביטה להגדלה" : zoomed ? "גוררים כדי לזוז בתכנית" : "צביטה או הקשה כפולה להגדלה"}
        </span>
      </div>
    </>
  );
}
