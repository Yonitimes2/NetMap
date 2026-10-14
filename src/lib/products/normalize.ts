import type { CatalogCategory, Dori, FormFactor, LensType, ProductParams, SpecGroup } from "./types";
import { CAMERA_CATEGORIES } from "./types";

/**
 * Turns a product page (spec table, highlights, feature badges) into the fixed parameters the
 * planner works with. Only what can be read reliably is filled in; the rest stays empty.
 */

export interface NormalizeInput {
  category: CatalogCategory;
  model: string;
  name: string;
  overview: string[];
  specs: SpecGroup[];
  features: string[];
}

const num = (s: string | undefined) => {
  const m = s?.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : undefined;
};
const yes = (s: string | undefined) => !!s && !/^(n\/a|no|none|-|—)$/i.test(s.trim()) && !/^no\b/i.test(s.trim());

function specLookup(specs: SpecGroup[]) {
  const all = specs.flatMap((g) => g.items.map((i) => ({ g: g.group.toLowerCase(), k: i.k.toLowerCase(), v: i.v })));
  /** first value whose key matches (optionally only in groups matching `group`) */
  return (key: RegExp, group?: RegExp) => all.find((x) => key.test(x.k) && (!group || group.test(x.g)))?.v;
}

function formFactorOf(model: string, name: string, overview: string[]): FormFactor | undefined {
  const en = (overview[0] ?? "").toLowerCase();
  if (/\bptz\b|speed dome/.test(en) || /PTZ/.test(name)) return "ptz";
  if (/fish ?eye|panoramic/.test(en)) return "fisheye";
  if (/turret/.test(en)) return "turret";
  if (/dome/.test(en)) return "dome";
  if (/bullet/.test(en)) return "bullet";
  if (/\bbox\b/.test(en)) return "box";
  if (/צינור/.test(name)) return "bullet";
  if (/טורט/.test(name)) return "turret";
  if (/כיפה/.test(name)) return "dome";
  if (/עין דג|פנורמ/.test(name)) return "fisheye";
  // Provision model prefixes
  if (/^(DI|DAI|DV|DH|DMA|DX)/.test(model)) return "dome";
  if (/^(I\d|BSH|BMH|BLH|BX|IV)/.test(model)) return "bullet";
  if (/^Z\d|^MZ|PT/.test(model)) return "ptz";
  return undefined;
}

function lensOf(lensText: string | undefined, features: string[]): { lensType?: LensType; lensMm?: [number, number]; fovDeg?: number; fovTeleDeg?: number } {
  if (!lensText) return {};
  // "2.8-12mm MVF with Auto Focus (105°-33°)", "2.8mm (106°)", "Optical: 12mm (27°)\nThermal: 19mm (20°)"
  const firstLine = lensText.split("\n")[0];
  const mm = firstLine.match(/(\d+(?:\.\d+)?)\s*(?:[-~]\s*(\d+(?:\.\d+)?))?\s*mm/i);
  // angles in brackets: "(105°-33°)", "(97-32°)" (one degree sign for both) or "(106°)"
  const bracket = firstLine.match(/\(([^)]*°[^)]*)\)/)?.[1];
  const deg = bracket
    ? [...bracket.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])).filter((d) => d > 0 && d <= 360)
    : [...firstLine.matchAll(/(\d+(?:\.\d+)?)\s*°/g)].map((m) => Number(m[1]));
  const motor = /\bMVF\b|motori[sz]ed/i.test(firstLine) || features.includes("MVF");
  const vari = !!mm?.[2] || /\bVF\b|vari-?focal/i.test(firstLine) || features.includes("VF");
  return {
    lensType: motor ? "mvf" : vari ? "vf" : "fixed",
    lensMm: mm ? [Number(mm[1]), Number(mm[2] ?? mm[1])] : undefined,
    fovDeg: deg.length ? Math.max(...deg) : undefined,
    fovTeleDeg: deg.length > 1 ? Math.min(...deg) : undefined,
  };
}

