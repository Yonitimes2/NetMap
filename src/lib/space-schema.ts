import { z } from "zod";

/**
 * Space model in METERS, exchanged with the space assistant.
 * Origin is the top-left of the floor, x grows right, y grows down.
 */

const PointM = z.strictObject({ x: z.number(), y: z.number() });

export const WallM = z.strictObject({
  id: z.string().describe("Keep existing ids. For new walls invent a short id like 'w12'."),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  type: z.enum(["concrete", "mamad", "block", "drywall", "glass", "wood", "sandwich", "partition", "fence"]),
  exterior: z.boolean().optional(),
  thicknessCm: z.number().optional(),
  heightM: z.number().optional(),
  cablePass: z.enum(["yes", "partial", "no", "unknown"]).optional().describe("Existing cable pass-through (השחלה) in this wall"),
  conduit: z.string().optional().describe("Conduit inside the wall, e.g. 'צינור 25 מ״מ'"),
  pullString: z.boolean().optional(),
  drilling: z.enum(["allowed", "restricted", "forbidden"]).optional(),
  finish: z.string().optional(),
  notes: z.string().optional(),
});

export const OpeningM = z.strictObject({
  id: z.string(),
  wallId: z.string().describe("id of the wall this opening sits in"),
  kind: z.enum(["door", "window", "vitrine", "gate", "passage"]),
  offsetM: z.number().describe("distance from the wall's (x1,y1) end to the opening's center, in meters"),
  widthM: z.number(),
  heightM: z.number().optional(),
  notes: z.string().optional(),
});

export const RoomM = z.strictObject({
  id: z.string(),
  name: z.string(),
  polygon: z.array(PointM).describe("room outline corners in order, meters"),
  usage: z.string().optional(),
  outdoor: z.boolean().optional(),
  ceilingType: z.enum(["acoustic", "drywall", "concrete", "open", "metal", "wood", "none"]).optional(),
  ceilingHeightM: z.number().optional(),
  plenumM: z.number().optional().describe("height of the void above a dropped ceiling"),
  plenumAccess: z.boolean().optional(),
  floorKind: z.enum(["regular", "raised", "ducts"]).optional(),
  lighting: z.enum(["good", "low", "dark", "sun", "backlight"]).optional(),
  env: z.array(z.enum(["humid", "dusty", "hot", "rain", "vandal"])).optional(),
  noCameras: z.boolean().optional().describe("privacy zone, e.g. restrooms / changing rooms"),
  power: z.enum(["available", "limited", "none"]).optional(),
  notes: z.string().optional(),
});

export const ObstacleM = z.strictObject({
  id: z.string(),
  kind: z.enum(["column", "stairs", "elevator", "shaft"]),
  x: z.number().describe("center x, meters"),
  y: z.number().describe("center y, meters"),
  w: z.number(),
  h: z.number(),
  notes: z.string().optional(),
});

export const SpaceM = z.strictObject({
  walls: z.array(WallM),
  openings: z.array(OpeningM),
  rooms: z.array(RoomM),
  obstacles: z.array(ObstacleM),
});

export const AssistantReply = z.strictObject({
  reply: z.string().describe("Short answer to the installer, in Hebrew"),
  questions: z.array(z.string()).describe("Follow-up questions (Hebrew) about missing details; empty if none"),
  space: SpaceM.nullable().describe("The COMPLETE updated space, or null if nothing changed"),
});

export type SpaceModelM = z.infer<typeof SpaceM>;
export type AssistantReplyT = z.infer<typeof AssistantReply>;

/** Request body for /api/space-assistant */
export interface AssistantRequest {
  floorName: string;
  siteName: string;
  space: SpaceModelM;
  /** short read-only context: equipment already on the floor */
  devices: { label: string; type: string; x: number; y: number }[];
  /**
   * Things the installer pointed at on the map for this message, numbered #1, #2…
   * Elements carry their id; a region is a rectangle in meters.
   */
  refs?: { n: number; kind: string; id?: string; label: string; rect?: { x1: number; y1: number; x2: number; y2: number } }[];
  history: { role: "user" | "assistant"; text: string }[];
  message: string;
  /** true when the floor has an uploaded plan image without a calibrated scale */
  uncalibratedImage?: boolean;
}
