/**
 * Product catalog: equipment from manufacturers (brands), with the parameters that matter when
 * planning. Shared by the server and the browser (no Node imports here).
 */

export type CatalogCategory = "ip-camera" | "ptz" | "thermal" | "solar" | "nvr" | "switch" | "speaker" | "intercom" | "other";

export const CATEGORY_LABEL: Record<CatalogCategory, string> = {
  "ip-camera": "מצלמות IP",
  ptz: "מצלמות PTZ",
  thermal: "מצלמות תרמיות",
  solar: "מצלמות סולאריות",
  nvr: "מקליטי NVR",
  switch: "מתגי PoE",
  speaker: "רמקולי IP",
  intercom: "אינטרקום",
  other: "אחר",
};

export const CAMERA_CATEGORIES: CatalogCategory[] = ["ip-camera", "ptz", "thermal", "solar"];

/** Distances (meters) at the wide end of the lens: detect / recognize / identify a person (DORI). */
export interface Dori {
  detect?: number;
  recognize?: number;
  identify?: number;
}

export type FormFactor = "bullet" | "dome" | "turret" | "ptz" | "fisheye" | "box" | "other";
export type LensType = "fixed" | "vf" | "mvf" | "zoom";

export interface CameraParams {
  mp?: number;
  resolution?: string;
  sensor?: string;
  formFactor?: FormFactor;
  lensType?: LensType;
  /** focal length in mm (min–max for varifocal) */
  lensMm?: [number, number];
  /** horizontal field of view in degrees, wide end (and tele end for zoom lenses) */
  fovDeg?: number;
  fovTeleDeg?: number;
  opticalZoom?: number;
  /** illumination range in meters (IR or white light) */
  irM?: number;
  illumination?: "ir" | "white" | "dual" | "none";
  /** keeps color at night (full-color / white light) */
  colorNight?: boolean;
  wdr?: "true" | "digital";
  analytics?: string[];
  /** Provision DDA level (1–3) */
  dda?: number;
  poe?: boolean;
  powerW?: number;
  ipRating?: string;
  vandal?: boolean;
  audio?: "none" | "mic" | "input" | "two-way";
  sdCard?: boolean;
  ndaa?: boolean;
  cyber?: boolean;
  dori?: Dori;
  thermalResolution?: string;
  sim4g?: boolean;
  /** ONVIF profiles, e.g. "T/S/G" */
  onvif?: string;
  /** alarm input / output contacts */
  alarmIO?: boolean;
  /** strobe light and siren (active deterrence) */
  deterrence?: boolean;
}

export interface NvrParams {
  channels?: number;
  poePorts?: number;
  hddBays?: number;
  maxHddTb?: number;
  maxRecordMp?: number;
  incomingMbps?: number;
  raid?: boolean;
  analytics?: string[];
  faceRecognition?: boolean;
  ndaa?: boolean;
}

export interface SwitchParams {
  ports?: number;
  poePorts?: number;
  poeBudgetW?: number;
  portSpeed?: "100M" | "1G";
  uplinks?: number;
  sfp?: number;
  managed?: boolean;
  rackMount?: boolean;
}

export interface SpeakerParams {
  watts?: number;
  sip?: boolean;
  poe?: boolean;
  ipRating?: string;
  mount?: string;
}

export type ProductParams = CameraParams & NvrParams & SwitchParams & SpeakerParams;

export interface SpecGroup {
  group: string;
  items: { k: string; v: string }[];
}

/** One of the manufacturer's box icons, stored on our server. */
export interface BoxIcon {
  name: string;
  iconId: string;
}

/** One row of the catalog list. */
export interface ProductSummary {
  id: string;
  brandId: string;
  brandName: string;
  model: string;
  name: string;
  category: CatalogCategory;
  /** NetMap equipment type this product is placed as (cam-dome, nvr, switch…) */
  deviceType: string;
  /** source values with the admin's corrections applied */
  params: ProductParams;
  imageId?: string;
  boxIcons: BoxIcon[];
  status: "active" | "discontinued" | "review";
  // prices: the account holder's only, removed by the server for everyone else (see pricing.ts)
  /** cost from the distributor's price list, before VAT */
  cost?: number;
  /** instead of a price, or about it: "שאל את סוכן המכירות", "כולל דיסק 2TB" */
  costNote?: string;
  /** retail price on the maker's site, with VAT */
  msrp?: number;
}

export interface ProductFull extends ProductSummary {
  description?: string;
  overview: string[];
  specs: SpecGroup[];
  /** values from the source, before corrections */
  sourceParams: ProductParams;
  overrides: ProductParams;
  imageIds: string[];
  features: string[];
  pageUrl?: string;
  datasheetUrl?: string;
  /** the price list the cost is from, and when it was read */
  costSource?: string;
  costAt?: number;
  /** the brand's markup on cost for a customer price (when the site has no retail price) */
  markupPct?: number;
  fetchedAt?: number;
  updatedAt: number;
}