/** "2.8~12mm(W): 43m(142ft) - 2.8~12mm(T): 120m" or "51.01m(167.35ft)": the wide-end distance */
const doriMeters = (s: string | undefined) => {
  if (!s) return undefined;
  const m = s.match(/(\d+(?:\.\d+)?)\s*m\b/);
  return m ? Math.round(Number(m[1])) : undefined;
};

function analyticsOf(text: string, features: string[]): string[] {
  const t = text.toLowerCase();
  const out = new Set<string>();
  if (/tamper/.test(t)) out.add("חבלה במצלמה");
  if (/human\s*&?\s*vehicle|human and vehicle|object class/.test(t)) out.add("זיהוי אדם ורכב");
  if (/line crossing/.test(t)) out.add("חציית קו");
  if (/sterile area|intrusion|perimeter/.test(t)) out.add("חדירה לאזור");
  if (/face/.test(t) || features.some((f) => /^Face_(Detection|Recognition)$/.test(f))) out.add("זיהוי פנים");
  if (/\blpr\b|license plate|anpr/.test(t)) out.add("זיהוי לוחיות רישוי");
  if (/people counting|counting/.test(t)) out.add("ספירת אנשים");
  if (/loiter/.test(t)) out.add("שוטטות");
  if (/item monitoring|object (left|removed)|abandon/.test(t)) out.add("חפץ שננטש / נלקח");
  if (/crowd/.test(t)) out.add("התקהלות");
  if (/smoke|fire/.test(t)) out.add("אש ועשן");
  if (features.includes("Active_Deterrence")) out.add("הרתעה אקטיבית");
  return [...out];
}

/** "Profile M/T/S/G" or the badge "ONVIF_T_S_G": "M/T/S/G" */
function onvifOf(spec: string | undefined, features: string[]): string | undefined {
  const fromSpec = spec?.match(/profile\s*([A-Z](?:\s*\/\s*[A-Z])*)/i)?.[1]?.replace(/\s/g, "").toUpperCase();
  if (fromSpec) return fromSpec;
  const badge = features.find((t) => /^ONVIF_/.test(t));
  if (badge) return badge.slice(6).split("_").join("/");
  return spec && /yes/i.test(spec) ? "כן" : undefined;
}

