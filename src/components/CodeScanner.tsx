"use client";

import { Flashlight, FlashlightOff, ScanBarcode, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { readCode, type ScannedCode } from "@/lib/scan-codes";
import { cx } from "./ui";

/** The browser's own barcode reader (Chrome on Android); not in the DOM typings yet. */
interface NativeDetector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type NativeDetectorClass = {
  new (opts: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
};

const FORMATS = ["code_128", "code_39", "code_93", "ean_13", "ean_8", "upc_a", "itf", "qr_code", "data_matrix"];
/** how often a frame is read */
const EVERY_MS = 250;

/** Reads one frame: the browser's reader where there is one, else ZXing (loaded only when scanning). */
async function makeReader(): Promise<(video: HTMLVideoElement) => Promise<string[]>> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (Native) {
    const supported = await Native.getSupportedFormats().catch(() => [] as string[]);
    const formats = FORMATS.filter((f) => supported.includes(f));
    if (formats.length) {
      const detector = new Native({ formats });
      return async (video) => (await detector.detect(video)).map((b) => b.rawValue);
    }
  }
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
  const hints = new Map<number, unknown>([
    [
      DecodeHintType.POSSIBLE_FORMATS,
      [
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.ITF,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX,
      ],
    ],
    [DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new BrowserMultiFormatReader(hints as never);
  const canvas = document.createElement("canvas");
  return async (video) => {
    // the middle of the picture, where the frame is, at a size that reads quickly
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return [];
    const cw = vw * 0.85;
    const ch = vh * 0.5;
    const scale = Math.min(1, 1280 / cw);
    canvas.width = Math.round(cw * scale);
    canvas.height = Math.round(ch * scale);
    canvas.getContext("2d", { willReadFrequently: true })!.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
    try {
      return [reader.decodeFromCanvas(canvas).getText()];
    } catch {
      return []; // nothing readable in this frame
    }
  };
}

/**
 * Scanning an equipment label with the phone's camera (live, no photo is kept): the barcode or QR
 * code is read, and its serial number (and MAC address, when there is one) can be saved.
 */
export function CodeScanner({
  model,
  onSerial,
  onMac,
  onClose,
}: {
  /** the device's model: a code holding just that is the model's barcode, not a serial number */
  model?: string;
  onSerial: (v: string) => void;
  onMac?: (v: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [found, setFound] = useState<ScannedCode[]>([]);
  /** a MAC address saved while scanning goes on (the serial number is usually on the same label) */
  const [savedMac, setSavedMac] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const seen = new Set<string>();
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(window.isSecureContext ? "הדפדפן הזה לא מאפשר גישה למצלמה." : "הסריקה עובדת רק בחיבור מאובטח (https).");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      } catch (e) {
        const name = (e as DOMException).name;
        setError(
          name === "NotAllowedError"
            ? "אין הרשאה למצלמה. אפשר לאשר אותה בהגדרות הדפדפן ולנסות שוב."
            : name === "NotFoundError"
              ? "לא נמצאה מצלמה במכשיר."
              : "לא הצלחנו לפתוח את המצלמה.",
        );
        return;
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      // a flashlight for dark cabinets, where the phone has one
      if ((track.getCapabilities?.() as { torch?: boolean } | undefined)?.torch) setTorch(false);
      setReady(true);
      const read = await makeReader();
      const tick = async () => {
        if (stopped) return;
        try {
          for (const raw of await read(video)) {
            const code = readCode(raw);
            if (!code.raw || seen.has(code.raw)) continue;
            seen.add(code.raw);
            navigator.vibrate?.(30);
            setFound((f) => [code, ...f].slice(0, 6));
          }
        } catch {
          // a frame that couldn't be read
        }
        timer = setTimeout(tick, EVERY_MS);
      };
      void tick();
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const toggleTorch = async () => {
    const next = !torch;
    try {
      await trackRef.current?.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorch(next);
    } catch {
      setTorch(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      <div className="pt-safe flex shrink-0 items-center gap-2 px-4 py-3">
        <ScanBarcode size={20} />
        <h2 className="flex-1 font-semibold">סריקת מספר סידורי</h2>
        {torch !== null && (
          <button onClick={toggleTorch} className="grid size-10 place-items-center rounded-full bg-white/15" aria-label={torch ? "כיבוי פנס" : "הדלקת פנס"}>
            {torch ? <FlashlightOff size={18} /> : <Flashlight size={18} />}
          </button>
        )}
        <button onClick={onClose} className="grid size-10 place-items-center rounded-full bg-white/15" aria-label="סגירה">
          <X size={20} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
        {ready && (
          // the frame to aim with; around it the picture is dimmed
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[30%] w-[85%] -translate-x-1/2 -translate-y-1/2 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] ring-2 ring-white/90">
            <div className="absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-red-500/80" />
          </div>
        )}
        {!ready && !error && <p className="absolute inset-0 grid place-items-center text-sm text-white/70">פותח את המצלמה…</p>}
        {error && <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-xl bg-white/10 p-4 text-center text-sm">{error}</p>}
      </div>

      <div className="pb-safe max-h-[45%] shrink-0 space-y-2 overflow-y-auto rounded-t-2xl bg-white px-4 pt-3 text-slate-900">
        {!found.length ? (
          <p className="pb-3 text-center text-sm text-slate-500">כוונו את המסגרת אל הברקוד או קוד ה-QR של המספר הסידורי, במדבקה על המוצר או על הקופסה.</p>
        ) : (
          <>
            <p className="text-xs text-slate-500">נקראו מהמדבקה. בחרו מה לשמור:</p>
            {found.map((c) => {
              const isModel = !!model && c.raw.toUpperCase() === model.toUpperCase();
              return (
                <div key={c.raw} className="rounded-xl p-2.5 ring-1 ring-slate-200">
                  <div className="ltr break-all text-end font-mono text-sm">{c.raw}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.serial && !isModel && (
                      <button onClick={() => onSerial(c.serial!)} className="h-10 flex-1 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white">
                        שמירה כמספר סידורי{c.serial !== c.raw ? `: ${c.serial}` : ""}
                      </button>
                    )}
                    {c.mac && onMac && (
                      <button
                        disabled={savedMac === c.mac}
                        onClick={() => {
                          onMac(c.mac!);
                          setSavedMac(c.mac!);
                        }}
                        className={cx("h-10 flex-1 rounded-lg px-3 text-sm font-medium disabled:opacity-60", c.serial ? "ring-1 ring-slate-300" : "bg-slate-900 text-white")}
                      >
                        {savedMac === c.mac ? "ה-MAC נשמר ✓" : <>שמירה כ-MAC: <span className="ltr inline-block">{c.mac}</span></>}
                      </button>
                    )}
                    {isModel ? (
                      <span className="text-xs text-slate-500">זה הדגם, לא המספר הסידורי</span>
                    ) : (
                      !c.serial && !c.mac && <span className="text-xs text-slate-500">{c.link ? "קישור, לא מספר סידורי" : "לא נראה כמו מספר סידורי"}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
