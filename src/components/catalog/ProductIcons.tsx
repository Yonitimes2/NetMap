"use client";

import {
  Aperture,
  AudioLines,
  BellRing,
  Brain,
  Cable,
  Car,
  Flashlight,
  Focus,
  Hammer,
  HardDrive,
  Lightbulb,
  MemoryStick,
  Mic,
  Network,
  Palette,
  PersonStanding,
  Phone,
  Plug,
  ScanFace,
  Server,
  Settings2,
  ShieldCheck,
  ShieldHalf,
  Signal,
  Siren,
  Sun,
  SunMoon,
  Thermometer,
  Zap,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import { cx } from "../ui";
import { CAMERA_CATEGORIES, type BoxIcon, type CatalogCategory, type ProductParams } from "@/lib/products/types";

/**
 * Product icons:
 * - the manufacturer's main icons, as printed on the box (images from their site), kept as they are
 * - NetMap technical tiles (IR range, PoE, WDR, IP rating…) and general icons for everything else,
 *   built from the planning parameters, so they look the same for every brand and follow corrections
 */

// ---------- the manufacturer's box icons ----------

const BOX_TITLE: [RegExp, string][] = [
  [/^DDA(\d)$/, "אנליטיקה DDA$1"],
  [/pixel/i, "אנליטיקה מבוססת פיקסלים"],
  [/^IR_LED$/, "תאורת אינפרה-אדום"],
  [/^White_LED$/, "תאורת אור לבן"],
  [/^Hybrid$/, "תאורה היברידית"],
  [/^Face_Detection$/, "זיהוי פנים"],
  [/^Face_Recognition$/, "זיהוי פנים במקליט"],
  [/^No_Face$/, "ללא זיהוי פנים"],
  [/^NDAA$/, "תקן NDAA"],
  [/^Fixed$/, "עדשה קבועה"],
  [/^VF$/, "עדשה משתנה"],
  [/^MVF$/, "עדשה משתנה ממונעת"],
  [/^ONVIF_(.+)$/, "ONVIF"],
  [/^No_PoE$/, "ללא PoE"],
  [/^AI_Engine$/, "מנוע AI"],
  [/^No_AI_Engine$/, "ללא מנוע AI"],
];
const boxTitle = (name: string) => {
  for (const [re, t] of BOX_TITLE) if (re.test(name)) return name.replace(re, t);
  return name.replace(/_/g, " ");
};

/** Which topics the box icons already show, so NetMap's own icons don't repeat them. */
function boxTopics(icons: BoxIcon[]): Set<string> {
  const t = new Set<string>();
  for (const { name } of icons) {
    if (/^DDA|pixel|AI_Engine/i.test(name)) t.add("analytics");
    if (/IR_LED|White_LED|Hybrid/.test(name)) t.add("light");
    if (/Face/.test(name)) t.add("face");
    if (/NDAA/.test(name)) t.add("ndaa");
    if (/^(Fixed|VF|MVF)$/.test(name)) t.add("lens");
    if (/^ONVIF/.test(name)) t.add("onvif");
    if (/PoE/.test(name)) t.add("poe");
  }
  return t;
}

export function BoxIcons({ icons, size = "sm" }: { icons: BoxIcon[]; size?: "sm" | "lg" }) {
  if (!icons.length) return null;
  if (size === "sm") {
    return (
      <span className="flex flex-wrap gap-1">
        {icons.map((i) => (
          // eslint-disable-next-line @next/next/no-img-element -- served by our API with the session cookie
          <img key={i.iconId} src={`/api/catalog/icons/${i.iconId}`} alt={boxTitle(i.name)} title={boxTitle(i.name)} loading="lazy" className="h-6 w-auto rounded-md bg-white ring-1 ring-slate-200" />
        ))}
      </span>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {icons.map((i) => (
        <div key={i.iconId} className="flex h-14 items-center justify-center rounded-full bg-white px-3 shadow-sm ring-1 ring-slate-200" title={boxTitle(i.name)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/catalog/icons/${i.iconId}`} alt={boxTitle(i.name)} loading="lazy" className="max-h-9 w-auto" />
        </div>
      ))}
    </div>
  );
}

// ---------- NetMap technical tiles ----------

export interface Tile {
  value: string;
  label: string;
}

export function techTiles(category: CatalogCategory, p: ProductParams): Tile[] {
  const t: Tile[] = [];
  if (CAMERA_CATEGORIES.includes(category)) {
    if (p.mp) t.push({ value: `${p.mp}MP`, label: "רזולוציה" });
    if (p.opticalZoom) t.push({ value: `x${p.opticalZoom}`, label: "זום אופטי" });
    else if (p.lensMm) t.push({ value: p.lensMm[0] === p.lensMm[1] ? `${p.lensMm[0]}mm` : `${p.lensMm[0]}-${p.lensMm[1]}`, label: p.fovDeg ? `${Math.round(p.fovDeg)}°` : "עדשה" });
    if (p.irM) t.push({ value: `${p.irM}m`, label: p.illumination === "white" ? "אור לבן" : p.illumination === "dual" ? "היברידי" : "IR" });
    if (p.poe) t.push({ value: "PoE", label: p.powerW ? `${p.powerW}W` : "הזנה" });
    else if (p.powerW) t.push({ value: `${p.powerW}W`, label: "הספק" });
    if (p.wdr) t.push({ value: "WDR", label: p.wdr === "true" ? "120dB" : "דיגיטלי" });
    if (p.ipRating) t.push({ value: p.ipRating, label: "עמידות" });
    if (p.dori?.detect) t.push({ value: `${p.dori.detect}m`, label: "טווח גילוי" });
  } else if (category === "nvr") {
    if (p.channels) t.push({ value: String(p.channels), label: "ערוצים" });
    if (p.maxRecordMp) t.push({ value: `${p.maxRecordMp}MP`, label: "הקלטה" });
    if (p.includedTb !== undefined) t.push({ value: p.includedTb ? `${p.includedTb}TB` : "אין", label: "דיסק כלול" });
    if (p.hddBays) t.push({ value: String(p.hddBays), label: "מקומות לדיסק" });
    if (p.maxHddTb) t.push({ value: `${p.maxHddTb}TB`, label: "נפח מקסימלי" });
    if (p.incomingMbps) t.push({ value: String(p.incomingMbps), label: "Mbps" });
    if (p.poePorts) t.push({ value: String(p.poePorts), label: "PoE" });
  } else if (category === "switch") {
    if (p.ports) t.push({ value: String(p.ports), label: "פורטים" });
    if (p.poePorts) t.push({ value: String(p.poePorts), label: "PoE" });
    if (p.poeBudgetW) t.push({ value: `${p.poeBudgetW}W`, label: "תקציב PoE" });
    if (p.portSpeed) t.push({ value: p.portSpeed, label: "מהירות" });
    if (p.uplinks) t.push({ value: String(p.uplinks), label: "Uplink" });
    if (p.sfp) t.push({ value: String(p.sfp), label: "SFP" });
  } else if (category === "speaker") {
    if (p.watts) t.push({ value: `${p.watts}W`, label: "הספק" });
    if (p.poe) t.push({ value: "PoE", label: "הזנה" });
    if (p.ipRating) t.push({ value: p.ipRating, label: "עמידות" });
  }
  return t;
}

export function TechTiles({ tiles, size = "lg" }: { tiles: Tile[]; size?: "sm" | "lg" }) {
  if (!tiles.length) return null;
  return (
    <div className={cx("flex flex-wrap", size === "lg" ? "gap-2" : "gap-1")}>
      {tiles.map((t) => (
        <span
          key={t.value + t.label}
          className={cx(
            "flex flex-col items-center justify-center rounded-lg bg-slate-500 text-center leading-tight text-white",
            size === "lg" ? "size-16 px-1" : "h-10 min-w-10 px-1.5",
          )}
        >
          <span className={cx("ltr font-bold", size === "lg" ? "text-base" : "text-[11px]")}>{t.value}</span>
          <span className={cx("truncate", size === "lg" ? "text-[10px]" : "text-[9px]")}>{t.label}</span>
        </span>
      ))}
    </div>
  );
}

// ---------- NetMap general icons ----------

export interface GeneralBadge {
  key: string;
  topic: string;
  label: string;
  icon: LucideIcon;
}

export function generalBadges(category: CatalogCategory, p: ProductParams, box: BoxIcon[] = []): GeneralBadge[] {
  const b: GeneralBadge[] = [];
  const add = (topic: string, key: string, label: string, icon: LucideIcon) => b.push({ topic, key, label, icon });
  const has = (a: string) => p.analytics?.includes(a);
  if (CAMERA_CATEGORIES.includes(category)) {
    if (category === "thermal") add("type", "thermal", "מצלמה תרמית", Thermometer);
    if (category === "solar") add("type", "solar", "מצלמה סולארית", Sun);
    if (p.dda) add("analytics", "dda", `אנליטיקה DDA${p.dda}`, Brain);
    else if (p.analytics?.length) add("analytics", "analytics", "אנליטיקה", Brain);
    if (has("זיהוי אדם ורכב")) add("hv", "hv", "זיהוי אדם ורכב", PersonStanding);
    if (has("זיהוי פנים")) add("face", "face", "זיהוי פנים", ScanFace);
    if (has("זיהוי לוחיות רישוי")) add("lpr", "lpr", "זיהוי לוחיות רישוי", Car);
    if (p.deterrence) add("deterrence", "deterrence", "הרתעה אקטיבית", Siren);
    if (p.illumination === "ir") add("light", "ir", "אינפרה-אדום", Flashlight);
    else if (p.illumination === "white") add("light", "white", "אור לבן", Lightbulb);
    else if (p.illumination === "dual") add("light", "dual", "תאורה היברידית", SunMoon);
    if (p.colorNight) add("color", "color", "צבע בלילה", Palette);
    if (p.lensType === "fixed") add("lens", "fixed", "עדשה קבועה", Aperture);
    else if (p.lensType === "vf") add("lens", "vf", "עדשה משתנה", ZoomIn);
    else if (p.lensType === "mvf") add("lens", "mvf", "עדשה ממונעת", Focus);
    else if (p.lensType === "zoom") add("lens", "zoom", p.opticalZoom ? `זום אופטי x${p.opticalZoom}` : "זום אופטי", ZoomIn);
    if (p.audio === "mic") add("audio", "mic", "מיקרופון מובנה", Mic);
    else if (p.audio === "two-way") add("audio", "two-way", "שמע דו-כיווני", AudioLines);
    else if (p.audio === "input") add("audio", "input", "כניסת שמע", AudioLines);
    if (p.sdCard) add("sd", "sd", "כרטיס SD", MemoryStick);
    if (p.alarmIO) add("alarm", "alarm", "כניסות/יציאות אזעקה", BellRing);
    if (p.sim4g) add("sim", "sim", "סלולרי 4G", Signal);
    if (p.vandal) add("vandal", "vandal", "מוגנת ונדליזם IK10", Hammer);
    if (p.ndaa) add("ndaa", "ndaa", "תקן NDAA", ShieldCheck);
    if (p.cyber) add("cyber", "cyber", "הגנת סייבר", ShieldHalf);
    if (p.onvif) add("onvif", "onvif", `ONVIF ${p.onvif}`, Network);
  } else if (category === "nvr") {
    if (p.analytics?.length) add("analytics", "analytics", "אנליטיקה", Brain);
    if (p.faceRecognition) add("face", "face", "זיהוי פנים", ScanFace);
    if (p.poePorts) add("poe", "poe", "PoE מובנה", Plug);
    if (p.raid) add("raid", "raid", "RAID", HardDrive);
    if (p.ndaa) add("ndaa", "ndaa", "תקן NDAA", ShieldCheck);
  } else if (category === "switch") {
    add("managed", "managed", p.managed ? "מתג מנוהל" : "מתג לא מנוהל", Settings2);
    if (p.portSpeed === "1G") add("speed", "gig", "פורטי גיגה", Zap);
    if (p.sfp) add("sfp", "sfp", "SFP", Cable);
    if (p.rackMount) add("rack", "rack", "לארון 19״", Server);
  } else if (category === "speaker") {
    if (p.sip) add("sip", "sip", "SIP", Phone);
    if (p.poe) add("poe", "poe", "PoE", Plug);
  }
  const covered = boxTopics(box);
  return b.filter((x) => !covered.has(x.topic));
}

export function GeneralBadges({ badges, compact }: { badges: GeneralBadge[]; compact?: boolean }) {
  if (!badges.length) return null;
  if (compact) {
    return (
      <span className="flex flex-wrap gap-1">
        {badges.map(({ key, label, icon: Icon }) => (
          <span key={key} title={label} aria-label={label} className="grid size-6 place-items-center rounded-md bg-slate-100 text-slate-600">
            <Icon size={14} />
          </span>
        ))}
      </span>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {badges.map(({ key, label, icon: Icon }) => (
        <span key={key} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
          <Icon size={18} className="shrink-0 text-slate-600" />
          <span className="min-w-0">{label}</span>
        </span>
      ))}
    </div>
  );
}
