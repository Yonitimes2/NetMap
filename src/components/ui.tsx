"use client";

import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, type ButtonHTMLAttributes, type ComponentProps, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");
export { cx };

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
        // a little taller on phones, for fingers
        size === "sm" ? "h-9 px-2.5 text-sm sm:h-8" : "h-11 px-4 text-sm sm:h-10",
        variant === "primary" && "bg-slate-900 text-white hover:bg-slate-700",
        variant === "secondary" && "bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100",
        variant === "danger" && "bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50",
        className,
      )}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={cx(
        "h-10 w-full rounded-lg bg-white px-2.5 text-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400 sm:h-9",
        className,
      )}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "w-full rounded-lg bg-white px-2.5 py-2 text-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-blue-500",
        className,
      )}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        "h-10 w-full rounded-lg bg-white px-2 text-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-blue-500 sm:h-9",
        className,
      )}
    >
      {children}
    </select>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // rendered at the top of the page, so no panel or tool bar (with its own stacking) can end up above it
  return createPortal(
    // phones: a sheet from the bottom; the header and the buttons stay put while the content scrolls
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onPointerDown={onClose}>
      <div
        className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-md sm:rounded-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-300 sm:hidden" />
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="-m-1 rounded p-2 text-slate-400 hover:bg-slate-100" aria-label="סגור">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" style={footer ? undefined : { paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 justify-start gap-2 border-t border-slate-100 px-4 pt-3 max-sm:[&>*]:flex-1" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function Badge({ children, color = "slate" }: { children: ReactNode; color?: "slate" | "blue" | "amber" | "green" | "red" }) {
  const map = {
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-700",
  };
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", map[color])}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>;
}
