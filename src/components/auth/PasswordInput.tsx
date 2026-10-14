"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Input } from "../ui";

/** Password field with a show/hide toggle. */
export function PasswordInput(props: Omit<ComponentProps<"input">, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} dir="ltr" className="pl-9 text-right" />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShown((v) => !v)}
        className="absolute inset-y-0 left-0 grid w-9 place-items-center text-slate-400 hover:text-slate-700"
        aria-label={shown ? "הסתר סיסמה" : "הצג סיסמה"}
      >
        {shown ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

/** 14 characters without look-alikes (0/O, 1/l/I), for a first password the admin hands over. */
export function randomPassword() {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
