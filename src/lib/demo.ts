import { deviceTypeById, linkTypeById } from "./catalog";
import { lobbyPlan, officePlan, restaurantPlan } from "./demo-plans";
import { demoPlanningFloor } from "./demo-space";
import type {
  Account,
  Area,
  AuditEntry,
  ChatMessage,
  Device,
  Floor,
  Link,
  MapNote,
  Membership,
  Obstacle,
  Opening,
  Point,
  RackData,
  Site,
  User,
  Wall,
} from "./types";

export interface AppData {
  users: User[];
  memberships: Membership[];
  accounts: Account[];
  sites: Site[];
  floors: Floor[];
  devices: Device[];
  links: Link[];
  areas: Area[];
  notes: MapNote[];
  audit: AuditEntry[];
  walls: Wall[];
  openings: Opening[];
  obstacles: Obstacle[];
  /** space-assistant chat per floor */
  chats: Record<string, ChatMessage[]>;
}

/** The demo office's 12U wall cabinet, holding the equipment drawn next to it on the map. */
export function demoRack(): RackData {
  return {
    spec: { kind: "wall", units: 12, widthMm: 600, depthMm: 450, door: "glass", lock: true, fans: true, pdu: true },
    items: [
      { id: "rk-1", kind: "patch", label: "פאנל A", u: 12, height: 1, deviceId: "a-patch" },
      { id: "rk-2", kind: "cable-mgr", label: "מסדר כבלים", u: 11, height: 1 },
      { id: "rk-3", kind: "switch", label: "סוויץ' PoE ראשי", u: 10, height: 1, deviceId: "a-switch" },
      { id: "rk-4", kind: "router", label: "ראוטר ראשי", u: 9, height: 1, deviceId: "a-router" },
      { id: "rk-5", kind: "modem", label: "מודם סיבים (על מדף)", u: 8, height: 1, deviceId: "a-modem" },
      { id: "rk-6", kind: "nvr", label: "NVR ראשי", u: 6, height: 2, deviceId: "a-nvr" },
      { id: "rk-7", kind: "ups", label: "UPS ארון", u: 1, height: 2, deviceId: "a-ups" },
    ],
  };
}