/** Equipment type on the map for each category (cameras by their form). */
export function deviceTypeFor(category: CatalogCategory, p: ProductParams): string {
  switch (category) {
    case "ptz":
      return "cam-ptz";
    case "nvr":
      return "nvr";
    case "switch":
      return "switch";
    case "speaker":
      return "speaker";
    case "intercom":
      return "intercom";
    case "ip-camera":
    case "thermal":
    case "solar":
      return p.formFactor === "dome" || p.formFactor === "turret" || p.formFactor === "fisheye" ? "cam-dome" : p.formFactor === "ptz" ? "cam-ptz" : "cam-bullet";
    default:
      return "generic";
  }
}

export const FORM_LABEL: Record<FormFactor, string> = {
  bullet: "צינור",
  dome: "כיפה",
  turret: "טורט",
  ptz: "PTZ",
  fisheye: "עין דג",
  box: "קופסה",
  other: "אחר",
};

export const LENS_LABEL: Record<LensType, string> = {
  fixed: "קבועה",
  vf: "משתנה ידנית",
  mvf: "משתנה ממונעת",
  zoom: "זום אופטי",
};

/** Short chips for a product: "4MP · 2.8-12mm · IR 40m · PoE · IP67". */
export function paramChips(category: CatalogCategory, p: ProductParams): string[] {
  const out: string[] = [];
  if (CAMERA_CATEGORIES.includes(category)) {
    if (p.mp) out.push(`${p.mp}MP`);
    if (p.formFactor) out.push(FORM_LABEL[p.formFactor]);
    if (p.opticalZoom) out.push(`זום x${p.opticalZoom}`);
    else if (p.lensMm) out.push(p.lensMm[0] === p.lensMm[1] ? `${p.lensMm[0]}mm` : `${p.lensMm[0]}-${p.lensMm[1]}mm${p.lensType === "mvf" ? " ממונעת" : ""}`);
    if (p.fovDeg) out.push(`${p.fovDeg}°`);
    if (p.irM) out.push(`${p.illumination === "white" ? "לבן" : "IR"} ${p.irM}m`);
    if (p.colorNight) out.push("צבע בלילה");
    if (p.dda) out.push(`DDA${p.dda}`);
    if (p.poe) out.push("PoE");
    if (p.ipRating) out.push(p.ipRating);
    if (p.vandal) out.push("IK10");
    if (p.thermalResolution) out.push(`תרמי ${p.thermalResolution}`);
  } else if (category === "nvr") {
    if (p.channels) out.push(`${p.channels} ערוצים`);
    if (p.poePorts) out.push(`${p.poePorts} PoE`);
    if (p.hddBays) out.push(`${p.hddBays} דיסקים`);
    if (p.maxRecordMp) out.push(`עד ${p.maxRecordMp}MP`);
    if (p.raid) out.push("RAID");
  } else if (category === "switch") {
    if (p.ports) out.push(`${p.ports} פורטים`);
    if (p.poePorts) out.push(`${p.poePorts} PoE`);
    if (p.poeBudgetW) out.push(`${p.poeBudgetW}W`);
    if (p.portSpeed) out.push(p.portSpeed);
    if (p.uplinks) out.push(`${p.uplinks} Uplink`);
    if (p.sfp) out.push(`${p.sfp} SFP`);
  } else if (category === "speaker") {
    if (p.watts) out.push(`${p.watts}W`);
    if (p.poe) out.push("PoE");
    if (p.sip) out.push("SIP");
    if (p.ipRating) out.push(p.ipRating);
  }
  return out;
}

/** Source values with the admin's corrections on top. */
export const effectiveParams = (source: ProductParams, overrides: ProductParams): ProductParams => ({ ...source, ...overrides });

// ---------- editable planning parameters, per kind of product ----------

export type ParamField =
  | { key: keyof ProductParams; label: string; kind: "number"; unit?: string }
  | { key: keyof ProductParams; label: string; kind: "text" }
  | { key: keyof ProductParams; label: string; kind: "bool" }
  | { key: keyof ProductParams; label: string; kind: "select"; options: [string, string][] }
  | { key: keyof ProductParams; label: string; kind: "list" }
  | { key: keyof ProductParams; label: string; kind: "range"; unit?: string }
  | { key: keyof ProductParams; label: string; kind: "dori" };

