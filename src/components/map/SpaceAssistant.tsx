"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Crosshair, LoaderCircle, Plus, Send, Sparkles, Square, SquareDashed, Trash2, Undo2, X } from "lucide-react";
import { canUndoSpace, useApp } from "@/lib/store";
import { deviceTypeById } from "@/lib/catalog";
import { DEFAULT_PPM } from "@/lib/space-catalog";
import { fromMeters, toMeters } from "@/lib/space";
import type { AssistantReplyT, AssistantRequest, SpaceModelM } from "@/lib/space-schema";
import type { Stage, StreamEvent } from "@/lib/space-stream";
import type { Floor } from "@/lib/types";
import { cx } from "../ui";
import { useEditor, type SpacePreview } from "./editor-store";
import { floorBounds, refFromSelection } from "./refs";
import { askConfirm } from "../dialogs";

const EXAMPLES = [
  "משרד 20×12 מ׳. מסדרון באמצע לכל האורך, 4 משרדים בצד הצפוני, חדר שרתים בפינה הצפון-מזרחית. תקרה אקוסטית בגובה 2.7 עם חלל של 60 ס״מ. קירות פנים גבס",
  "חנות 8×15 עם ויטרינה לרחוב בצד הדרומי, מחסן 8×4 מאחור ושירותים. קירות בלוקים ותקרת בטון בגובה 3.2",
  "דירת 4 חדרים עם ממ״ד, סלון ומטבח פתוח, ומרפסת שמש של 12 מ״ר",
];

type ErrorInfo = { code: string; message: string };
type Outcome = { result: AssistantReplyT } | { error: ErrorInfo };

/** What the user sees while a request is running. */
interface Live {
  started: number;
  stage: Stage | "waiting";
  thinking: string;
  reply?: string;
  counts: { walls: number; openings: number; rooms: number; obstacles: number };
}

const STEPS: { stage: Stage; label: string; count?: keyof Live["counts"] }[] = [
  { stage: "thinking", label: "קורא את התיאור ומתכנן" },
  { stage: "walls", label: "מצייר קירות", count: "walls" },
  { stage: "openings", label: "מוסיף דלתות וחלונות", count: "openings" },
  { stage: "rooms", label: "מגדיר חדרים ותכונות", count: "rooms" },
  { stage: "obstacles", label: "עמודים, פירים ומדרגות", count: "obstacles" },
  { stage: "finishing", label: "מחיל על המפה" },
];
const stepIndex = (stage: Live["stage"]) =>
  stage === "reply" || stage === "waiting" ? 0 : Math.max(0, STEPS.findIndex((s) => s.stage === stage));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reads the newline-delimited JSON event stream from the server. */
async function readEvents(res: Response, onEvent: (e: StreamEvent) => void): Promise<Outcome> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let outcome: Outcome | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const e = JSON.parse(line) as StreamEvent;
      if (e.t === "done") outcome = { result: e.result };
      else if (e.t === "error") outcome = { error: { code: e.code, message: e.message } };
      else onEvent(e);
    }
  }
  return outcome ?? { error: { code: "cut", message: "החיבור נקטע לפני שהעוזר סיים. נסו שוב." } };
}

/**
 * Development bridge (opt-in): polls until a Claude Code session writes the answer,
 * passing along the progress events it posts while it works.
 */
async function waitForBridge(id: string, signal: AbortSignal, onEvent: (e: StreamEvent) => void): Promise<Outcome> {
  let since = 0;
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    await sleep(1500);
    signal.throwIfAborted();
    try {
      const res = await fetch(`/api/space-assistant?id=${encodeURIComponent(id)}&since=${since}`, { signal });
      const data = (await res.json()) as { result?: AssistantReplyT; error?: ErrorInfo; events?: StreamEvent[]; next?: number };
      for (const e of data.events ?? []) onEvent(e);
      since = data.next ?? since;
      if (data.result) return { result: data.result };
      if (!res.ok && data.error) return { error: data.error };
    } catch (e) {
      if (signal.aborted) throw e;
    }
  }
  return { error: { code: "timeout", message: "לא התקבלה תשובה תוך 10 דקות. ודאו ששיחת Claude Code פתוחה ונסו שוב." } };
}

