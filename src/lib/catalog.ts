import {
  AlarmSmoke,
  Antenna,
  AudioLines,
  BatteryCharging,
  Bell,
  Box,
  Cctv,
  Container,
  Cpu,
  DoorOpen,
  HardDrive,
  Keyboard,
  Magnet,
  Megaphone,
  Mic,
  Monitor,
  Network,
  Phone,
  Plug,
  Printer,
  Radar,
  Router,
  Rows3,
  ScanEye,
  Server,
  Shield,
  ShieldCheck,
  Siren,
  Speaker,
  Tv,
  Video,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { LayerId } from "./types";

export interface LayerDef {
  id: LayerId;
  label: string;
  color: string;
}

export const LAYERS: LayerDef[] = [
  { id: "network", label: "תקשורת ורשת", color: "#2563eb" },
  { id: "cctv", label: "מצלמות", color: "#dc2626" },
  { id: "audio", label: "סאונד", color: "#16a34a" },
  { id: "alarm", label: "אזעקה", color: "#ea580c" },
  { id: "infra", label: "תשתית (תעלות/צנרת)", color: "#334155" },
  { id: "power", label: "חשמל / UPS", color: "#ca8a04" },
  { id: "other", label: "אחר", color: "#7c3aed" },
];

export const layerById = (id: LayerId) =>
  LAYERS.find((l) => l.id === id) ?? LAYERS[0];

export interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: string[];
  ltr?: boolean;
  placeholder?: string;
}

export interface DeviceTypeDef {
  id: string;
  label: string;
  layer: LayerId;
  icon: LucideIcon;
  /** has an IP / network config section */
  network?: boolean;
  /** has a credentials section */
  creds?: boolean;
  /** label for the extra secret field in the credentials section */
  secretLabel?: string;
  /** default number of ports — shows a port table */
  ports?: number;
  camera?: boolean;
  /** device that terminates a trace for its layer (NVR, router, amp…) */
  core?: boolean;
  fields: FieldDef[];
}

