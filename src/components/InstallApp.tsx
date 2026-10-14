"use client";

import { Share, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useIsPhone, useStandalone } from "@/lib/use-media";
import { Button } from "./ui";

/** Chrome / Android offers its own install dialog through this event; keep it for the button. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
}

const isIos = () =>
  typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const DISMISS_KEY = "netmap-install-dismissed";
const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * How to add NetMap to the home screen, so it opens full screen like an app.
 * "banner": on the home page, phones only, until dismissed. "card": always, on the account page.
 */
export function InstallApp({ variant }: { variant: "banner" | "card" }) {
  const phone = useIsPhone();
  const standalone = useStandalone();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [canPrompt, setCanPrompt] = useState(() => !!deferred);

  useEffect(() => {
    const l = () => setCanPrompt(!!deferred);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  if (variant === "banner" && (!phone || standalone || dismissed)) return null;

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    setCanPrompt(false);
  };

  const steps = standalone ? (
    <p className="text-sm text-slate-600">NetMap מותקנת במכשיר הזה ונפתחת כמו אפליקציה.</p>
  ) : canPrompt ? (
    <Button variant="primary" onClick={install}>
      <Smartphone size={16} /> התקנה במכשיר
    </Button>
  ) : isIos() ? (
    <ol className="list-inside list-decimal space-y-1 text-sm text-slate-600">
      <li>
        פתחו את האתר ב-Safari ולחצו על כפתור השיתוף <Share size={14} className="inline align-text-bottom" />
      </li>
      <li>בחרו ״הוספה למסך הבית״ ואז ״הוסף״</li>
    </ol>
  ) : (
    <ol className="list-inside list-decimal space-y-1 text-sm text-slate-600">
      <li>פתחו את התפריט של הדפדפן (שלוש הנקודות)</li>
      <li>בחרו ״התקנת אפליקציה״ או ״הוספה למסך הבית״</li>
    </ol>
  );

  if (variant === "card") {
    return (
      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <Smartphone size={18} className="text-slate-400" /> אפליקציה בנייד
        </h2>
        <p className="mb-3 text-sm text-slate-500">כשמוסיפים את NetMap למסך הבית היא נפתחת במסך מלא, בלי שורת הכתובת, כמו אפליקציה רגילה.</p>
        {steps}
      </section>
    );
  }

  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-white">
        <Smartphone size={20} />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="font-medium">התקינו את NetMap כאפליקציה</div>
        {steps}
      </div>
      <button
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, "1");
          } catch {
            // private mode: hide it for now only
          }
          setDismissed(true);
        }}
        className="-m-1 rounded p-2 text-slate-400 hover:bg-slate-100"
        aria-label="לא עכשיו"
      >
        <X size={18} />
      </button>
    </div>
  );
}
