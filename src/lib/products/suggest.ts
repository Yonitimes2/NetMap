import { pointInPolygon } from "../space";
import type { Area, Device, Point } from "../types";
import { brandKey } from "./client";
import { CAMERA_CATEGORIES, FORM_LABEL, type ProductParams, type ProductSummary } from "./types";

/**
 * Camera suggestions for a spot on the map: the user aims the camera (distance and width), says
 * what it has to show there, and the catalog's cameras are checked against it with plain rules
 * (pixel density at that distance, night range, weather, mounting, brand), each with its reasons.
 */

/** What the camera has to show at the far end of its view, and the pixels per meter that takes (IEC 62676-4). */
export type Purpose = "detect" | "observe" | "recognize" | "identify" | "plates";

export const PURPOSES: { id: Purpose; label: string; hint: string; short: string; ppm: number }[] = [
  { id: "detect", label: "תנועה ונוכחות", hint: "לדעת שמישהו או רכב נמצאים שם", short: "גילוי", ppm: 25 },
  { id: "observe", label: "להבין מה קורה", hint: "מה אנשים עושים, צבע בגדים", short: "צפייה", ppm: 62 },
  { id: "recognize", label: "לזהות אדם מוכר", hint: "עובד, לקוח קבוע, בן משפחה", short: "הכרת אדם", ppm: 125 },
  { id: "identify", label: "לזהות פנים של זר", hint: "תמונה שאפשר למסור למשטרה", short: "זיהוי פנים", ppm: 250 },
  { id: "plates", label: "לוחיות רישוי", hint: "לקרוא מספר של רכב", short: "קריאת לוחית", ppm: 250 },
];

export const purposeById = (id: Purpose) => PURPOSES.find((p) => p.id === id) ?? PURPOSES[0];

export type Night = "none" | "bw" | "color";

export const NIGHTS: { id: Night; label: string }[] = [
  { id: "none", label: "לא צריך" },
  { id: "bw", label: "שחור-לבן מספיק" },
  { id: "color", label: "חשוב לראות צבע" },
];

// ---------- the place, from the map ----------

/** What the map knows about the spot: the room the camera is in and the one it looks at. */
export interface PlaceFacts {
  /** undefined: no room is drawn there, so the map doesn't know */
  outdoor?: boolean;
  /** rain or humidity (the room's environment tags) */
  wet: boolean;
  vandal: boolean;
  /** direct sun or light from behind (windows, an entrance) */
  backlight: boolean;
  /** dark at night */
  dark: boolean;
  /** no power at the camera's spot */
  noPower: boolean;
  /** inside, under a ceiling: dome and turret cameras fit best */
  ceiling: boolean;
  /** names for the "known from the map" line */
  here?: string;
  target?: string;
}

function polygonArea(pts: Point[]) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** `ppm`: the floor's pixels per meter as the map draws the camera's cone. */
export function placeFacts(d: Device, areas: Area[], ppm: number): PlaceFacts {
  const rooms = areas.filter((a) => a.floorId === d.floorId && a.points.length >= 3);
  // nested rooms: the smallest one holding the point
  const roomAt = (p: Point) => rooms.filter((a) => pointInPolygon(p, a.points)).sort((a, b) => polygonArea(a.points) - polygonArea(b.points))[0];
  const here = roomAt(d);
  const cam = d.camera;
  // the middle of what it sees, so a camera on a wall facing out reads the yard, not the wall's room
  const target = cam
    ? roomAt({ x: d.x + Math.cos((cam.dir * Math.PI) / 180) * cam.range * 0.6 * ppm, y: d.y + Math.sin((cam.dir * Math.PI) / 180) * cam.range * 0.6 * ppm })
    : undefined;
  const main = target ?? here;
  const both = [target, here].filter((a): a is Area => !!a);
  const env = new Set(both.flatMap((a) => a.env ?? []));
  const light = both.map((a) => a.lighting);
  return {
    outdoor: main ? !!main.outdoor : undefined,
    wet: env.has("rain") || env.has("humid"),
    vandal: env.has("vandal"),
    backlight: light.includes("sun") || light.includes("backlight"),
    dark: light.includes("dark"),
    noPower: here?.power === "none",
    ceiling: !!here && !here.outdoor && here.ceilingType !== "none",
    here: here?.name,
    target: target && target !== here ? target.name : undefined,
  };
}

