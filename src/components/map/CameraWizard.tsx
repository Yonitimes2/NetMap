"use client";

import { AlertTriangle, Check, Crosshair, Lightbulb, Package, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApp } from "@/lib/store";
import { DEFAULT_PPM } from "@/lib/space-catalog";
import { productPatch, systemBrand, useCatalog } from "@/lib/products/client";
import {
  NIGHTS,
  PURPOSES,
  fmtM,
  placeFacts,
  purposeById,
  suggestCameras,
  type CameraNeeds,
  type Night,
  type PlaceFacts,
  type Purpose,
  type Suggestion,
} from "@/lib/products/suggest";
import type { ProductSummary } from "@/lib/products/types";
import { toast } from "@/lib/toast";
import { useCoarsePointer, useIsPhone } from "@/lib/use-media";
import type { Device } from "@/lib/types";
import { Button, Input, cx } from "../ui";
import { BoxIcons } from "../catalog/ProductIcons";
import { ProductPicker } from "../catalog/ProductPicker";
import { useEditor } from "./editor-store";
import { PanelHeader } from "./panel-ui";

type Step = "aim" | "ask" | "results";
const STEP_TITLE: Record<Step, string> = { aim: "כיוון המצלמה", ask: "מה צריך לראות", results: "מצלמות מתאימות" };
const STEP_N: Record<Step, number> = { aim: 1, ask: 2, results: 3 };

/** Facts the user can correct when the map is wrong or doesn't know. */
type FactKey = "outdoor" | "wet" | "vandal" | "backlight" | "noPower";

/**
 * Suggesting a camera for a spot: aim it on the map (where it looks, how far and how wide),
 * answer what it has to show there, and pick from the catalog cameras that fit, with the reasons.
 */
