"use client";

import { Printer } from "lucide-react";

/** Print, or save as PDF from the print dialog. Not on the printed page itself. */
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 print:hidden"
    >
      <Printer size={16} /> הדפסה / PDF
    </button>
  );
}
