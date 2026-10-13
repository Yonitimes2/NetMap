"use client";

import type { ReactNode } from "react";
import { ArrowDown, X } from "lucide-react";

export function PanelHeader({ children, onClose, color }: { children: ReactNode; onClose: () => void; color?: string }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-100 bg-white px-4 py-3" style={color ? { borderTop: `3px solid ${color}` } : undefined}>
      <div className="min-w-0 flex-1">{children}</div>
      <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="סגור">
        <X size={18} />
      </button>
    </div>
  );
}

export function Section({ title, children, open = true, extra }: { title: string; children: ReactNode; open?: boolean; extra?: ReactNode }) {
  return (
    <details open={open} className="group border-b border-slate-100">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          {extra}
          <ArrowDown size={14} className="text-slate-400 transition group-open:rotate-180" />
        </span>
      </summary>
      <div className="space-y-3 px-4 pb-4">{children}</div>
    </details>
  );
}

