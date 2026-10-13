"use client";

import { useApp, uid } from "./store";
import { DEFAULT_PPM } from "./space-catalog";
import { defaultRackSpec, firstFreeFromTop, rackItemDef, rackKindForDevice } from "./rack-catalog";
import type { Device, RackData } from "./types";

/** The cabinet build of a rack device (older racks only had a "size" field). */
export const rackDataOf = (rack: Device): RackData =>
  rack.rack ?? { spec: { ...defaultRackSpec(), units: Number(rack.extra.size) || defaultRackSpec().units }, items: [] };

/** The rack a device is mounted in, with its slot. */
export function rackOf(deviceId: string, devices: Device[]) {
  for (const r of devices) {
    const item = r.rack?.items.find((i) => i.deviceId === deviceId);
    if (item) return { rack: r, item };
  }
  return null;
}

/** Why a device of this type can't go into the rack right now, or null if it can. */
export function mountProblem(type: string, rack: Device): string | null {
  const kind = rackKindForDevice(type);
  if (!kind) return "הציוד הזה לא נכנס לארון תקשורת";
  const data = rackDataOf(rack);
  const def = rackItemDef(kind);
  if (firstFreeFromTop(data.items, data.spec.units, def.height) === null) {
    return `אין מקום פנוי של ${def.height}U בארון "${rack.label}". הגדילו את הארון או הוציאו ציוד.`;
  }
  return null;
}

/**
 * Mounts a device into the top free slot of a rack (moving it out of any other rack) and parks it
 * next to the cabinet on the map. Returns the slot, or the reason it didn't fit.
 */
export function mountInRack(deviceId: string, rackId: string): { ok: true; u: number } | { ok: false; reason: string } {
  const st = useApp.getState();
  const dev = st.devices.find((d) => d.id === deviceId);
  const rack = st.devices.find((d) => d.id === rackId);
  if (!dev || !rack) return { ok: false, reason: "לא נמצא" };
  if (dev.floorId !== rack.floorId) return { ok: false, reason: "הציוד והארון נמצאים בקומות שונות" };
  const current = rackOf(dev.id, st.devices);
  if (current?.rack.id === rack.id) return { ok: false, reason: `"${dev.label}" כבר נמצא בארון הזה` };
  const problem = mountProblem(dev.type, rack);
  if (problem) return { ok: false, reason: problem };

  if (current) {
    const data = rackDataOf(current.rack);
    st.updateDevice(current.rack.id, { rack: { ...data, items: data.items.filter((i) => i.deviceId !== dev.id) } });
  }
  const data = rackDataOf(rack);
  const def = rackItemDef(rackKindForDevice(dev.type)!);
  const u = firstFreeFromTop(data.items, data.spec.units, def.height)!;
  st.updateDevice(rack.id, {
    rack: { ...data, items: [...data.items, { id: uid(), kind: def.kind, label: dev.label, u, height: def.height, deviceId: dev.id }] },
  });
  // park it beside the cabinet: that's where it shows when the rack is expanded or it's taken out
  const ppm = st.floors.find((f) => f.id === rack.floorId)?.pxPerMeter ?? DEFAULT_PPM;
  const n = data.items.filter((i) => i.deviceId).length;
  st.moveDevice(dev.id, rack.x + ((n % 3) - 1) * 0.8 * ppm, rack.y + 1.2 * ppm);
  return { ok: true, u };
}
