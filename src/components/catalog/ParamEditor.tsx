"use client";

import { useState } from "react";
import { Button, Input, Select } from "../ui";
import type { Dori, ParamField } from "@/lib/products/types";

/** Inline editor for one planning parameter (catalog product page, and a device on the map). */
export function ParamEditor({ field: f, value, onSave, onCancel }: { field: ParamField; value: unknown; onSave: (v: unknown) => void; onCancel: () => void }) {
  const [v, setV] = useState<unknown>(value);
  const numIn = (x: unknown, set: (n: number | undefined) => void, ph?: string) => (
    <Input type="number" inputMode="decimal" step="any" placeholder={ph} value={x === undefined || x === null ? "" : String(x)} onChange={(e) => set(e.target.value === "" ? undefined : Number(e.target.value))} />
  );
  let input: React.ReactNode;
  switch (f.kind) {
    case "number":
      input = numIn(v, setV);
      break;
    case "text":
      input = <Input value={(v as string) ?? ""} onChange={(e) => setV(e.target.value)} />;
      break;
    case "bool":
      input = (
        <Select value={v === true ? "1" : v === false ? "0" : ""} onChange={(e) => setV(e.target.value === "" ? undefined : e.target.value === "1")}>
          <option value="">—</option>
          <option value="1">כן</option>
          <option value="0">לא</option>
        </Select>
      );
      break;
    case "select":
      input = (
        <Select value={(v as string) ?? ""} onChange={(e) => setV(e.target.value || undefined)}>
          <option value="">—</option>
          {f.options.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
      );
      break;
    case "list":
      input = <Input value={Array.isArray(v) ? v.join(", ") : ""} placeholder="מופרדים בפסיקים" onChange={(e) => setV(e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} />;
      break;
    case "range": {
      const r = (v as [number, number] | undefined) ?? [undefined, undefined];
      input = (
        <div className="flex gap-2">
          {numIn(r[0], (n) => setV([n, r[1] ?? n]), "מ-")}
          {numIn(r[1], (n) => setV([r[0] ?? n, n]), "עד")}
        </div>
      );
      break;
    }
    case "dori": {
      const d = (v as Dori | undefined) ?? {};
      input = (
        <div className="grid grid-cols-3 gap-2">
          {numIn(d.detect, (n) => setV({ ...d, detect: n }), "גילוי")}
          {numIn(d.recognize, (n) => setV({ ...d, recognize: n }), "זיהוי")}
          {numIn(d.identify, (n) => setV({ ...d, identify: n }), "ודאי")}
        </div>
      );
      break;
    }
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2">
      <div className="min-w-0 flex-1">{input}</div>
      <Button size="sm" variant="primary" onClick={() => onSave(v === undefined ? null : v)}>
        שמירה
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        ביטול
      </Button>
    </div>
  );
}