const CAMERA_FIELDS: ParamField[] = [
  { key: "mp", label: "רזולוציה", kind: "number", unit: "MP" },
  { key: "resolution", label: "פיקסלים", kind: "text" },
  { key: "formFactor", label: "צורה", kind: "select", options: Object.entries(FORM_LABEL) },
  { key: "lensType", label: "עדשה", kind: "select", options: Object.entries(LENS_LABEL) },
  { key: "lensMm", label: "אורך מוקד", kind: "range", unit: "mm" },
  { key: "fovDeg", label: "זווית ראייה (רחבה)", kind: "number", unit: "°" },
  { key: "fovTeleDeg", label: "זווית ראייה (צרה)", kind: "number", unit: "°" },
  { key: "opticalZoom", label: "זום אופטי", kind: "number", unit: "x" },
  { key: "irM", label: "טווח תאורה", kind: "number", unit: "מ׳" },
  {
    key: "illumination",
    label: "סוג תאורה",
    kind: "select",
    options: [
      ["ir", "אינפרה-אדום"],
      ["white", "אור לבן"],
      ["dual", "היברידית (IR + לבן)"],
      ["none", "ללא"],
    ],
  },
  { key: "colorNight", label: "צבע בלילה", kind: "bool" },
  {
    key: "wdr",
    label: "WDR",
    kind: "select",
    options: [
      ["true", "True WDR"],
      ["digital", "דיגיטלי"],
    ],
  },
  { key: "dda", label: "רמת אנליטיקה (DDA)", kind: "number" },
  { key: "analytics", label: "אנליטיקות", kind: "list" },
  { key: "dori", label: "מרחקי זיהוי (DORI)", kind: "dori" },
  { key: "poe", label: "PoE", kind: "bool" },
  { key: "powerW", label: "צריכת הספק", kind: "number", unit: "W" },
  { key: "ipRating", label: "עמידות (IP)", kind: "text" },
  { key: "vandal", label: "מוגנת ונדליזם (IK10)", kind: "bool" },
  {
    key: "audio",
    label: "שמע",
    kind: "select",
    options: [
      ["none", "ללא"],
      ["mic", "מיקרופון מובנה"],
      ["input", "כניסת שמע"],
      ["two-way", "דו-כיווני"],
    ],
  },
  { key: "sdCard", label: "כרטיס SD", kind: "bool" },
  { key: "ndaa", label: "תקן NDAA", kind: "bool" },
  { key: "cyber", label: "הגנת סייבר (Check Point)", kind: "bool" },
  { key: "sensor", label: "חיישן", kind: "text" },
  { key: "thermalResolution", label: "רזולוציה תרמית", kind: "text" },
  { key: "sim4g", label: "סים סלולרי", kind: "bool" },
  { key: "onvif", label: "פרופילי ONVIF", kind: "text" },
  { key: "alarmIO", label: "כניסות/יציאות אזעקה", kind: "bool" },
  { key: "deterrence", label: "הרתעה אקטיבית", kind: "bool" },
];

export const PARAM_FIELDS: Record<CatalogCategory, ParamField[]> = {
  "ip-camera": CAMERA_FIELDS,
  ptz: CAMERA_FIELDS,
  thermal: CAMERA_FIELDS,
  solar: CAMERA_FIELDS,
  nvr: [
    { key: "channels", label: "ערוצים", kind: "number" },
    { key: "poePorts", label: "פורטי PoE", kind: "number" },
    { key: "hddBays", label: "מקומות לדיסקים", kind: "number" },
    { key: "maxHddTb", label: "נפח מקסימלי", kind: "number", unit: "TB" },
    { key: "maxRecordMp", label: "הקלטה עד", kind: "number", unit: "MP" },
    { key: "incomingMbps", label: "רוחב פס נכנס", kind: "number", unit: "Mbps" },
    { key: "raid", label: "RAID", kind: "bool" },
    { key: "faceRecognition", label: "זיהוי פנים במקליט", kind: "bool" },
    { key: "analytics", label: "אנליטיקות", kind: "list" },
    { key: "ndaa", label: "תקן NDAA", kind: "bool" },
  ],
  switch: [
    { key: "ports", label: "פורטים", kind: "number" },
    { key: "poePorts", label: "פורטי PoE", kind: "number" },
    { key: "poeBudgetW", label: "תקציב PoE", kind: "number", unit: "W" },
    {
      key: "portSpeed",
      label: "מהירות פורטים",
      kind: "select",
      options: [
        ["100M", "100M"],
        ["1G", "1G"],
      ],
    },
    { key: "uplinks", label: "Uplink", kind: "number" },
    { key: "sfp", label: "SFP", kind: "number" },
    { key: "managed", label: "מנוהל", kind: "bool" },
    { key: "rackMount", label: "לארון 19״", kind: "bool" },
  ],
  speaker: [
    { key: "watts", label: "הספק", kind: "number", unit: "W" },
    { key: "poe", label: "PoE", kind: "bool" },
    { key: "sip", label: "SIP", kind: "bool" },
    { key: "ipRating", label: "עמידות (IP)", kind: "text" },
    { key: "mount", label: "התקנה", kind: "text" },
  ],
  intercom: [],
  other: [],
};

/** Display of one parameter value. */
export function formatParam(f: ParamField, v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  switch (f.kind) {
    case "bool":
      return v ? "כן" : "לא";
    case "select":
      return f.options.find(([k]) => k === v)?.[1] ?? String(v);
    case "list":
      return Array.isArray(v) ? v.join(", ") : String(v);
    case "range": {
      const [a, b] = v as [number, number];
      return `${a === b ? a : `${a}-${b}`}${f.unit ? ` ${f.unit}` : ""}`;
    }
    case "dori": {
      const d = v as Dori;
      return [d.detect && `גילוי ${d.detect} מ׳`, d.recognize && `זיהוי ${d.recognize} מ׳`, d.identify && `זיהוי ודאי ${d.identify} מ׳`].filter(Boolean).join(" · ") || "—";
    }
    default:
      return `${v}${"unit" in f && f.unit ? ` ${f.unit}` : ""}`;
  }
}