export function demoData(): AppData {
  const now = Date.now();
  const devices: Device[] = [];
  const links: Link[] = [];

  const dev = (
    id: string,
    floorId: string,
    siteId: string,
    type: string,
    x: number,
    y: number,
    label: string,
    more: Partial<Device> = {},
  ) => {
    const def = deviceTypeById(type);
    devices.push({
      id,
      siteId,
      floorId,
      type,
      x,
      y,
      label,
      photos: [],
      net: {},
      creds: {},
      extra: {},
      ports: def.ports,
      camera: def.camera ? { dir: 0, fov: 90, range: 10 } : undefined,
      updatedAt: now,
      ...more,
    });
    return id;
  };

  let linkSeq = 0;
  const cable = (
    siteId: string,
    floorId: string | undefined,
    cableType: string,
    a: [string, string?],
    b: [string, string?],
    via: Point[] = [],
    label?: string,
  ) => {
    const t = linkTypeById(cableType);
    const pa = devices.find((d) => d.id === a[0])!;
    const pb = devices.find((d) => d.id === b[0])!;
    links.push({
      id: `l-${++linkSeq}`,
      siteId,
      floorId,
      kind: "cable",
      layer: t.layer,
      cableType,
      label,
      points: floorId ? [{ x: pa.x, y: pa.y }, ...via, { x: pb.x, y: pb.y }] : [],
      a: { deviceId: a[0], port: a[1] },
      b: { deviceId: b[0], port: b[1] },
    });
  };

  const tray = (
    siteId: string,
    floorId: string,
    cableType: string,
    points: Point[],
    label: string,
  ) => {
    links.push({
      id: `l-${++linkSeq}`,
      siteId,
      floorId,
      kind: "tray",
      layer: "infra",
      cableType,
      label,
      points,
    });
  };

  // ---------------- Account A: office ----------------
  const A = "acc-cohen";
  const S = "site-cohen-tlv";
  const F3 = "fl-cohen-3";
  const F0 = "fl-cohen-0";

  dev("a-modem", F3, S, "modem", 1395, 90, "מודם סיבים", {
    manufacturer: "Nokia",
    model: "G-010G-Q",
    extra: { isp: "בזק", line: "03-5551234", speed: "1000/100" },
    net: { ip: "192.168.1.254" },
  });
  dev("a-router", F3, S, "router", 1505, 90, "ראוטר ראשי", {
    manufacturer: "MikroTik",
    model: "hEX S",
    net: { ip: "192.168.1.1", subnet: "255.255.255.0", mode: "static" },
    creds: { username: "admin", password: "Cohen#2026", secret: "Welcome2026!" },
    extra: { isp: "פרטנר", wanIp: "79.180.12.44", ssid: "Cohen-Office", dhcpRange: "192.168.1.100-200" },
  });
  dev("a-rack", F3, S, "rack", 1455, 170, "ארון תקשורת ראשי", {
    extra: { location: "חדר שרתים", key: "מפתח אצל יעל בקבלה" },
    rack: demoRack(),
  });
  dev("a-switch", F3, S, "switch", 1395, 250, "סוויץ' PoE ראשי", {
    manufacturer: "TP-Link",
    model: "TL-SG3428MP",
    net: { ip: "192.168.1.2", subnet: "255.255.255.0", gateway: "192.168.1.1", mode: "static", mac: "50:C7:BF:12:34:56" },
    creds: { username: "admin", password: "Sw!tch2026" },
    extra: { managed: "כן", poe: "PoE+", poeBudget: "384" },
    installDate: "2026-03-14",
    warrantyUntil: "2029-03-14",
  });
  dev("a-patch", F3, S, "patch", 1505, 250, "פאנל A", {
    extra: { panelNo: "A", category: "Cat6" },
  });
  dev("a-nvr", F3, S, "nvr", 1395, 340, "NVR ראשי", {
    manufacturer: "Hikvision",
    model: "DS-7616NI-K2",
    serial: "DS7616-2026-88213",
    net: { ip: "192.168.1.20", subnet: "255.255.255.0", gateway: "192.168.1.1", mode: "static" },
    creds: { username: "admin", password: "Nvr!Cohen26" },
    extra: { channels: "16", hdd: "2×4TB", retention: "30", cloud: "Hik-Connect" },
    installDate: "2026-03-14",
  });
  dev("a-ups", F3, S, "ups", 1505, 340, "UPS ארון", {
    manufacturer: "APC",
    model: "SMT1500",
    extra: { va: "1500", battery: "2026-03", load: "מודם, ראוטר, סוויץ', NVR" },
  });
  dev("a-alarm", F3, S, "alarm-panel", 1390, 405, "רכזת אזעקה", {
    manufacturer: "Risco",
    model: "LightSYS+",
    creds: { username: "", password: "", secret: "1234" },
    extra: { monitoring: "מוקד אמון", accountNo: "4471", zones: "8", comm: "IP + סלולרי" },
  });
  dev("a-amp", F3, S, "amp", 1520, 405, "מגבר כריזה", {
    model: "TOA A-2240",
    extra: { zones: "3", power: "240", source: "Spotify / כריזה" },
  });

  const cams: [string, string, number, number, number, number, number][] = [
    ["a-cam1", "מצלמה כניסה ראשית", 360, 470, 180, 90, 9],
    ["a-cam2", "מצלמה קבלה", 60, 60, 45, 90, 10],
    ["a-cam3", "מצלמה מסדרון", 1330, 500, 180, 60, 26],
    ["a-cam4", "מצלמה אופן ספייס", 680, 940, 225, 100, 13],
    ["a-cam5", "מצלמה חדר שרתים", 1540, 60, 135, 90, 7],
    ["a-cam6", "מצלמה מטבחון", 980, 940, 225, 90, 8],
  ];
  cams.forEach(([id, label, x, y, dir, fov, range], i) =>
    dev(id, F3, S, i === 2 ? "cam-bullet" : "cam-dome", x, y, label, {
      manufacturer: "Hikvision",
      model: i === 2 ? "DS-2CD2T47G2-L" : "DS-2CD2143G2-I",
      net: { ip: `192.168.1.${31 + i}`, mode: "static", subnet: "255.255.255.0", gateway: "192.168.1.1" },
      creds: { username: "admin", password: "Cam!Cohen26" },
      camera: { dir, fov, range },
      extra: { channel: String(i + 1), resolution: i === 2 ? "4MP" : "4MP", poe: "PoE", lens: "2.8" },
    }),
  );

  const jacks: [number, number, string][] = [
    [420, 300, "עמדה משרד 1"],
    [680, 120, "טלפון משרד 1"],
    [720, 300, "עמדה משרד 2"],
    [980, 120, "טלפון משרד 2"],
    [1020, 230, "מסך חדר ישיבות"],
    [60, 650, "עמדה 1 אופן ספייס"],
    [60, 800, "עמדה 2 אופן ספייס"],
    [400, 940, "עמדה 3 אופן ספייס"],
    [640, 600, "מדפסת"],
    [1330, 700, "עמדה מנכ״ל"],
    [200, 420, "עמדת קבלה"],
  ];
  jacks.forEach(([x, y, usedBy], i) =>
    dev(`a-j${i + 1}`, F3, S, "jack", x, y, `נקודה ${i + 1}`, {
      extra: { pointNo: String(i + 1), jacks: "2", usedBy },
    }),
  );

  dev("a-ap1", F3, S, "ap", 760, 500, "AP מסדרון", {
    manufacturer: "Ubiquiti",
    model: "U6-Lite",
    net: { ip: "192.168.1.41", mode: "static" },
    creds: { username: "admin", password: "Ap!2026", secret: "Welcome2026!" },
    extra: { ssid: "Cohen-Office", band: "Dual", controller: "UniFi Cloud" },
  });
  dev("a-ap2", F3, S, "ap", 370, 860, "AP אופן ספייס", {
    manufacturer: "Ubiquiti",
    model: "U6-Lite",
    net: { ip: "192.168.1.42", mode: "static" },
    extra: { ssid: "Cohen-Office", band: "Dual", controller: "UniFi Cloud" },
  });
  dev("a-printer", F3, S, "printer", 600, 640, "מדפסת HP", {
    net: { ip: "192.168.1.60", mode: "static" },
  });
  dev("a-tv", F3, S, "tv", 1175, 330, "מסך ישיבות", {});

  dev("a-sp1", F3, S, "speaker", 200, 700, "רמקול אופן ספייס 1", { extra: { zone: "1", kind: "תקרה", power: "6" } });
  dev("a-sp2", F3, S, "speaker", 520, 700, "רמקול אופן ספייס 2", { extra: { zone: "1", kind: "תקרה", power: "6" } });
  dev("a-sp3", F3, S, "speaker", 1175, 110, "רמקול ישיבות", { extra: { zone: "2", kind: "תקרה", power: "6" } });
  dev("a-sp4", F3, S, "speaker", 200, 200, "רמקול קבלה", { extra: { zone: "3", kind: "תקרה", power: "6" } });

  dev("a-keypad", F3, S, "keypad", 65, 455, "לוח מקשים כניסה", { extra: { address: "1" } });
  dev("a-pir1", F3, S, "pir", 380, 60, "גלאי קבלה", { extra: { zone: "1" } });
  dev("a-pir2", F3, S, "pir", 680, 580, "גלאי אופן ספייס", { extra: { zone: "2" } });
  dev("a-pir3", F3, S, "pir", 1330, 940, "גלאי מנכ״ל", { extra: { zone: "3" } });
  dev("a-contact", F3, S, "contact", 45, 545, "מגנט דלת כניסה", { extra: { zone: "4" } });
  dev("a-smoke", F3, S, "smoke", 1455, 300, "גלאי עשן חדר שרתים", { extra: { zone: "5" } });
  dev("a-siren", F3, S, "siren", 1540, 470, "צופר פנימי", { extra: { kind: "פנימי" } });

  // corridor routing helper: go down to a lane, run to the server-room door, up into the room
  const corridor = (fromId: string, lane: number): Point[] => {
    const d = devices.find((x) => x.id === fromId)!;
    const y = 468 + lane * 7;
    const doorX = 1428 + (lane % 8) * 7;
    return [
      { x: d.x, y },
      { x: doorX, y },
      { x: doorX, y: 420 },
    ];
  };
  const rev = (p: Point[]) => [...p].reverse();

  // jacks → patch panel, patch panel → switch
  jacks.forEach((_, i) => {
    const id = `a-j${i + 1}`;
    cable(S, F3, "cat6", [id], ["a-patch", String(i + 1)], corridor(id, i % 12));
    cable(S, F3, "patch", ["a-patch", String(i + 1)], ["a-switch", String(i + 1)], [], `פאץ' ${i + 1}`);
  });
  // cameras → switch ports 13-18 → NVR on the network
  cams.forEach(([id], i) => {
    const via = id === "a-cam5" ? [] : corridor(id, (i + 3) % 12);
    cable(S, F3, "cctv-cat6", [id], ["a-switch", String(13 + i)], via);
  });
  cable(S, F3, "cat6", ["a-ap1"], ["a-switch", "19"], corridor("a-ap1", 5));
  cable(S, F3, "cat6", ["a-ap2"], ["a-switch", "20"], corridor("a-ap2", 7));
  cable(S, F3, "patch", ["a-nvr", "LAN"], ["a-switch", "24"]);
  cable(S, F3, "patch", ["a-router", "LAN1"], ["a-switch", "23"]);
  cable(S, F3, "cat6", ["a-modem", "LAN"], ["a-router", "WAN"]);
  cable(S, F3, "patch", ["a-printer"], ["a-j9", "1"]);
  cable(S, F3, "hdmi", ["a-tv"], ["a-j5"], [{ x: 1020, y: 330 }]);
  cable(S, F3, "power", ["a-ups"], ["a-rack"]);
  // speakers
  cable(S, F3, "speaker", ["a-amp", "Z1"], ["a-sp2"], rev(corridor("a-sp2", 10)));
  cable(S, F3, "speaker", ["a-sp2"], ["a-sp1"]);
  cable(S, F3, "speaker", ["a-amp", "Z2"], ["a-sp3"], rev(corridor("a-sp3", 11)));
  cable(S, F3, "speaker", ["a-amp", "Z3"], ["a-sp4"], rev(corridor("a-sp4", 9)));
  // alarm
  for (const id of ["a-keypad", "a-pir1", "a-pir2", "a-contact", "a-pir3"]) {
    cable(S, F3, "alarm4", [id], ["a-alarm"], corridor(id, 2));
  }
  cable(S, F3, "alarm4", ["a-smoke"], ["a-alarm"]);
  cable(S, F3, "alarm4", ["a-siren"], ["a-alarm"], [{ x: 1540, y: 430 }, { x: 1440, y: 430 }]);
  tray(S, F3, "tray", [{ x: 60, y: 500 }, { x: 1455, y: 500 }, { x: 1455, y: 440 }], "תעלה ראשית במסדרון");
  tray(S, F3, "riser", [{ x: 1545, y: 160 }, { x: 1545, y: 420 }], "פיר לחניון");

  // lobby / parking floor
  dev("a-sw2", F0, S, "switch", 1300, 700, "סוויץ' לובי", {
    model: "TL-SG1210P",
    net: { ip: "192.168.1.3", mode: "static" },
    ports: 8,
    extra: { managed: "לא", poe: "PoE" },
  });
  const lobbyCams: [string, string, number, number, number, number][] = [
    ["a-lcam1", "חניון צפון", 60, 60, 45, 22],
    ["a-lcam2", "חניון דרום", 1000, 760, 225, 22],
    ["a-lcam3", "שער כניסה", 90, 400, 180, 15],
    ["a-lcam4", "לובי", 1340, 60, 135, 10],
  ];
  lobbyCams.forEach(([id, label, x, y, dir, range], i) =>
    dev(id, F0, S, i === 3 ? "cam-dome" : "cam-bullet", x, y, label, {
      model: "DS-2CD2T47G2-L",
      net: { ip: `192.168.1.${37 + i}`, mode: "static" },
      creds: { username: "admin", password: "Cam!Cohen26" },
      camera: { dir, fov: 80, range },
      extra: { channel: String(7 + i), resolution: "4MP", poe: "PoE" },
    }),
  );
  dev("a-intercom", F0, S, "intercom", 1065, 230, "אינטרקום כניסה", {
    model: "2N IP Verso",
    net: { ip: "192.168.1.50", mode: "static" },
    extra: { extension: "100" },
  });
  cable(S, F0, "cctv-cat6", ["a-lcam1"], ["a-sw2", "1"], [{ x: 60, y: 300 }, { x: 1300, y: 300 }]);
  cable(S, F0, "cctv-cat6", ["a-lcam2"], ["a-sw2", "2"], [{ x: 1000, y: 700 }]);
  cable(S, F0, "cctv-cat6", ["a-lcam3"], ["a-sw2", "3"], [{ x: 90, y: 310 }, { x: 1290, y: 310 }]);
  cable(S, F0, "cctv-cat6", ["a-lcam4"], ["a-sw2", "4"], [{ x: 1340, y: 600 }]);
  cable(S, F0, "cat6", ["a-intercom"], ["a-sw2", "5"], [{ x: 1065, y: 650 }, { x: 1300, y: 650 }]);
  cable(S, undefined, "fiber", ["a-sw2", "8"], ["a-switch", "22"], [], "עלייה בפיר");
  tray(S, F0, "riser", [{ x: 1320, y: 760 }, { x: 1320, y: 480 }], "פיר לקומה 3");

  // ---------------- Account B: restaurant ----------------
  const B = "acc-hayam";
  const R = "site-hayam-jaffa";
  const RF = "fl-hayam-0";
  dev("b-modem", RF, R, "modem", 890, 470, "מודם", { extra: { isp: "הוט", speed: "500/50" } });
  dev("b-router", RF, R, "router", 900, 380, "ראוטר", {
    manufacturer: "TP-Link",
    model: "ER605",
    net: { ip: "10.0.0.1", mode: "static", subnet: "255.255.255.0" },
    creds: { username: "admin", password: "Hayam!2026", secret: "HayamGuest" },
    extra: { ssid: "HaYam-Guests", isp: "הוט" },
  });
  dev("b-switch", RF, R, "switch", 980, 380, "סוויץ' PoE", {
    model: "TL-SG1218MPE",
    ports: 16,
    net: { ip: "10.0.0.2", mode: "static" },
    extra: { managed: "כן", poe: "PoE+" },
  });
  dev("b-nvr", RF, R, "nvr", 1060, 380, "NVR", {
    model: "Dahua NVR4108",
    net: { ip: "10.0.0.20", mode: "static" },
    creds: { username: "admin", password: "Nvr!Hayam" },
    extra: { channels: "8", retention: "21" },
  });
  dev("b-amp", RF, R, "amp", 1120, 470, "מגבר", { extra: { zones: "2", power: "120" } });
  dev("b-alarm", RF, R, "alarm-panel", 900, 560, "רכזת אזעקה", {
    model: "Pima Hunter",
    creds: { secret: "9876" },
    extra: { monitoring: "מוקד שמירה יפו", accountNo: "2203" },
  });
  dev("b-ups", RF, R, "ups", 1120, 560, "UPS", { extra: { va: "1000" } });
  const bcams: [string, string, number, number, number, number][] = [
    ["b-cam1", "כניסה", 70, 200, 30, 12],
    ["b-cam2", "אולם", 840, 60, 135, 16],
    ["b-cam3", "בר", 1140, 60, 135, 9],
    ["b-cam4", "מטבח", 1440, 60, 135, 13],
    ["b-cam5", "מרפסת", 60, 890, 315, 16],
    ["b-cam6", "קופה", 1140, 360, 150, 5],
    ["b-cam7", "מחסן", 1440, 890, 225, 9],
  ];
  bcams.forEach(([id, label, x, y, dir, range], i) => {
    dev(id, RF, R, "cam-dome", x, y, `מצלמה ${label}`, {
      model: "Dahua IPC-HDW2441",
      net: { ip: `10.0.0.${31 + i}`, mode: "static" },
      creds: { username: "admin", password: "Cam!Hayam" },
      camera: { dir, fov: 95, range },
      extra: { channel: String(i + 1), resolution: "4MP", poe: "PoE" },
    });
    cable(R, RF, "cctv-cat6", [id], ["b-switch", String(i + 1)], [{ x, y: 330 }, { x: 980, y: 330 }]);
  });
  dev("b-ap1", RF, R, "ap", 450, 380, "AP אולם", {
    net: { ip: "10.0.0.41" },
    extra: { ssid: "HaYam-Guests", band: "Dual" },
  });
  cable(R, RF, "cat6", ["b-ap1"], ["b-switch", "9"], [{ x: 450, y: 330 }, { x: 980, y: 330 }]);
  cable(R, RF, "patch", ["b-router", "LAN1"], ["b-switch", "16"]);
  cable(R, RF, "patch", ["b-nvr"], ["b-switch", "15"]);
  cable(R, RF, "cat6", ["b-modem"], ["b-router", "WAN"]);
  const bsp: [number, number, string][] = [
    [230, 220, "1"],
    [590, 220, "1"],
    [230, 520, "1"],
    [590, 520, "1"],
    [250, 760, "2"],
    [560, 760, "2"],
  ];
  bsp.forEach(([x, y, zone], i) => {
    dev(`b-sp${i + 1}`, RF, R, "speaker", x, y, `רמקול ${zone === "1" ? "אולם" : "מרפסת"} ${i + 1}`, {
      extra: { zone, kind: zone === "1" ? "תקרה" : "קיר" },
    });
  });
  cable(R, RF, "speaker", ["b-amp", "Z1"], ["b-sp1"], [{ x: 1120, y: 580 }, { x: 860, y: 580 }, { x: 860, y: 220 }]);
  cable(R, RF, "speaker", ["b-sp1"], ["b-sp2"]);
  cable(R, RF, "speaker", ["b-sp2"], ["b-sp4"]);
  cable(R, RF, "speaker", ["b-sp4"], ["b-sp3"]);
  cable(R, RF, "speaker", ["b-amp", "Z2"], ["b-sp6"], [{ x: 1130, y: 620 }, { x: 560, y: 620 }]);
  cable(R, RF, "speaker", ["b-sp6"], ["b-sp5"]);
  dev("b-pir1", RF, R, "pir", 60, 60, "גלאי אולם", { extra: { zone: "1" } });
  dev("b-pir2", RF, R, "pir", 1180, 580, "גלאי מטבח", { extra: { zone: "2" } });
  dev("b-contact", RF, R, "contact", 45, 310, "מגנט כניסה", { extra: { zone: "3" } });
  dev("b-keypad", RF, R, "keypad", 70, 400, "לוח מקשים", {});
  for (const id of ["b-pir1", "b-contact", "b-keypad"]) {
    const d = devices.find((x) => x.id === id)!;
    cable(R, RF, "alarm4", [id], ["b-alarm"], [{ x: d.x, y: 590 }, { x: 900, y: 590 }]);
  }
  cable(R, RF, "alarm4", ["b-pir2"], ["b-alarm"], [{ x: 1180, y: 590 }]);
  tray(R, RF, "ceiling", [{ x: 60, y: 330 }, { x: 980, y: 330 }], "תוואי תקרה אולם");

  const planning = demoPlanningFloor(S);

  return {
    users: [
      { id: "u-installer", name: "יוני (מתקין)", email: "installer@netmap.demo", superAdmin: true },
      { id: "u-david", name: "דוד כהן", email: "david@cohen-cpa.demo" },
      { id: "u-avi", name: "אבי לוי (טכנאי)", email: "avi@netmap.demo" },
      { id: "u-ronit", name: "רונית שמש", email: "ronit@hayam.demo" },
    ],
    memberships: [
      { userId: "u-david", accountId: A, role: "admin" },
      { userId: "u-installer", accountId: A, role: "technician" },
      { userId: "u-avi", accountId: A, role: "technician" },
      { userId: "u-ronit", accountId: B, role: "admin" },
      { userId: "u-installer", accountId: B, role: "technician" },
    ],
    accounts: [
      {
        id: A,
        name: "כהן ושות׳ — רואי חשבון",
        businessType: "משרד",
        contactName: "דוד כהן",
        phone: "050-1234567",
        address: "דרך מנחם בגין 132, תל אביב",
        createdAt: now - 1000 * 60 * 60 * 24 * 200,
      },
      {
        id: B,
        name: "מסעדת הים",
        businessType: "מסעדה",
        contactName: "רונית שמש",
        phone: "052-7654321",
        address: "נמל יפו, תל אביב-יפו",
        createdAt: now - 1000 * 60 * 60 * 24 * 40,
      },
    ],
    sites: [
      { id: S, accountId: A, name: "משרד ראשי — תל אביב", address: "דרך מנחם בגין 132, קומה 3", createdAt: now },
      { id: R, accountId: B, name: "סניף נמל יפו", address: "נמל יפו", createdAt: now },
    ],
    floors: [
      { id: F3, siteId: S, name: "קומה 3 — משרדים", order: 1, plan: officePlan(), pxPerMeter: 40 },
      { id: F0, siteId: S, name: "קרקע — חניון ולובי", order: 0, plan: lobbyPlan(), pxPerMeter: 28 },
      { id: RF, siteId: R, name: "קומת קרקע", order: 0, plan: restaurantPlan(), pxPerMeter: 45 },
      planning.floor,
    ],
    devices,
    links,
    areas: [
      {
        id: "ar-1",
        siteId: S,
        floorId: F3,
        name: "ארון תקשורת ראשי",
        color: "#fbbf24",
        points: [
          { x: 1356, y: 46 },
          { x: 1554, y: 46 },
          { x: 1554, y: 434 },
          { x: 1356, y: 434 },
        ],
      },
      ...planning.areas,
    ],
    notes: [
      {
        id: "n-1",
        siteId: S,
        floorId: F3,
        x: 760,
        y: 535,
        text: "גישה לתעלה: אריח תקרה מעל דלת משרד 2",
      },
    ],
    audit: [],
    walls: planning.walls,
    openings: planning.openings,
    obstacles: planning.obstacles,
    chats: {},
  };
}