export function CameraWizard({ d, siteDevices, onChange }: { d: Device; siteDevices: Device[]; onChange: (patch: Partial<Device>) => void }) {
  const floor = useApp((s) => s.floors.find((f) => f.id === d.floorId));
  const areas = useApp((s) => s.areas);
  const setAim = useEditor((s) => s.setAim);
  const setSheet = useEditor((s) => s.setSheet);
  const coarse = useCoarsePointer();
  const phone = useIsPhone();
  const { products, error, loading, load } = useCatalog();
  const [step, setStep] = useState<Step>("aim");
  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const [night, setNight] = useState<Night>("bw");
  const [over, setOver] = useState<Partial<Pick<PlaceFacts, FactKey>>>({});
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);
  // phones: a low sheet while aiming, so the map shows; a tall one for the questions and the list.
  // Each step starts at its top.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSheet(step === "aim" ? "peek" : "full");
    rootRef.current?.parentElement?.closest(".overflow-y-auto")?.scrollTo({ top: 0 });
  }, [step, setSheet]);

  const cam = d.camera ?? { dir: 0, fov: 90, range: 10 };
  // the scale the map draws the cone with
  const ppm = floor?.pxPerMeter ?? (floor?.plan ? 40 : DEFAULT_PPM);
  const uncalibrated = !!floor?.plan && !floor.pxPerMeter;
  const known = useMemo(() => placeFacts(d, areas, ppm), [d, areas, ppm]);
  const fact = <K extends FactKey>(k: K) => (over[k] ?? known[k]) as PlaceFacts[K];
  const outdoor = fact("outdoor");

  const needs: CameraNeeds | null =
    purpose && outdoor !== undefined
      ? {
          distanceM: cam.range,
          angleDeg: cam.fov,
          purpose,
          night,
          outdoor,
          wet: fact("wet"),
          vandal: fact("vandal"),
          backlight: fact("backlight"),
          noPower: fact("noPower"),
          ceiling: !outdoor && (known.ceiling || !known.here),
          brand: systemBrand(siteDevices.filter((x) => x.id !== d.id)) ?? undefined,
        }
      : null;
  // a couple of hundred cameras: cheap enough to check on every render of the list
  const result = step === "results" && needs && products ? suggestCameras(products, needs) : null;

  const exit = () => {
    setAim(null);
    setSheet("half");
  };

  const choose = (p: ProductSummary, fov?: number) => {
    const patch = productPatch(d, p);
    // keep where it was aimed; a zoom lens gets the angle that was asked for
    patch.camera = { dir: cam.dir, range: cam.range, fov: fov ?? patch.camera?.fov ?? cam.fov };
    onChange(patch);
    exit();
    toast(`נבחר דגם ${p.model}. השדות מולאו מהמאגר, ואפשר לשנות אותם.`);
  };

  const width = cam.fov < 170 ? 2 * cam.range * Math.tan((cam.fov * Math.PI) / 360) : null;

  return (
    <div ref={rootRef} className="flex min-h-full flex-col">
      <PanelHeader onClose={exit} color="#dc2626">
        <div className="flex items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">
            <Crosshair size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] text-slate-400">
              הצעת מצלמה · שלב {STEP_N[step]} מתוך 3 · {d.label}
            </div>
            <div className="font-semibold">{STEP_TITLE[step]}</div>
          </div>
          {/* phones: the aiming sheet is low, so its button sits up here */}
          {phone && step === "aim" && (
            <Button size="sm" variant="primary" onClick={() => setStep("ask")}>
              המשך
            </Button>
          )}
        </div>
      </PanelHeader>

      <div className="flex-1 space-y-3 p-4">
        {step === "aim" && (
          <>
            {/* phones: the low sheet keeps the map in view, and the numbers show on the map next to the tip */}
            {!phone && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="מרחק" value={`${fmtM(cam.range)} מ׳`} />
                <Stat label="זווית" value={`${Math.round(cam.fov)}°`} />
                <Stat label="רוחב בקצה" value={width ? `${fmtM(width)} מ׳` : "—"} />
              </div>
            )}
            <p className="text-sm text-slate-600">
              {coarse ? "געו" : "לחצו"} במפה בנקודה הרחוקה ביותר שהמצלמה צריכה לראות.
              <span className="block text-xs text-slate-500">את הרוחב משנים בעיגולים הלבנים בשולי האלומה.</span>
            </p>
            {uncalibrated && (
              <p className="flex gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                קנה המידה של התוכנית לא כויל, אז המרחקים משוערים. כדאי לכייל בכלי &quot;כיול&quot; לפני הבחירה.
              </p>
            )}
            <details className="rounded-xl bg-slate-50 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-slate-600">כיוון מדויק</summary>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">מרחק (מטר)</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    step={0.5}
                    value={cam.range}
                    onChange={(e) => onChange({ camera: { ...cam, range: Math.max(1, +e.target.value || 1) } })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">זווית: {Math.round(cam.fov)}°</span>
                  <input type="range" min={5} max={180} value={Math.min(180, cam.fov)} onChange={(e) => onChange({ camera: { ...cam, fov: +e.target.value } })} className="h-10 w-full accent-red-600" />
                </label>
              </div>
            </details>
          </>
        )}

        {step === "ask" && (
          <>
            <div className="space-y-2 rounded-xl bg-slate-50 p-3">
              <div className="text-xs font-semibold text-slate-600">
                מה ידוע מהמפה
                {known.here && (
                  <span className="font-normal text-slate-500">
                    {" "}
                    · {known.here}
                    {known.target ? ` ← ${known.target}` : ""}
                  </span>
                )}
              </div>
              <div className={cx("flex gap-1 rounded-lg p-0.5", outdoor === undefined ? "bg-amber-100 ring-1 ring-amber-300" : "bg-slate-200/60")}>
                {(
                  [
                    [false, "בפנים"],
                    [true, "בחוץ"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={label}
                    onClick={() => setOver({ ...over, outdoor: v })}
                    className={cx("h-9 flex-1 rounded-md text-sm", outdoor === v ? "bg-white font-semibold shadow-sm" : "text-slate-600")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {outdoor === undefined && <p className="text-xs text-amber-800">המצלמה לא בתוך חדר מסומן. בפנים או בחוץ?</p>}
              <div className="flex flex-wrap gap-1.5">
                <Toggle on={fact("wet")} onClick={() => setOver({ ...over, wet: !fact("wet") })}>
                  גשם / לחות
                </Toggle>
                <Toggle on={fact("backlight")} onClick={() => setOver({ ...over, backlight: !fact("backlight") })}>
                  שמש / אור נגדי
                </Toggle>
                <Toggle on={fact("vandal")} onClick={() => setOver({ ...over, vandal: !fact("vandal") })}>
                  סיכון ונדליזם
                </Toggle>
                <Toggle on={fact("noPower")} onClick={() => setOver({ ...over, noPower: !fact("noPower") })}>
                  אין חשמל בנקודה
                </Toggle>
              </div>
            </div>

            <Question title="מה צריך לראות שם?">
              {PURPOSES.map((p) => (
                <Option key={p.id} active={purpose === p.id} onClick={() => setPurpose(p.id)} label={p.label} hint={p.hint} />
              ))}
            </Question>

            <Question title={known.dark ? "בלילה (המקום חשוך בלילה)" : "בלילה?"}>
              <div className="flex gap-1 rounded-lg bg-slate-200/60 p-0.5">
                {NIGHTS.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setNight(n.id)}
                    className={cx("h-10 flex-1 rounded-md px-1 text-sm", night === n.id ? "bg-white font-semibold shadow-sm" : "text-slate-600")}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            </Question>
          </>
        )}

        {step === "results" && needs && (
          <>
            <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              <span className="flex-1">
                <b className="text-slate-800">{purposeById(needs.purpose).label}</b> ב-{fmtM(needs.distanceM)} מ׳ · זווית {Math.round(needs.angleDeg)}° · {needs.outdoor ? "בחוץ" : "בפנים"} · לילה:{" "}
                {NIGHTS.find((n) => n.id === needs.night)?.label}
              </span>
              <button onClick={() => setStep("ask")} className="shrink-0 font-medium text-blue-700">
                שינוי
              </button>
            </div>
            {error ? (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>
            ) : !products || loading ? (
              <p className="p-6 text-center text-sm text-slate-400">טוען את מאגר המוצרים…</p>
            ) : !result?.checked ? (
              <p className="p-6 text-center text-sm text-slate-500">אין עדיין במאגר מצלמות עם הנתונים שצריך לחישוב.</p>
            ) : (
              <>
                {result.advice.length > 0 && (
                  <div className="space-y-1.5 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                    {result.advice.map((a) => (
                      <p key={a} className="flex gap-2">
                        <Lightbulb size={15} className="mt-0.5 shrink-0" />
                        {a}
                      </p>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  נבדקו {result.checked} מצלמות מהמאגר. {result.list.some((x) => x.level !== "weak") ? "הכי מתאימות קודם:" : ""}
                </p>
                <div className="space-y-2">
                  {result.list.map((sg) => (
                    <SuggestionCard key={sg.p.id} sg={sg} onChoose={() => choose(sg.p, sg.fov)} />
                  ))}
                </div>
                <button onClick={() => setPicking(true)} className="w-full py-2 text-center text-sm font-medium text-blue-700">
                  לא מצאתם? לכל הדגמים במאגר
                </button>
              </>
            )}
          </>
        )}
      </div>

      <div className={cx("sticky bottom-0 flex gap-2 border-t border-slate-100 bg-white px-4 py-3", phone && step === "aim" && "hidden")}>
        {step === "aim" && (
          <>
            <Button variant="primary" className="flex-1" onClick={() => setStep("ask")}>
              המשך
            </Button>
            <Button variant="ghost" onClick={exit}>
              ביטול
            </Button>
          </>
        )}
        {step === "ask" && (
          <>
            <Button variant="primary" className="flex-1" disabled={!needs} onClick={() => setStep("results")}>
              {!purpose ? "בחרו מה צריך לראות" : outdoor === undefined ? "בחרו בפנים או בחוץ" : "הצגת מצלמות מתאימות"}
            </Button>
            <Button variant="ghost" onClick={() => setStep("aim")}>
              חזרה
            </Button>
          </>
        )}
        {step === "results" && (
          <>
            <Button className="flex-1" onClick={() => setStep("aim")}>
              <Crosshair size={15} /> כיוון מחדש
            </Button>
            <Button variant="ghost" onClick={exit}>
              סגירה
            </Button>
          </>
        )}
      </div>

      {picking && (
        <ProductPicker
          deviceType={d.type}
          siteDevices={siteDevices}
          current={d.product?.id}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            setPicking(false);
            choose(p);
          }}
        />
      )}
    </div>
  );
}

const LEVEL: Record<Suggestion["level"], { label: string; className: string }> = {
  good: { label: "מתאימה", className: "bg-green-50 text-green-700" },
  ok: { label: "מתאימה, עם הערות", className: "bg-blue-50 text-blue-700" },
  weak: { label: "מתאימה חלקית", className: "bg-amber-50 text-amber-800" },
};

function SuggestionCard({ sg, onChoose }: { sg: Suggestion; onChoose: () => void }) {
  const { p } = sg;
  const level = LEVEL[sg.level];
  return (
    <div className={cx("rounded-xl p-3 ring-1", sg.level === "good" ? "ring-green-200" : "ring-slate-200")}>
      <div className="flex gap-3">
        <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-50">
          {p.imageId ? (
            // eslint-disable-next-line @next/next/no-img-element -- served by our API with the session cookie
            <img src={`/api/catalog/images/${p.imageId}?w=160`} alt="" loading="lazy" className="size-full object-contain" />
          ) : (
            <Package size={20} className="text-slate-300" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="ltr truncate text-sm font-semibold">{p.model}</span>
            <span className="shrink-0 text-[11px] text-slate-400">{p.brandName}</span>
          </div>
          <div className="line-clamp-1 text-xs text-slate-500">{p.name}</div>
          <span className={cx("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium", level.className)}>{level.label}</span>
        </div>
      </div>
      {p.boxIcons.length > 0 && (
        <div className="mt-2">
          <BoxIcons icons={p.boxIcons} />
        </div>
      )}
      <ul className="mt-2 space-y-1 text-xs">
        {sg.misses.map((t) => (
          <Line key={t} icon={<X size={13} />} className="text-red-700">
            {t}
          </Line>
        ))}
        {sg.notes.map((t) => (
          <Line key={t} icon={<AlertTriangle size={13} />} className="text-amber-800">
            {t}
          </Line>
        ))}
        {sg.pros.map((t) => (
          <Line key={t} icon={<Check size={13} />} className="text-green-800">
            {t}
          </Line>
        ))}
      </ul>
      {sg.setFov && <p className="mt-2 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs text-blue-800">עדשה משתנה: לכוון אותה ל-{sg.setFov}° בהתקנה.</p>}
      <Button size="sm" variant={sg.level === "weak" ? "secondary" : "primary"} className="mt-2 w-full" onClick={onChoose}>
        בחירת הדגם
      </Button>
    </div>
  );
}

function Line({ icon, className, children }: { icon: ReactNode; className: string; children: ReactNode }) {
  return (
    <li className={cx("flex gap-1.5", className)}>
      <span className="mt-px shrink-0">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-red-50 px-2 py-2">
      <div className="text-[11px] text-red-700/70">{label}</div>
      <div className="font-semibold text-red-800">{value}</div>
    </div>
  );
}

function Question({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      {children}
    </div>
  );
}

function Option({ active, onClick, label, hint }: { active: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button onClick={onClick} className={cx("flex w-full items-center gap-3 rounded-xl p-2.5 text-start ring-1", active ? "bg-blue-50 ring-blue-400" : "ring-slate-200 hover:bg-slate-50")}>
      <span className={cx("grid size-5 shrink-0 place-items-center rounded-full ring-2", active ? "bg-blue-600 ring-blue-600" : "ring-slate-300")}>
        {active && <span className="size-2 rounded-full bg-white" />}
      </span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </button>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={cx("flex h-9 items-center gap-1 rounded-full px-3 text-sm ring-1 sm:h-8", on ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200")}>
      {on && <Check size={13} />}
      {children}
    </button>
  );
}