export const DEVICE_TYPES: DeviceTypeDef[] = [
  // ---- network ----
  {
    id: "rack",
    label: "ארון תקשורת",
    layer: "network",
    icon: Server,
    fields: [
      { key: "size", label: "גודל (U)", type: "number" },
      { key: "location", label: "מיקום / חדר" },
      { key: "key", label: "מפתח / גישה לארון" },
    ],
  },
  {
    id: "modem",
    label: "מודם / ONT",
    layer: "network",
    icon: Antenna,
    network: true,
    creds: true,
    core: true,
    fields: [
      { key: "isp", label: "ספק תשתית" },
      { key: "line", label: "מספר קו / מנוי", ltr: true },
      { key: "speed", label: "מהירות חבילה" },
    ],
  },
  {
    id: "router",
    label: "ראוטר",
    layer: "network",
    icon: Router,
    network: true,
    creds: true,
    core: true,
    ports: 5,
    secretLabel: "סיסמת Wi-Fi",
    fields: [
      { key: "isp", label: "ספק אינטרנט" },
      { key: "wanIp", label: "כתובת WAN", ltr: true },
      { key: "ssid", label: "שם רשת (SSID)", ltr: true },
      { key: "dhcpRange", label: "טווח DHCP", ltr: true },
    ],
  },
  {
    id: "firewall",
    label: "פיירוול",
    layer: "network",
    icon: ShieldCheck,
    network: true,
    creds: true,
    core: true,
    ports: 8,
    fields: [{ key: "license", label: "רישיון בתוקף עד" }],
  },
  {
    id: "switch",
    label: "סוויץ'",
    layer: "network",
    icon: Network,
    network: true,
    creds: true,
    ports: 24,
    fields: [
      { key: "managed", label: "מנוהל", type: "select", options: ["כן", "לא"] },
      { key: "poe", label: "PoE", type: "select", options: ["ללא", "PoE", "PoE+", "PoE++"] },
      { key: "poeBudget", label: "תקציב PoE (W)", type: "number" },
    ],
  },
  {
    id: "patch",
    label: "פאץ' פאנל",
    layer: "network",
    icon: Rows3,
    ports: 24,
    fields: [
      { key: "panelNo", label: "מספר פאנל" },
      { key: "category", label: "קטגוריה", type: "select", options: ["Cat5e", "Cat6", "Cat6A", "סיב"] },
    ],
  },
  {
    id: "ap",
    label: "נקודת גישה (AP)",
    layer: "network",
    icon: Wifi,
    network: true,
    creds: true,
    secretLabel: "סיסמת Wi-Fi",
    fields: [
      { key: "ssid", label: "SSID", ltr: true },
      { key: "band", label: "תדר", type: "select", options: ["2.4GHz", "5GHz", "Dual", "Tri-band"] },
      { key: "controller", label: "בקר / ענן" },
    ],
  },
  {
    id: "jack",
    label: "נקודת רשת",
    layer: "network",
    icon: Plug,
    fields: [
      { key: "pointNo", label: "מספר נקודה" },
      { key: "jacks", label: "מספר שקעים", type: "select", options: ["1", "2", "3", "4"] },
      { key: "usedBy", label: "משמש עבור" },
    ],
  },
  {
    id: "server",
    label: "שרת / NAS",
    layer: "network",
    icon: HardDrive,
    network: true,
    creds: true,
    fields: [
      { key: "os", label: "מערכת הפעלה" },
      { key: "storage", label: "נפח אחסון" },
    ],
  },
  {
    id: "pc",
    label: "מחשב / עמדה",
    layer: "network",
    icon: Monitor,
    network: true,
    fields: [{ key: "user", label: "משתמש / עמדה" }],
  },

  // ---- cctv ----
  {
    id: "cam-dome",
    label: "מצלמת כיפה",
    layer: "cctv",
    icon: ScanEye,
    network: true,
    creds: true,
    camera: true,
    fields: camFields(),
  },
  {
    id: "cam-bullet",
    label: "מצלמת צינור",
    layer: "cctv",
    icon: Cctv,
    network: true,
    creds: true,
    camera: true,
    fields: camFields(),
  },
  {
    id: "cam-ptz",
    label: "מצלמת PTZ",
    layer: "cctv",
    icon: Video,
    network: true,
    creds: true,
    camera: true,
    fields: camFields(),
  },
  {
    id: "nvr",
    label: "NVR / DVR",
    layer: "cctv",
    icon: Box,
    network: true,
    creds: true,
    core: true,
    fields: [
      { key: "channels", label: "מספר ערוצים", type: "number" },
      { key: "hdd", label: "דיסקים / נפח" },
      { key: "retention", label: "ימי הקלטה", type: "number" },
      { key: "cloud", label: "גישה מרחוק / P2P", ltr: true },
    ],
  },

  // ---- audio ----
  {
    id: "amp",
    label: "מגבר",
    layer: "audio",
    icon: AudioLines,
    core: true,
    network: true,
    fields: [
      { key: "zones", label: "מספר אזורים", type: "number" },
      { key: "power", label: "הספק (W)", type: "number" },
      { key: "source", label: "מקור שמע" },
    ],
  },
  {
    id: "speaker",
    label: "רמקול",
    layer: "audio",
    icon: Speaker,
    fields: [
      { key: "zone", label: "אזור שמע" },
      { key: "kind", label: "סוג", type: "select", options: ["תקרה", "קיר", "שופר", "עמוד"] },
      { key: "power", label: "הספק (W)", type: "number" },
      { key: "impedance", label: "עכבה / קו 100V" },
    ],
  },
  {
    id: "mic",
    label: "מיקרופון / כריזה",
    layer: "audio",
    icon: Mic,
    fields: [{ key: "zone", label: "אזורים" }],
  },
  {
    id: "horn",
    label: "צופר כריזה",
    layer: "audio",
    icon: Megaphone,
    fields: [{ key: "zone", label: "אזור שמע" }],
  },

  // ---- alarm ----
  {
    id: "alarm-panel",
    label: "רכזת אזעקה",
    layer: "alarm",
    icon: Shield,
    core: true,
    creds: true,
    network: true,
    secretLabel: "קוד מתקין",
    fields: [
      { key: "monitoring", label: "מוקד" },
      { key: "accountNo", label: "מספר מנוי במוקד", ltr: true },
      { key: "zones", label: "מספר אזורים", type: "number" },
      { key: "comm", label: "תקשורת", type: "select", options: ["IP", "סלולרי", "IP + סלולרי", "קווי"] },
    ],
  },
  {
    id: "keypad",
    label: "לוח מקשים",
    layer: "alarm",
    icon: Keyboard,
    fields: [{ key: "address", label: "כתובת" }],
  },
  {
    id: "pir",
    label: "גלאי נפח",
    layer: "alarm",
    icon: Radar,
    fields: alarmZone(),
  },
  {
    id: "contact",
    label: "מגנט דלת/חלון",
    layer: "alarm",
    icon: Magnet,
    fields: alarmZone(),
  },
  {
    id: "smoke",
    label: "גלאי עשן",
    layer: "alarm",
    icon: AlarmSmoke,
    fields: alarmZone(),
  },
  {
    id: "siren",
    label: "צופר / נצנץ",
    layer: "alarm",
    icon: Siren,
    fields: [{ key: "kind", label: "סוג", type: "select", options: ["פנימי", "חיצוני"] }],
  },

  // ---- power ----
  {
    id: "ups",
    label: "UPS",
    layer: "power",
    icon: BatteryCharging,
    network: true,
    fields: [
      { key: "va", label: "הספק (VA)", type: "number" },
      { key: "battery", label: "תאריך החלפת סוללה" },
      { key: "load", label: "מזין את" },
    ],
  },
  {
    id: "elec-panel",
    label: "לוח חשמל",
    layer: "power",
    icon: Zap,
    core: true,
    fields: [
      { key: "breaker", label: "מפסק תקשורת" },
      { key: "location", label: "מיקום" },
    ],
  },

  // ---- infra ----
  {
    id: "junction",
    label: "קופסת חיבורים",
    layer: "infra",
    icon: Container,
    fields: [{ key: "contents", label: "מה עובר כאן" }],
  },

  // ---- other ----
  {
    id: "intercom",
    label: "אינטרקום",
    layer: "other",
    icon: Phone,
    network: true,
    creds: true,
    fields: [{ key: "extension", label: "שלוחה" }],
  },
  {
    id: "access",
    label: "בקרת כניסה",
    layer: "other",
    icon: DoorOpen,
    network: true,
    creds: true,
    fields: [
      { key: "door", label: "דלת" },
      { key: "method", label: "אמצעי", type: "select", options: ["כרטיס", "קוד", "טביעת אצבע", "פנים", "אפליקציה"] },
    ],
  },
  {
    id: "doorbell",
    label: "פעמון / מסך כניסה",
    layer: "other",
    icon: Bell,
    network: true,
    fields: [],
  },
  { id: "tv", label: "טלוויזיה / מסך", layer: "other", icon: Tv, network: true, fields: [] },
  { id: "printer", label: "מדפסת", layer: "other", icon: Printer, network: true, fields: [] },
  { id: "generic", label: "ציוד כללי", layer: "other", icon: Cpu, network: true, creds: true, fields: [] },
];

