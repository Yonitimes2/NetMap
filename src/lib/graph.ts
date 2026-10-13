import { deviceTypeById } from "./catalog";
import type { Device, LayerId, Link, Point } from "./types";

export interface TraceStep {
  device: Device;
  /** link used to reach this device from the previous step */
  link?: Link;
  /** port on the previous device */
  fromPort?: string;
  /** port on this device */
  toPort?: string;
}

export interface Trace {
  steps: TraceStep[];
  deviceIds: Set<string>;
  linkIds: Set<string>;
  reached: boolean;
}

const CORE_TARGETS: Record<LayerId, string[]> = {
  cctv: ["nvr"],
  audio: ["amp"],
  alarm: ["alarm-panel"],
  power: ["elec-panel", "ups"],
  network: ["router", "firewall", "modem"],
  infra: ["router", "firewall", "modem"],
  other: ["router", "firewall", "modem"],
};

/**
 * Finds the path from a device to the "head-end" of its system
 * (camera → NVR, speaker → amplifier, jack → router…). Direct links are always included.
 */
export function traceDevice(start: Device, devices: Device[], links: Link[]): Trace {
  const byId = new Map(devices.map((d) => [d.id, d]));
  const adj = new Map<string, { link: Link; other: string; myPort?: string; otherPort?: string }[]>();
  for (const l of links) {
    if (l.kind !== "cable" || !l.a || !l.b) continue;
    const { a, b } = l;
    if (!byId.has(a.deviceId) || !byId.has(b.deviceId)) continue;
    (adj.get(a.deviceId) ?? adj.set(a.deviceId, []).get(a.deviceId)!).push({
      link: l,
      other: b.deviceId,
      myPort: a.port,
      otherPort: b.port,
    });
    (adj.get(b.deviceId) ?? adj.set(b.deviceId, []).get(b.deviceId)!).push({
      link: l,
      other: a.deviceId,
      myPort: b.port,
      otherPort: a.port,
    });
  }

  const linkIds = new Set<string>();
  const deviceIds = new Set<string>([start.id]);
  for (const e of adj.get(start.id) ?? []) {
    linkIds.add(e.link.id);
    deviceIds.add(e.other);
  }

  const layer = deviceTypeById(start.type).layer;
  const targetSets = [CORE_TARGETS[layer], CORE_TARGETS.network];
  if (targetSets.some((t) => t.includes(start.type))) {
    return { steps: [{ device: start }], deviceIds, linkIds, reached: true };
  }

  for (const targets of targetSets) {
    const prev = new Map<string, { from: string; link: Link; fromPort?: string; toPort?: string }>();
    const seen = new Set([start.id]);
    const queue = [start.id];
    let found: string | undefined;
    while (queue.length && !found) {
      const cur = queue.shift()!;
      for (const e of adj.get(cur) ?? []) {
        if (seen.has(e.other)) continue;
        seen.add(e.other);
        prev.set(e.other, { from: cur, link: e.link, fromPort: e.myPort, toPort: e.otherPort });
        if (targets.includes(byId.get(e.other)!.type)) {
          found = e.other;
          break;
        }
        queue.push(e.other);
      }
    }
    if (!found) continue;

    const steps: TraceStep[] = [];
    let cur: string | undefined = found;
    while (cur && cur !== start.id) {
      const p: { from: string; link: Link; fromPort?: string; toPort?: string } = prev.get(cur)!;
      steps.unshift({ device: byId.get(cur)!, link: p.link, fromPort: p.fromPort, toPort: p.toPort });
      linkIds.add(p.link.id);
      deviceIds.add(cur);
      cur = p.from;
    }
    steps.unshift({ device: start });
    return { steps, deviceIds, linkIds, reached: true };
  }

  return { steps: [{ device: start }], deviceIds, linkIds, reached: false };
}

export function polylineLength(points: Point[]) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

/** Cable length in meters: manual override, else drawn length via floor scale. */
export function linkLengthM(link: Link, pxPerMeter?: number): number | undefined {
  if (link.lengthM) return link.lengthM;
  if (!pxPerMeter || link.points.length < 2) return undefined;
  return polylineLength(link.points) / pxPerMeter;
}

export function distToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
