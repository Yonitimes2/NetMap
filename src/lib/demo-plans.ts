/** Simple architectural-style SVG floor plans used for demo data. */

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  fill?: string;
}

interface Door {
  /** wall gap rectangle */
  x: number;
  y: number;
  w: number;
  h: number;
}

function buildPlan(
  width: number,
  height: number,
  rooms: Room[],
  doors: Door[],
  extras = "",
): { src: string; width: number; height: number } {
  const roomSvg = rooms
    .map(
      (r) =>
        `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.fill ?? "#ffffff"}" stroke="#334155" stroke-width="8"/>`,
    )
    .join("");
  const labels = rooms
    .map(
      (r) =>
        `<text x="${r.x + r.w / 2}" y="${r.y + r.h / 2}" font-size="26" font-family="Arial, sans-serif" fill="#94a3b8" text-anchor="middle" dominant-baseline="middle">${r.label}</text>`,
    )
    .join("");
  const doorSvg = doors
    .map(
      (d) =>
        `<rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" fill="#ffffff"/>` +
        (d.w > d.h
          ? `<path d="M${d.x} ${d.y + d.h / 2} a ${d.w} ${d.w} 0 0 1 ${d.w} ${d.w}" fill="none" stroke="#cbd5e1" stroke-width="2"/>`
          : `<path d="M${d.x + d.w / 2} ${d.y} a ${d.h} ${d.h} 0 0 0 ${d.h} ${d.h}" fill="none" stroke="#cbd5e1" stroke-width="2"/>`),
    )
    .join("");
  const grid = `<defs><pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#eef2f7" stroke-width="1"/></pattern></defs><rect width="${width}" height="${height}" fill="url(#g)"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#f8fafc"/>${grid}${roomSvg}${doorSvg}${extras}${labels}</svg>`;
  return {
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width,
    height,
  };
}

export function officePlan() {
  return buildPlan(
    1600,
    1000,
    [
      { x: 40, y: 40, w: 360, h: 400, label: "קבלה" },
      { x: 400, y: 40, w: 300, h: 400, label: "משרד 1" },
      { x: 700, y: 40, w: 300, h: 400, label: "משרד 2" },
      { x: 1000, y: 40, w: 350, h: 400, label: "חדר ישיבות" },
      { x: 1350, y: 40, w: 210, h: 400, label: "חדר שרתים", fill: "#f1f5f9" },
      { x: 40, y: 440, w: 1520, h: 120, label: "מסדרון", fill: "#fbfcfe" },
      { x: 40, y: 560, w: 660, h: 400, label: "אופן ספייס" },
      { x: 700, y: 560, w: 300, h: 400, label: "מטבחון" },
      { x: 1000, y: 560, w: 350, h: 400, label: "חדר מנכ״ל" },
      { x: 1350, y: 560, w: 210, h: 400, label: "שירותים" },
    ],
    [
      { x: 30, y: 460, w: 20, h: 80 }, // entrance
      { x: 300, y: 432, w: 70, h: 16 },
      { x: 600, y: 432, w: 70, h: 16 },
      { x: 900, y: 432, w: 70, h: 16 },
      { x: 1250, y: 432, w: 70, h: 16 },
      { x: 1420, y: 432, w: 70, h: 16 },
      { x: 300, y: 552, w: 70, h: 16 },
      { x: 800, y: 552, w: 70, h: 16 },
      { x: 1100, y: 552, w: 70, h: 16 },
      { x: 1420, y: 552, w: 70, h: 16 },
    ],
    // meeting table + desks
    `<rect x="1090" y="170" width="170" height="120" rx="12" fill="#e2e8f0"/>` +
      [80, 260].map((y) => `<rect x="480" y="${y}" width="140" height="70" fill="#e2e8f0"/><rect x="780" y="${y}" width="140" height="70" fill="#e2e8f0"/>`).join("") +
      [620, 760].map((y) => [100, 280, 460].map((x) => `<rect x="${x}" y="${y}" width="130" height="70" fill="#e2e8f0"/>`).join("")).join(""),
  );
}

export function lobbyPlan() {
  return buildPlan(
    1400,
    800,
    [
      { x: 40, y: 40, w: 1000, h: 720, label: "חניון", fill: "#f8fafc" },
      { x: 1040, y: 40, w: 320, h: 420, label: "לובי" },
      { x: 1040, y: 460, w: 320, h: 300, label: "מעליות + חדר מדרגות", fill: "#f1f5f9" },
    ],
    [
      { x: 30, y: 320, w: 20, h: 160 }, // gate
      { x: 1032, y: 180, w: 16, h: 90 },
      { x: 1352, y: 180, w: 16, h: 90 },
    ],
    Array.from({ length: 8 }, (_, i) => `<line x1="${120 + i * 110}" y1="40" x2="${120 + i * 110}" y2="240" stroke="#cbd5e1" stroke-width="4"/><line x1="${120 + i * 110}" y1="560" x2="${120 + i * 110}" y2="760" stroke="#cbd5e1" stroke-width="4"/>`).join(""),
  );
}

export function restaurantPlan() {
  return buildPlan(
    1500,
    950,
    [
      { x: 40, y: 40, w: 820, h: 560, label: "אולם" },
      { x: 860, y: 40, w: 300, h: 300, label: "בר" },
      { x: 1160, y: 40, w: 300, h: 560, label: "מטבח", fill: "#f8fafc" },
      { x: 860, y: 340, w: 300, h: 260, label: "קופה + משרד", fill: "#f1f5f9" },
      { x: 860, y: 600, w: 300, h: 310, label: "שירותים" },
      { x: 1160, y: 600, w: 300, h: 310, label: "מחסן + מקרר" },
      { x: 40, y: 600, w: 820, h: 310, label: "מרפסת", fill: "#f0fdf4" },
    ],
    [
      { x: 30, y: 250, w: 20, h: 120 }, // entrance
      { x: 852, y: 140, w: 16, h: 90 },
      { x: 1152, y: 140, w: 16, h: 90 },
      { x: 852, y: 440, w: 16, h: 80 },
      { x: 960, y: 592, w: 80, h: 16 },
      { x: 1260, y: 592, w: 80, h: 16 },
      { x: 300, y: 592, w: 200, h: 16 },
    ],
    [140, 320, 500, 680].map((x) => [140, 300, 460].map((y) => `<circle cx="${x}" cy="${y}" r="38" fill="#e2e8f0"/>`).join("")).join("") +
      [150, 400, 650].map((x) => `<circle cx="${x}" cy="760" r="42" fill="#dcfce7"/>`).join(""),
  );
}