function cameraParams(x: NormalizeInput): ProductParams {
  const get = specLookup(x.specs);
  const f = x.features;
  const allText = [...x.overview, ...x.specs.flatMap((g) => g.items.map((i) => `${i.k}: ${i.v}`))].join("\n");

  const pixels = get(/^effective pixels$/) ?? get(/resolution/);
  const wh = pixels?.match(/(\d{3,5})\s*[x×*]\s*(\d{3,5})/);
  const mpFromModel = (() => {
    // Provision models: 320 = 2MP, 340 = 4MP, 350 = 5MP, 360 = 6MP, 380 = 8MP
    const m = x.model.match(/-[A-Z]*(\d)(\d)0[A-Z]/);
    return m && m[1] === "3" ? Number(m[2]) : undefined;
  })();
  const mp = wh ? Math.round((Number(wh[1]) * Number(wh[2])) / 1e6) || 1 : mpFromModel;

  const lens = lensOf(get(/lens \(field of view\)|^lens$|focal length/) ?? x.overview.find((o) => /^lens:/i.test(o))?.replace(/^lens:\s*/i, ""), f);
  const ptzFov = get(/horizontal field of view/);
  const zoom = num(get(/optical zoom/));
  if (ptzFov) {
    const deg = [...ptzFov.matchAll(/(\d+(?:\.\d+)?)\s*°/g)].map((m) => Number(m[1]));
    if (deg.length) {
      lens.fovDeg = Math.max(...deg);
      lens.fovTeleDeg = Math.min(...deg);
    }
    lens.lensType = "zoom";
  }

  const illum = get(/^illumination$/) ?? get(/ir distance/) ?? "";
  const irM = num(illum.match(/(\d+(?:\.\d+)?)\s*m/)?.[0]) ?? num(f.find((t) => /^(IR|White)_\d+m$/.test(t)));
  const hasWhite = /white/i.test(illum) || f.some((t) => /^White_/.test(t));
  const hasIr = /\bir\b/i.test(illum) || f.some((t) => /^IR_/.test(t)) || f.includes("Hybrid");
  const dayNight = get(/day\s*&\s*night/) ?? "";

  const power = [get(/^power supply$/), get(/power consumption/), get(/^power$/)].filter(Boolean).join(" ");
  const poeW = num(power.match(/PoE\s*\/?\s*~?\s*(\d+(?:\.\d+)?)\s*W/i)?.[1]) ?? num(power.match(/(\d+(?:\.\d+)?)\s*W/i)?.[1]);
  const poe = /poe/i.test(power) || yes(get(/^poe$/)) || /\+PoE/i.test(get(/^network$/) ?? "") || f.includes("PoE");

  const prot = get(/protection rate/) ?? "";
  const ip = (prot.match(/IP6\d/i)?.[0] ?? f.find((t) => /^IP6\d$/.test(t)))?.toUpperCase();
  const audioText = [get(/audio connectivity/), get(/^communication$/), get(/audio input/), get(/audio output/)].filter(Boolean).join(" ").toLowerCase();
  const analyticsText = [get(/^analytics$/), get(/supported analytics/), ...x.overview].filter(Boolean).join(" ");
  const ddaFeature = f.find((t) => /^DDA\d$/.test(t));
  const dori: Dori = { detect: doriMeters(get(/^detect$/)), recognize: doriMeters(get(/^recognize$/)), identify: doriMeters(get(/^identify$/)) };

  return {
    mp,
    resolution: wh ? `${wh[1]}x${wh[2]}` : undefined,
    sensor: get(/image sensor/)?.split("\n")[0],
    formFactor: x.category === "ptz" ? "ptz" : formFactorOf(x.model, x.name, x.overview),
    ...lens,
    opticalZoom: zoom,
    irM,
    illumination: hasWhite && hasIr ? "dual" : hasWhite ? "white" : hasIr ? "ir" : irM ? "ir" : "none",
    colorNight: /full-?color|colou?r ?vu|24\/7/i.test(dayNight) || hasWhite || /rainbow|color night/i.test(allText),
    wdr: /true wdr|120\s*db/i.test(get(/image enhancement|wdr range/) ?? "") || f.some((t) => /True_WDR/.test(t)) ? "true" : /dwdr|digital wdr/i.test(allText) ? "digital" : undefined,
    analytics: analyticsOf(analyticsText, f),
    dda: ddaFeature ? Number(ddaFeature.slice(3)) : num(analyticsText.match(/DDA\s?(\d)/)?.[1]),
    poe,
    powerW: poeW,
    ipRating: ip,
    vandal: /ik\s?10/i.test(allText),
    audio: /two-?way|2-way/.test(audioText) ? "two-way" : /microphone/.test(audioText) ? "mic" : /audio in|audio input/.test(audioText) ? "input" : audioText ? "none" : undefined,
    sdCard: yes(get(/^sd card$/)),
    ndaa: /yes/i.test(get(/^ndaa compliant$/) ?? "") || f.includes("NDAA"),
    cyber: /check ?point|quantum/i.test(get(/^general$/, /cyber/) ?? ""),
    dori: dori.detect || dori.recognize || dori.identify ? dori : undefined,
    thermalResolution: get(/thermal resolution/)?.replace(/×/g, "x"),
    sim4g: !!get(/sim card/) || f.includes("Cellular"),
    onvif: onvifOf(get(/^onvif$/), f),
    alarmIO: /alarm\s*in/i.test(get(/^alarm$/) ?? "") || !!(yes(get(/^alarm in$/)) && yes(get(/^alarm out$/))) || f.includes("Alarm_In_out"),
    deterrence: f.includes("Active_Deterrence") || /strobe|siren|active deterrence/i.test(allText),
  };
}