function toPreview(floorId: string, sp: SpaceModelM, ppm: number): SpacePreview {
  return {
    floorId,
    walls: sp.walls.map((w) => ({
      a: { x: w.x1 * ppm, y: w.y1 * ppm },
      b: { x: w.x2 * ppm, y: w.y2 * ppm },
      type: w.type,
      thicknessCm: w.thicknessCm,
    })),
    rooms: sp.rooms.map((r) => ({ name: r.name, points: r.polygon.map((p) => ({ x: p.x * ppm, y: p.y * ppm })) })),
  };
}

function statsLine(sp: SpaceModelM) {
  return [
    `${sp.walls.length} קירות`,
    `${sp.openings.length} פתחים`,
    `${sp.rooms.length} חדרים`,
    sp.obstacles.length ? `${sp.obstacles.length} עמודים/פירים` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function SpaceAssistant({ floor, canEdit }: { floor: Floor; canEdit: boolean }) {
  const setOpen = useEditor((s) => s.setAssistantOpen);
  const setPreview = useEditor((s) => s.setPreview);
  const selection = useEditor((s) => s.selection);
  const refs = useEditor((s) => s.refs);
  const addRef = useEditor((s) => s.addRef);
  const removeRef = useEditor((s) => s.removeRef);
  const clearRefs = useEditor((s) => s.clearRefs);
  const pickMode = useEditor((s) => s.pickMode);
  const setPickMode = useEditor((s) => s.setPickMode);
  const fit = useEditor((s) => s.fit);
  const chat = useApp((s) => s.chats[floor.id]) ?? [];
  const addChatMessage = useApp((s) => s.addChatMessage);
  const clearChat = useApp((s) => s.clearChat);
  const applySpace = useApp((s) => s.applySpace);
  const undoSpace = useApp((s) => s.undoSpace);
  const updateFloor = useApp((s) => s.updateFloor);
  const site = useApp((s) => s.sites.find((x) => x.id === floor.siteId));
  const [input, setInput] = useState("");
  const [live, setLive] = useState<Live | null>(null);
  const [now, setNow] = useState(0);
  const [setupError, setSetupError] = useState<ErrorInfo | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);
  const busy = live !== null;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, live?.stage, live?.counts.walls]);

  // elapsed-time counter while working
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);

  // closing the panel / switching floors stops the request and clears the preview and markings
  useEffect(
    () => () => {
      abortRef.current?.abort();
      setPreview(null);
      setPickMode(null);
      clearRefs();
    },
    [setPreview, setPickMode, clearRefs],
  );

  const ppm = floor.pxPerMeter ?? DEFAULT_PPM;
  // the element selected on the map can be attached with one click
  const selectedRef = refFromSelection(selection, floor.id, ppm, floorBounds(floor));
  const canAttachSelection = !!selectedRef && !refs.some((r) => r.id === selectedRef.id);

  const onEvent = (e: StreamEvent) => {
    if (e.t === "stage") setLive((l) => l && { ...l, stage: e.stage });
    else if (e.t === "thinking") setLive((l) => l && { ...l, thinking: (l.thinking + e.text).slice(-6000) });
    else if (e.t === "progress") {
      setLive(
        (l) =>
          l && {
            ...l,
            stage: e.stage,
            reply: e.reply,
            counts: { walls: e.space.walls.length, openings: e.space.openings.length, rooms: e.space.rooms.length, obstacles: e.space.obstacles.length },
          },
      );
      if (e.space.walls.length || e.space.rooms.length) setPreview(toPreview(floor.id, e.space, ppm));
    }
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setSetupError(null);
    const started = Date.now();
    setNow(started);
    setLive({ started, stage: "thinking", thinking: "", counts: { walls: 0, openings: 0, rooms: 0, obstacles: 0 } });
    const sentRefs = refs.map((r, i) => ({
      n: i + 1,
      kind: r.kind,
      id: r.id,
      label: r.label,
      rect: r.rect && { x1: round(r.rect.x1 / ppm), y1: round(r.rect.y1 / ppm), x2: round(r.rect.x2 / ppm), y2: round(r.rect.y2 / ppm) },
    }));
    addChatMessage(floor.id, { role: "user", text: message, refs: sentRefs.map((r) => `#${r.n} ${r.label}`) });
    setPickMode(null);
    clearRefs();

    const st = useApp.getState();
    const parts = {
      walls: st.walls.filter((x) => x.floorId === floor.id),
      openings: st.openings.filter((x) => x.floorId === floor.id),
      areas: st.areas.filter((x) => x.floorId === floor.id),
      obstacles: st.obstacles.filter((x) => x.floorId === floor.id),
    };
    const wasEmpty = parts.walls.length === 0 && parts.areas.length === 0;
    const body: AssistantRequest = {
      siteName: site?.name ?? "",
      floorName: floor.name,
      space: toMeters(parts, ppm),
      devices: st.devices
        .filter((d) => d.floorId === floor.id)
        .map((d) => ({ label: d.label, type: deviceTypeById(d.type).label, x: round(d.x / ppm), y: round(d.y / ppm) })),
      refs: sentRefs.length ? sentRefs : undefined,
      history: chat
        .filter((m) => !m.error && !m.cancelled)
        .map((m) => ({
          role: m.role,
          text: [m.text, m.refs?.length ? `סימונים: ${m.refs.join(", ")}` : "", m.questions?.length ? `שאלות: ${m.questions.join(" | ")}` : ""]
            .filter(Boolean)
            .join("\n"),
        })),
      message,
      uncalibratedImage: !!floor.plan && !floor.pxPerMeter,
    };

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/space-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      let outcome: Outcome;
      if (res.headers.get("content-type")?.includes("ndjson")) {
        outcome = await readEvents(res, onEvent);
      } else {
        const data = (await res.json()) as { pending?: string; error?: ErrorInfo };
        if (res.status === 202 && data.pending) {
          setLive((l) => l && { ...l, stage: "waiting" });
          outcome = await waitForBridge(data.pending, ctrl.signal, onEvent);
        } else {
          outcome = { error: data.error ?? { code: "http", message: `שגיאה (${res.status})` } };
        }
      }

      if ("error" in outcome) {
        if (outcome.error.code === "no_key" || outcome.error.code === "auth") setSetupError(outcome.error);
        addChatMessage(floor.id, { role: "assistant", text: outcome.error.message, error: true });
        return;
      }
      const r = outcome.result;
      let undoId: string | undefined;
      if (r.space && canEdit) {
        const converted = fromMeters(r.space, ppm, {
          siteId: floor.siteId,
          floorId: floor.id,
          existingIds: new Set([...parts.walls, ...parts.openings, ...parts.areas, ...parts.obstacles].map((x) => x.id)),
          existingColors: new Map(parts.areas.map((a) => [a.id, a.color])),
        });
        if (!floor.pxPerMeter && !floor.plan) updateFloor(floor.id, { pxPerMeter: DEFAULT_PPM });
        undoId = applySpace(floor.id, converted);
        if (wasEmpty) setTimeout(fit, 50);
      }
      addChatMessage(floor.id, {
        role: "assistant",
        text: r.reply,
        questions: r.questions,
        undoId,
        stats: r.space ? statsLine(r.space) : undefined,
      });
    } catch {
      if (ctrl.signal.aborted) {
        addChatMessage(floor.id, { role: "assistant", text: "הבקשה בוטלה. שום דבר לא השתנה במפה.", cancelled: true });
      } else {
        addChatMessage(floor.id, { role: "assistant", text: "אין חיבור לשרת. בדקו את החיבור ונסו שוב.", error: true });
      }
    } finally {
      abortRef.current = null;
      setPreview(null);
      setLive(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <span className="grid size-8 place-items-center rounded-lg bg-violet-100 text-violet-700">
          <Sparkles size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">עוזר שטח</div>
          <div className="truncate text-xs text-slate-500">{floor.name}</div>
        </div>
        {chat.length > 0 && (
          <button
            title="נקה שיחה"
            onClick={async () =>
              (await askConfirm({ title: "ניקוי שיחה", message: "לנקות את השיחה? השטח שנבנה לא יימחק.", okLabel: "נקה" })) && clearChat(floor.id)
            }
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <Trash2 size={15} />
          </button>
        )}
        <button onClick={() => setOpen(false)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" aria-label="סגור">
          <X size={18} />
        </button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {chat.length === 0 && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              תארו את השטח במילים: מידות, חדרים, סוגי קירות, תקרה, חלונות ודלתות. העוזר יבנה את הקומה עם קנה מידה, ואחר כך אפשר לבקש תיקונים.
            </p>
            <p className="text-xs text-slate-500">אפשר גם לסמן קיר או חדר במפה ולכתוב, למשל: &quot;הקיר הזה בטון ואין בו השחלה&quot;.</p>
            <div className="space-y-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => setInput(ex)} className="block w-full rounded-xl bg-violet-50 p-3 text-start text-xs leading-relaxed text-violet-900 hover:bg-violet-100">
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.map((m) => (
          <div key={m.id} className={cx("flex", m.role === "user" ? "justify-start" : "justify-end")}>
            <div
              className={cx(
                "max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                m.role === "user"
                  ? "bg-slate-900 text-white"
                  : m.error
                    ? "bg-red-50 text-red-800"
                    : m.cancelled
                      ? "bg-slate-100 text-slate-500"
                      : "bg-violet-50 text-slate-800",
              )}
            >
              {m.refs && m.refs.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1">
                  {m.refs.map((r) => (
                    <span key={r} className="rounded-full bg-white/15 px-2 py-0.5 text-[11px]">
                      {r}
                    </span>
                  ))}
                </div>
              )}
              {m.text}
              {m.stats && <div className="mt-1.5 text-[11px] font-medium text-violet-700">✓ {m.stats}</div>}
              {m.questions && m.questions.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 ps-4 text-[13px] text-violet-900">
                  {m.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              )}
              {m.undoId && canUndoSpace(m.undoId) && (
                <button
                  onClick={() => {
                    undoSpace(m.undoId!);
                    force((n) => n + 1);
                  }}
                  className="mt-2 flex items-center gap-1 text-xs text-violet-700 hover:underline"
                >
                  <Undo2 size={12} /> בטל את השינוי הזה
                </button>
              )}
            </div>
          </div>
        ))}
        {live && <LiveProgress live={live} now={now} onCancel={() => abortRef.current?.abort()} />}
        {setupError && <SetupHelp err={setupError} />}
      </div>

      <div className="border-t border-slate-100 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500">סמנו לעוזר:</span>
          <button
            onClick={() => setPickMode(pickMode === "object" ? null : "object")}
            className={cx(
              "flex items-center gap-1 rounded-full px-2.5 py-1 ring-1",
              pickMode === "object" ? "bg-violet-600 text-white ring-violet-600" : "bg-white text-violet-700 ring-violet-200 hover:bg-violet-50",
            )}
          >
            <Crosshair size={12} /> אובייקט
          </button>
          <button
            onClick={() => setPickMode(pickMode === "region" ? null : "region")}
            className={cx(
              "flex items-center gap-1 rounded-full px-2.5 py-1 ring-1",
              pickMode === "region" ? "bg-violet-600 text-white ring-violet-600" : "bg-white text-violet-700 ring-violet-200 hover:bg-violet-50",
            )}
          >
            <SquareDashed size={12} /> אזור
          </button>
          {canAttachSelection && (
            <button onClick={() => addRef(selectedRef!)} className="flex max-w-full items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-blue-800 hover:bg-blue-100">
              <Plus size={12} /> <span className="truncate">{selectedRef!.label}</span>
            </button>
          )}
        </div>
        {refs.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {refs.map((r, i) => (
              <span key={i} className="flex max-w-full items-center gap-1 rounded-full bg-violet-100 py-0.5 pe-1 ps-2 text-xs text-violet-900">
                <b>#{i + 1}</b>
                <span className="truncate">{r.label}</span>
                <button onClick={() => removeRef(i)} className="rounded-full p-0.5 hover:bg-violet-200" aria-label="הסר סימון">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        {!canEdit && <p className="mb-2 text-xs text-amber-700">אין לך הרשאת עריכה, ולכן שינויים לא יוחלו על המפה.</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            placeholder={refs.length ? "למשל: הזז את #1 לצד הצפוני של #2" : "תארו את השטח או בקשו שינוי…"}
            className="max-h-40 min-h-[44px] flex-1 resize-y rounded-xl bg-slate-50 px-3 py-2 text-sm outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-violet-500"
          />
          <button
            onClick={() => void send(input)}
            disabled={!input.trim() || busy}
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-600 text-white disabled:opacity-40"
            aria-label="שלח"
          >
            <Send size={18} className="-scale-x-100" />
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveProgress({ live, now, onCancel }: { live: Live; now: number; onCancel: () => void }) {
  const [showThinking, setShowThinking] = useState(false);
  const secs = Math.max(0, Math.round((now - live.started) / 1000));
  const current = stepIndex(live.stage);
  const thinkingTail = live.thinking.trim().split("\n").filter(Boolean).slice(-2).join(" ");

  if (live.stage === "waiting") {
    return (
      <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
        <div className="flex items-center gap-2">
          <LoaderCircle size={15} className="animate-spin text-slate-500" />
          <span className="flex-1">ממתין לתשובה מ-Claude Code… {secs} שנ׳</span>
          <CancelButton onCancel={onCancel} />
        </div>
        {secs > 45 && (
          <p className="mt-2 text-xs text-amber-700">
            Claude Code עוד לא אישר שקיבל את הבקשה. ודאו שהשיחה איתו פתוחה, או בטלו ונסו שוב.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-violet-50 p-3 text-sm ring-1 ring-violet-100">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex-1 font-semibold text-violet-900">העוזר בונה את השטח · {secs} שנ׳</span>
        <CancelButton onCancel={onCancel} />
      </div>
      <ol className="space-y-1">
        {STEPS.map((step, i) => {
          const state = i < current ? "done" : i === current ? "active" : "todo";
          const n = step.count ? live.counts[step.count] : 0;
          return (
            <li key={step.stage} className={cx("flex items-center gap-2", state === "todo" ? "text-slate-400" : "text-slate-800")}>
              <span className="grid size-4 place-items-center">
                {state === "done" ? (
                  <Check size={14} className="text-green-600" />
                ) : state === "active" ? (
                  <LoaderCircle size={14} className="animate-spin text-violet-600" />
                ) : (
                  <span className="size-1.5 rounded-full bg-slate-300" />
                )}
              </span>
              <span className={cx(state === "active" && "font-medium text-violet-900")}>{step.label}</span>
              {step.count && n > 0 && <span className="text-xs text-violet-700">({n})</span>}
            </li>
          );
        })}
      </ol>
      {live.thinking.trim() && (
        <div className="mt-2 border-t border-violet-100 pt-2">
          <button onClick={() => setShowThinking((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-violet-700">
            <ChevronDown size={12} className={cx("transition", showThinking && "rotate-180")} />
            מה העוזר חושב
          </button>
          <p dir="auto" className={cx("mt-1 text-xs leading-relaxed text-slate-600", showThinking ? "max-h-48 overflow-y-auto whitespace-pre-wrap" : "line-clamp-2")}>
            {showThinking ? live.thinking.trim() : thinkingTail}
          </p>
        </div>
      )}
      {live.reply && <p className="mt-2 border-t border-violet-100 pt-2 text-slate-700">{live.reply}</p>}
      {live.counts.walls > 0 && <p className="mt-2 text-[11px] text-violet-700">הקירות בסגול במפה הם טיוטה, והם יישמרו כשהעוזר יסיים.</p>}
    </div>
  );
}

function CancelButton({ onCancel }: { onCancel: () => void }) {
  return (
    <button onClick={onCancel} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
      <Square size={10} className="fill-current" /> בטל
    </button>
  );
}

function SetupHelp({ err }: { err: ErrorInfo }) {
  return (
    <div className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200">
      <div className="mb-1 font-semibold">{err.code === "auth" ? "מפתח ה-API לא התקבל" : "צריך להגדיר מפתח API כדי להפעיל את העוזר"}</div>
      <ol className="list-decimal space-y-1 ps-4">
        <li>
          נכנסים ל-<span className="ltr font-mono">console.anthropic.com</span> ויוצרים מפתח API (Settings → API Keys).
        </li>
        <li>
          בתיקיית הפרויקט פותחים את הקובץ <span className="ltr font-mono">.env.local</span> ומדביקים את המפתח בשורה{" "}
          <span className="ltr font-mono">ANTHROPIC_API_KEY=</span>
        </li>
        <li>מפעילים מחדש את שרת הפיתוח.</li>
      </ol>
    </div>
  );
}

const round = (v: number) => Math.round(v * 100) / 100;