function camFields(): FieldDef[] {
  return [
    { key: "channel", label: "ערוץ ב-NVR", type: "number" },
    { key: "resolution", label: "רזולוציה", type: "select", options: ["2MP", "4MP", "5MP", "8MP (4K)"] },
    { key: "lens", label: "עדשה (mm)" },
    { key: "poe", label: "הזנה", type: "select", options: ["PoE", "12V", "24V"] },
  ];
}

function alarmZone(): FieldDef[] {
  return [
    { key: "zone", label: "מספר אזור (Zone)" },
    { key: "partition", label: "מחיצה" },
  ];
}

export const deviceTypeById = (id: string): DeviceTypeDef =>
  DEVICE_TYPES.find((d) => d.id === id) ??
  DEVICE_TYPES[DEVICE_TYPES.length - 1];

export interface CableTypeDef {
  id: string;
  label: string;
  layer: LayerId;
  color: string;
  dash?: string;
  width?: number;
}

export const CABLE_TYPES: CableTypeDef[] = [
  { id: "cat6", label: "Cat6", layer: "network", color: "#2563eb" },
  { id: "cat5e", label: "Cat5e", layer: "network", color: "#3b82f6" },
  { id: "cat6a", label: "Cat6A", layer: "network", color: "#1d4ed8" },
  { id: "fiber", label: "סיב אופטי", layer: "network", color: "#0891b2", dash: "8 4" },
  { id: "patch", label: "כבל מגשר (פאץ')", layer: "network", color: "#60a5fa", dash: "2 3" },
  { id: "cctv-cat6", label: "Cat6 למצלמה", layer: "cctv", color: "#dc2626" },
  { id: "coax", label: "קואקס RG59", layer: "cctv", color: "#b91c1c", dash: "6 3" },
  { id: "speaker", label: "כבל רמקול", layer: "audio", color: "#16a34a" },
  { id: "alarm4", label: "כבל אזעקה 4 גידים", layer: "alarm", color: "#ea580c" },
  { id: "alarm6", label: "כבל אזעקה 6 גידים", layer: "alarm", color: "#f97316" },
  { id: "power", label: "חשמל 3×1.5", layer: "power", color: "#ca8a04" },
  { id: "hdmi", label: "HDMI", layer: "other", color: "#7c3aed" },
  { id: "other", label: "אחר", layer: "other", color: "#64748b" },
];

export const TRAY_TYPES: CableTypeDef[] = [
  { id: "tray", label: "תעלת כבלים", layer: "infra", color: "#475569", width: 10 },
  { id: "conduit", label: "צינור / שרוול", layer: "infra", color: "#64748b", width: 6, dash: "10 5" },
  { id: "ceiling", label: "תוואי בתקרה", layer: "infra", color: "#94a3b8", width: 8, dash: "3 4" },
  { id: "riser", label: "פיר עולה", layer: "infra", color: "#1e293b", width: 12 },
];

export const linkTypeById = (id: string): CableTypeDef =>
  [...CABLE_TYPES, ...TRAY_TYPES].find((c) => c.id === id) ??
  CABLE_TYPES[CABLE_TYPES.length - 1];

export const AREA_COLORS = [
  "#60a5fa",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#a78bfa",
  "#94a3b8",
];