function nvrParams(x: NormalizeInput): ProductParams {
  const get = specLookup(x.specs);
  const poePorts = num(get(/^poe ports$/, /poe/));
  const rec = get(/real-time recording/) ?? "";
  return {
    channels: num(get(/video input/)) ?? num(x.model.match(/NVR\d+-(\d{1,2})\d{2,3}/)?.[1]),
    poePorts: poePorts ?? (x.features.includes("No_PoE") ? 0 : undefined),
    hddBays: num(get(/^hdd$/)),
    maxHddTb: num(get(/total hdd max capacity/)) ?? num(get(/hdd max capacity/)),
    maxRecordMp: num(rec.match(/(\d+)\s*MP/i)?.[1]),
    incomingMbps: num(get(/^incoming$/)),
    raid: /yes/i.test(get(/^raid$/) ?? "") || x.features.includes("RAID"),
    analytics: analyticsOf([get(/supported analytics/), get(/search mode/)].filter(Boolean).join(" "), x.features),
    faceRecognition: x.features.includes("Face_Recognition") || yes(get(/face recognition rate/)),
    ndaa: /yes/i.test(get(/^ndaa compliant$/) ?? "") || x.features.includes("NDAA"),
  };
}

function switchParams(x: NormalizeInput): ProductParams {
  const get = specLookup(x.specs);
  const down = get(/downlink ports/) ?? "";
  const up = get(/uplink ports/) ?? "";
  const sfp = get(/^sfp ports$/);
  return {
    ports: num(down.match(/(\d+)\s*[*x×]/)?.[1]) ?? num(down),
    poePorts: num(get(/^poe ports$/)),
    poeBudgetW: num(get(/poe total power/)),
    portSpeed: /1000|gigabit|10\/100\/1000/i.test(down) ? "1G" : down ? "100M" : undefined,
    uplinks: num(up.match(/(\d+)\s*[*x×]/)?.[1]) ?? (up && !/n\/a/i.test(up) ? num(up) : undefined),
    sfp: sfp && !/n\/a/i.test(sfp) ? num(sfp.match(/(\d+)\s*[*x×]/)?.[1]) ?? 1 : undefined,
    managed: /\bmanaged\b|web (management|smart)/i.test([...x.overview, x.name].join(" ")) && !/unmanaged/i.test(x.overview.join(" ")),
    rackMount: /yes/i.test(get(/rack bracket/) ?? ""),
  };
}

function speakerParams(x: NormalizeInput): ProductParams {
  const get = specLookup(x.specs);
  const power = [get(/^power$/), get(/power consumption/)].filter(Boolean).join(" ");
  return {
    watts: num(get(/^amplifier$/)?.match(/(\d+)\s*W/i)?.[1]) ?? num(power.match(/(\d+)\s*W/i)?.[1]),
    sip: /sip/i.test(get(/^protocols$/) ?? "") || /sip/i.test(get(/voip/) ?? ""),
    poe: /poe/i.test(power),
    ipRating: get(/protection rate/)?.match(/IP6\d/i)?.[0]?.toUpperCase(),
    mount: get(/installation/),
  };
}

/** Removes empty values, so stored params only hold what was actually found. */
function clean<T extends object>(p: T): T {
  return Object.fromEntries(
    Object.entries(p).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)),
  ) as T;
}

export function normalizeProduct(x: NormalizeInput): ProductParams {
  if (CAMERA_CATEGORIES.includes(x.category)) return clean(cameraParams(x));
  if (x.category === "nvr") return clean(nvrParams(x));
  if (x.category === "switch") return clean(switchParams(x));
  if (x.category === "speaker") return clean(speakerParams(x));
  return {};
}
