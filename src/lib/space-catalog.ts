import type {
  CablePass,
  CeilingType,
  Drilling,
  EnvTag,
  FloorKind,
  Lighting,
  ObstacleKind,
  OpeningKind,
  WallType,
} from "./types";

/** Map pixels per meter for floors drawn without an uploaded plan. */
export const DEFAULT_PPM = 50;

export interface WallTypeDef {
  id: WallType;
  label: string;
  color: string;
  /** default thickness in cm */
  thickness: number;
  dash?: string;
  hint?: string;
}

export const WALL_TYPES: WallTypeDef[] = [
  { id: "concrete", label: "בטון", color: "#334155", thickness: 20, hint: "קידוח עם מקדח יהלום, השחלה קשה" },
  { id: "mamad", label: "ממ״ד / מרחב מוגן", color: "#0f172a", thickness: 25, hint: "אין לקדוח ללא אישור; מעבר כבלים רק דרך פתחי האוורור/צנרת קיימת" },
  { id: "block", label: "בלוקים", color: "#64748b", thickness: 15, hint: "ניתן לקדוח ולחצוב תעלה" },
  { id: "drywall", label: "גבס", color: "#a8a29e", thickness: 10, hint: "השחלה קלה בתוך הקיר" },
  { id: "glass", label: "זכוכית / ויטרינה", color: "#38bdf8", thickness: 4, hint: "אין מעבר כבלים; סנוור למצלמות" },
  { id: "wood", label: "עץ", color: "#a16207", thickness: 8 },
  { id: "sandwich", label: "פנל מבודד (סנדוויץ׳)", color: "#94a3b8", thickness: 10, hint: "מבני תעשייה וחדרי קירור" },
  { id: "partition", label: "מחיצה ניידת", color: "#cbd5e1", thickness: 6, dash: "6 4" },
  { id: "fence", label: "גדר / קיר חוץ נמוך", color: "#16a34a", thickness: 5, dash: "3 4" },
];

export const wallTypeById = (id?: WallType) => WALL_TYPES.find((w) => w.id === id) ?? WALL_TYPES[3];

export const CABLE_PASS: { id: CablePass; label: string; color: string }[] = [
  { id: "yes", label: "יש השחלה", color: "#16a34a" },
  { id: "partial", label: "השחלה חלקית", color: "#f59e0b" },
  { id: "no", label: "אין השחלה", color: "#dc2626" },
  { id: "unknown", label: "לא ידוע", color: "#94a3b8" },
];

export const DRILLING: { id: Drilling; label: string }[] = [
  { id: "allowed", label: "מותר לקדוח" },
  { id: "restricted", label: "בתיאום / מוגבל" },
  { id: "forbidden", label: "אסור לקדוח" },
];

export const OPENING_KINDS: { id: OpeningKind; label: string; width: number; color: string }[] = [
  { id: "door", label: "דלת", width: 0.9, color: "#78716c" },
  { id: "window", label: "חלון", width: 1.2, color: "#0ea5e9" },
  { id: "vitrine", label: "ויטרינה", width: 3, color: "#0284c7" },
  { id: "gate", label: "שער", width: 4, color: "#57534e" },
  { id: "passage", label: "פתח מעבר", width: 1.2, color: "#a8a29e" },
];
export const openingKindById = (id: OpeningKind) => OPENING_KINDS.find((o) => o.id === id) ?? OPENING_KINDS[0];

export const OBSTACLE_KINDS: { id: ObstacleKind; label: string; size: [number, number] }[] = [
  { id: "column", label: "עמוד", size: [0.4, 0.4] },
  { id: "stairs", label: "מדרגות", size: [1.2, 3] },
  { id: "elevator", label: "מעלית", size: [1.6, 1.6] },
  { id: "shaft", label: "פיר", size: [0.8, 0.8] },
];
export const obstacleKindById = (id: ObstacleKind) => OBSTACLE_KINDS.find((o) => o.id === id) ?? OBSTACLE_KINDS[0];

export const CEILING_TYPES: { id: CeilingType; label: string; hint: string }[] = [
  { id: "acoustic", label: "תקרה אקוסטית (אריחים)", hint: "גישה קלה מעל האריחים, תוואי נוח לכבלים" },
  { id: "drywall", label: "תקרת גבס מונמכת", hint: "צריך פתחי שירות; התקנה בהברגה לגבס" },
  { id: "concrete", label: "בטון חשוף", hint: "כבלים בתעלה גלויה או בצנרת על התקרה" },
  { id: "open", label: "פתוחה / תעשייתית (קורות)", hint: "מגשי כבלים ותליות" },
  { id: "metal", label: "פח / איסכורית", hint: "חשיפה לחום; מצלמות על קורה" },
  { id: "wood", label: "עץ", hint: "" },
  { id: "none", label: "ללא תקרה (חוץ)", hint: "התקנה על קיר/עמוד; ציוד חוץ" },
];

export const FLOOR_KINDS: { id: FloorKind; label: string }[] = [
  { id: "regular", label: "רצפה רגילה" },
  { id: "raised", label: "רצפה צפה (מוגבהת)" },
  { id: "ducts", label: "תעלות רצפה" },
];

export const LIGHTING: { id: Lighting; label: string; hint: string }[] = [
  { id: "good", label: "תאורה טובה", hint: "" },
  { id: "low", label: "תאורה חלשה", hint: "מצלמה עם IR / רגישות גבוהה" },
  { id: "dark", label: "חשוך בלילה", hint: "חובה IR או תאורה משלימה" },
  { id: "sun", label: "שמש ישירה", hint: "מגן שמש, WDR" },
  { id: "backlight", label: "תאורה אחורית (חלונות/כניסה)", hint: "WDR 120dB, להימנע מצילום נגד האור" },
];

export const ENV_TAGS: { id: EnvTag; label: string; hint: string }[] = [
  { id: "humid", label: "לחות", hint: "IP66 ומעל" },
  { id: "dusty", label: "אבק", hint: "IP6x" },
  { id: "hot", label: "חום", hint: "ציוד לטמפרטורה גבוהה" },
  { id: "rain", label: "גשם / חוץ", hint: "IP66/67, קופסאות חיבור אטומות" },
  { id: "vandal", label: "סיכון ונדליזם", hint: "IK10, גובה התקנה" },
];

export const ROOM_USAGES = [
  "משרד",
  "אופן ספייס",
  "קבלה / לובי",
  "חדר ישיבות",
  "חדר שרתים / תקשורת",
  "מחסן",
  "מטבח",
  "שירותים",
  "מסדרון",
  "אולם / חלל מכירה",
  "חניון",
  "חצר / חוץ",
  "ממ״ד",
  "חדר מדרגות",
];
