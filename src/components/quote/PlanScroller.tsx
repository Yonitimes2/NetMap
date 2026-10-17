"use client";

import { MoveHorizontal } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * The plan a little wider than the page, scrolled sideways: by finger or trackpad, or by dragging
 * with the mouse. It opens in the middle. Printed, it fits the page again.
 */
export function PlanScroller({ children, tall }: { children: ReactNode; tall?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, []);

  return (
    <>
      <div
        ref={ref}
        // left-to-right inside, so scrolling works the same in every browser
        dir="ltr"
        className="no-scrollbar cursor-grab overflow-x-auto overscroll-x-contain active:cursor-grabbing print:overflow-visible"
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || !ref.current) return;
          drag.current = { x: e.clientX, left: ref.current.scrollLeft };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current && ref.current) ref.current.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {/* phones: well wider than the screen; larger screens: a bit wider; tall plans less so */}
        <div className={tall ? "w-[125%] sm:w-[110%] print:!w-full" : "w-[170%] sm:w-[130%] print:!w-full"}>{children}</div>
      </div>
      <p className="flex items-center justify-center gap-1.5 border-t border-slate-100 py-1.5 text-[11px] text-slate-400 print:hidden">
        <MoveHorizontal size={13} /> גוללים לצדדים כדי לראות את כל התכנית
      </p>
    </>
  );
}
