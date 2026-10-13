"use client";

import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { Button, Input, Modal } from "./ui";

/**
 * In-app replacements for window.prompt / confirm / alert, which are blocked in some
 * embedded browsers and installed PWAs. Usage: `const name = await askText({...})`.
 */

type Dialog =
  | { kind: "text"; title: string; label?: string; value: string; inputMode?: "text" | "decimal"; resolve: (v: string | null) => void }
  | { kind: "confirm"; title: string; message: string; danger?: boolean; okLabel?: string; resolve: (v: boolean) => void }
  | { kind: "alert"; title: string; message: string; resolve: () => void };

const useDialogs = create<{ current: Dialog | null }>(() => ({ current: null }));

export function askText(opts: { title: string; label?: string; value?: string; inputMode?: "text" | "decimal" }) {
  return new Promise<string | null>((resolve) =>
    useDialogs.setState({ current: { kind: "text", value: "", ...opts, resolve } }),
  );
}

export function askConfirm(opts: { title: string; message: string; danger?: boolean; okLabel?: string }) {
  return new Promise<boolean>((resolve) => useDialogs.setState({ current: { kind: "confirm", ...opts, resolve } }));
}

export function showAlert(title: string, message: string) {
  return new Promise<void>((resolve) => useDialogs.setState({ current: { kind: "alert", title, message, resolve } }));
}

export function DialogHost() {
  const d = useDialogs((s) => s.current);
  if (!d) return null;
  return <DialogView key={d.title + d.kind} d={d} />;
}

function DialogView({ d }: { d: Dialog }) {
  const [value, setValue] = useState(d.kind === "text" ? d.value : "");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const close = (result: "ok" | "cancel") => {
    useDialogs.setState({ current: null });
    if (d.kind === "text") d.resolve(result === "ok" ? value : null);
    else if (d.kind === "confirm") d.resolve(result === "ok");
    else d.resolve();
  };

  return (
    <Modal
      title={d.title}
      onClose={() => close("cancel")}
      footer={
        <>
          <Button
            variant={d.kind === "confirm" && d.danger ? "danger" : "primary"}
            onClick={() => close("ok")}
            disabled={d.kind === "text" && !value.trim()}
          >
            {d.kind === "confirm" ? (d.okLabel ?? "אישור") : d.kind === "alert" ? "הבנתי" : "אישור"}
          </Button>
          {d.kind !== "alert" && (
            <Button variant="ghost" onClick={() => close("cancel")}>
              ביטול
            </Button>
          )}
        </>
      }
    >
      {d.kind === "text" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) close("ok");
          }}
        >
          {d.label && <p className="mb-2 text-sm text-slate-600">{d.label}</p>}
          <Input ref={inputRef} autoFocus value={value} inputMode={d.inputMode} onChange={(e) => setValue(e.target.value)} />
        </form>
      ) : (
        <p className="text-sm text-slate-700">{d.message}</p>
      )}
    </Modal>
  );
}