// ---------- matching ----------

export interface CameraNeeds {
  /** to the farthest point it has to show */
  distanceM: number;
  /** horizontal width of the view, in degrees */
  angleDeg: number;
  purpose: Purpose;
  night: Night;
  outdoor: boolean;
  wet: boolean;
  vandal: boolean;
  backlight: boolean;
  noPower: boolean;
  ceiling: boolean;
  /** the brand of the site's other cameras */
  brand?: { key: string; name: string };
}

type Miss = "width" | "detail" | "night" | "color" | "weather";

export interface Suggestion {
  p: ProductSummary;
  /** good: does it all; ok: does the job, with notes; weak: misses something that matters */
  level: "good" | "ok" | "weak";
  pros: string[];
  notes: string[];
  misses: string[];
  /** the angle to set a zoom lens to, when narrower than its widest */
  setFov?: number;
  /** the angle its cone gets on the map */
  fov: number;
  /** what it misses, for the advice when nothing fits */
  missed: Miss[];
  /** lower is better */
  rank: number;
}

export interface SuggestResult {
  list: Suggestion[];
  /** what to change when no camera does it all */
  advice: string[];
  /** cameras with enough data to check */
  checked: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
/** width (m) seen at a distance through a horizontal angle; very wide lenses are capped so the math stays finite */
const sceneWidth = (fovDeg: number, distM: number) => 2 * distM * Math.tan(rad(Math.min(fovDeg, 160)) / 2);
export const fmtM = (m: number) => String(m >= 10 ? Math.round(m) : Math.round(m * 2) / 2);

const MP_WIDTH: [number, number][] = [
  [1, 1280],
  [2, 1920],
  [3, 2304],
  [4, 2560],
  [5, 2592],
  [6, 3072],
  [8, 3840],
  [12, 4000],
];

/** Horizontal pixels, from "2592x1944" or else from the megapixels. */
export function horizontalPixels(s: ProductParams): number | undefined {
  const m = s.resolution?.match(/(\d{3,5})\s*[x×*]\s*(\d{3,5})/);
  if (m) return Math.max(+m[1], +m[2]);
  if (!s.mp) return undefined;
  return MP_WIDTH.find(([mp]) => mp >= s.mp!)?.[1] ?? 4000;
}

/** The water digit of an IP rating ("IP67" → 7). */
const ipWater = (r?: string) => {
  const m = r?.match(/IP\s?\d(\d)/i);
  return m ? Number(m[1]) : undefined;
};

/** How far a camera shows the purpose's detail through a given angle. */
const reachM = (pixels: number, fovDeg: number, purposePpm: number) => pixels / (purposePpm * sceneWidth(fovDeg, 1));

function evaluate(p: ProductSummary, n: CameraNeeds): Suggestion | null {
  const s = p.params;
  const pixels = horizontalPixels(s);
  if (!pixels || !s.fovDeg) return null;
  const purpose = purposeById(n.purpose);
  const ptz = p.category === "ptz" || s.formFactor === "ptz";
  const wide = s.fovDeg;
  const tele = s.fovTeleDeg && s.fovTeleDeg < wide ? s.fovTeleDeg : wide;
  const pros: string[] = [];
  const notes: string[] = [];
  const misses: string[] = [];
  const missed: Miss[] = [];
  const miss = (kind: Miss, text: string) => {
    misses.push(text);
    missed.push(kind);
  };
  // until prices come in, simpler cameras stand in for cheaper ones
  let cost = s.mp ?? 4;

  // the width it covers and the detail it shows at the far end
  const covers = wide >= n.angleDeg - 2;
  const fov = covers ? Math.max(tele, Math.min(wide, n.angleDeg)) : wide;
  const reach = reachM(pixels, fov, purpose.ppm);
  if (ptz) {
    // a fallback: it shows one direction at a time, so a fixed camera that does the job comes first
    cost += 25;
    const zoomed = reachM(pixels, tele, purpose.ppm);
    if (zoomed >= n.distanceM) pros.push(`${purpose.short} עד ${fmtM(zoomed)} מ׳ בזום (צריך ${fmtM(n.distanceM)})`);
    else miss("detail", `${purpose.short} רק עד ${fmtM(zoomed)} מ׳, גם בזום מלא (צריך ${fmtM(n.distanceM)})`);
    notes.push("רואה בפירוט כיוון אחד בכל רגע: מסתובבת ומתקרבת");
  } else {
    if (covers) pros.push(`מכסה ${Math.round(fov)}°${fov < wide - 1 ? ` (העדשה עד ${Math.round(wide)}°)` : ""}`);
    else miss("width", `רוחב ${Math.round(wide)}° בלבד מתוך ${Math.round(n.angleDeg)}°: צריך ${Math.ceil(n.angleDeg / wide)} מצלמות`);
    if (reach >= n.distanceM) pros.push(`${purpose.short} עד ${fmtM(reach)} מ׳ (צריך ${fmtM(n.distanceM)})`);
    else if (reach >= n.distanceM * 0.8) notes.push(`${purpose.short} עד ${fmtM(reach)} מ׳, על הגבול (צריך ${fmtM(n.distanceM)})`);
    else miss("detail", `${purpose.short} רק עד ${fmtM(reach)} מ׳ (צריך ${fmtM(n.distanceM)})`);
  }
  if (s.lensType === "vf") cost += 1;
  if (s.lensType === "mvf") cost += 1.5;

  // night
  if (n.night !== "none") {
    const light = s.illumination === "white" ? "תאורה לבנה" : s.illumination === "dual" ? "תאורה כפולה" : "IR";
    if (s.irM === undefined) notes.push("טווח הלילה לא ידוע");
    else if (s.irM >= n.distanceM) pros.push(`${light} עד ${s.irM} מ׳`);
    else if (s.irM >= n.distanceM * 0.7) notes.push(`בלילה מאירה עד ${s.irM} מ׳ (צריך ${fmtM(n.distanceM)})`);
    else miss("night", `בלילה מאירה רק עד ${s.irM} מ׳ (צריך ${fmtM(n.distanceM)})`);
    const color = s.colorNight || s.illumination === "white" || s.illumination === "dual";
    if (n.night === "color") {
      if (color) pros.push("צבע גם בלילה");
      else miss("color", "בלילה בשחור-לבן");
    }
  }

  // the place
  if (n.outdoor || n.wet) {
    const water = ipWater(s.ipRating);
    const where = n.outdoor ? "חוץ" : "לחות";
    if (water === undefined) notes.push("עמידות למים לא ידועה");
    else if (water >= 6) pros.push(`${s.ipRating}: מתאימה ל${where}`);
    else miss("weather", `${s.ipRating} לא מספיק ל${where}`);
  }
  if (n.vandal) {
    if (s.vandal) pros.push("IK10: מוגנת מפני ונדליזם");
    else notes.push("לא מוגנת מפני ונדליזם (IK10)");
  }
  if (n.backlight) {
    if (s.wdr === "true") pros.push("WDR אמיתי לאור נגדי");
    else notes.push("בלי WDR אמיתי: באור נגדי פנים ייראו כהות");
  }
  if (n.noPower) {
    if (p.category === "solar" || s.sim4g) pros.push("סולארית / 4G: בלי חשמל ובלי כבל");
    else notes.push("צריך להביא חשמל או PoE לנקודה");
  }
  const form = s.formFactor;
  if (!n.outdoor && n.ceiling && (form === "dome" || form === "turret")) pros.push(`${FORM_LABEL[form]}: מתאימה לתקרה`);
  if (!n.outdoor && form === "bullet") cost += 0.5; // stands out inside
  if (n.outdoor && form === "bullet" && n.distanceM > 25) pros.push("צינור: מתאימה לטווח ארוך");

  // what it's for
  const analytics = s.analytics ?? [];
  if (n.purpose === "plates") {
    if (/LPR/i.test(p.model) || analytics.includes("זיהוי לוחיות רישוי")) pros.push("מצלמת LPR: קוראת לוחיות");
    else {
      notes.push("לא מצלמת LPR: תצלם את הלוחית, בלי קריאה אוטומטית");
      cost += 3;
    }
  }
  if (n.purpose === "identify" && analytics.includes("זיהוי פנים")) pros.push("זיהוי פנים מובנה");
  if (p.category === "thermal") {
    cost += n.purpose === "detect" ? 6 : 15;
    if (n.purpose === "detect") pros.push("תרמית: גילוי גם בחושך מלא, עשן וערפל");
    else notes.push("הערוץ התרמי מיועד לגילוי בלבד");
  }
  if (p.category === "solar") cost += 5;

  // one brand across the system
  if (n.brand) {
    if (brandKey(p.brandName) === n.brand.key) pros.push(`${p.brandName}, כמו שאר המצלמות באתר`);
    else notes.push(`לא תואם למערך הקיים (המצלמות באתר של ${n.brand.name})`);
  }

  const level = misses.length ? "weak" : notes.length ? "ok" : "good";
  return {
    p,
    level,
    pros,
    notes,
    misses,
    missed,
    fov: Math.round(fov),
    setFov: !ptz && covers && tele < wide && fov < wide - 1 ? Math.round(fov) : undefined,
    rank: misses.length * 100 + notes.length * 10 + cost,
  };
}

/** The best few catalog cameras for the spot: those that do it all first, else the closest ones. */
export function suggestCameras(products: ProductSummary[], n: CameraNeeds): SuggestResult {
  const all = products
    .filter((p) => CAMERA_CATEGORIES.includes(p.category) && p.status !== "discontinued" && (p.category !== "solar" || n.noPower))
    .map((p) => evaluate(p, n))
    .filter((x): x is Suggestion => !!x)
    .sort((a, b) => a.rank - b.rank);
  const fit = all.filter((x) => x.level !== "weak");
  const list = fit.length >= 3 ? fit.slice(0, 5) : [...fit, ...all.filter((x) => x.level === "weak").slice(0, 3 - fit.length)];
  // advice when no fixed camera does it (a PTZ that does shows one direction at a time)
  const fixedFits = fit.some((x) => x.p.category !== "ptz");
  return { list, advice: fixedFits ? [] : advise(all, n, fit.length > 0), checked: all.length };
}

/** When no fixed camera does it all: what would make it work. */
function advise(all: Suggestion[], n: CameraNeeds, ptzFits: boolean): string[] {
  if (!all.length) return [];
  const out: string[] = [];
  if (ptzFits) out.push("רק מצלמת PTZ מגיעה לזה, והיא רואה בפירוט כיוון אחד בכל רגע. מצלמה קבועה תצטרך שינוי:");
  const purpose = purposeById(n.purpose);
  const fixed = all.filter((x) => x.p.category !== "ptz");
  if (fixed.length && fixed.every((x) => x.missed.includes("width"))) {
    out.push(`הרוחב (${Math.round(n.angleDeg)}°) גדול מדי למצלמה אחת. אפשר לפצל לשתי מצלמות של כ-${Math.round(n.angleDeg / 2)}° כל אחת.`);
  }
  const wideEnough = fixed.filter((x) => !x.missed.includes("width"));
  if (wideEnough.length && wideEnough.every((x) => x.missed.includes("detail"))) {
    let best = 0;
    let pixels = 0;
    for (const x of wideEnough) {
      const px = horizontalPixels(x.p.params) ?? 0;
      best = Math.max(best, reachM(px, x.fov, purpose.ppm));
      pixels = Math.max(pixels, px);
    }
    const narrow = (2 * Math.atan(pixels / (purpose.ppm * 2 * n.distanceM)) * 180) / Math.PI;
    out.push(
      `ל${purpose.short} ברוחב ${Math.round(n.angleDeg)}° המצלמות מגיעות עד ${fmtM(best)} מ׳. אפשר לקרב את המצלמה, להצר את הזווית לכ-${Math.max(5, Math.floor(narrow))}°, או להוסיף מצלמה לחלק הרחוק.`,
    );
  }
  if (n.night !== "none" && all.every((x) => x.missed.includes("night"))) {
    out.push(`אף מצלמה לא מאירה עד ${fmtM(n.distanceM)} מ׳ בלילה. כדאי להוסיף תאורה לאזור או לקרב את המצלמה.`);
  }
  if (!out.length) out.push("אין דגם אחד שעונה על הכול. אלה הקרובים ביותר, עם מה שחסר בכל אחד:");
  else if (ptzFits && out.length === 1) out.pop(); // nothing specific to say about the fixed ones
  return out;
}
