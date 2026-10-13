export type LayerId =
  | "network"
  | "cctv"
  | "audio"
  | "alarm"
  | "infra"
  | "power"
  | "other";

export type Role = "admin" | "technician";

export interface User {
  id: string;
  name: string;
  email: string;
  superAdmin?: boolean;
}

export interface Membership {
  userId: string;
  accountId: string;
  role: Role;
}

/** A business — fully isolated tenant. */
export interface Account {
  id: string;
  name: string;
  businessType?: string;
  contactName?: string;
  phone?: string;
  address?: string;
  createdAt: number;
}

export interface Site {
  id: string;
  accountId: string;
  name: string;
  address?: string;
  notes?: string;
  createdAt: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface FloorPlan {
  /** data: URL, http URL, or "idb:<key>" for images stored in IndexedDB */
  src: string;
  width: number;
  height: number;
}

export interface Floor {
  id: string;
  siteId: string;
  name: string;
  order: number;
  plan?: FloorPlan;
  /** map pixels per real-world meter, set by calibration */
  pxPerMeter?: number;
}

export interface NetConfig {
  ip?: string;
  subnet?: string;
  gateway?: string;
  dns?: string;
  mac?: string;
  vlan?: string;
  mode?: "dhcp" | "static";
}

export interface Credentials {
  username?: string;
  password?: string;
  /** extra secret, e.g. Wi-Fi key / alarm code */
  secret?: string;
}

export interface CameraView {
  /** direction in degrees, 0 = right, clockwise */
  dir: number;
  /** field of view in degrees */
  fov: number;
  /** range in meters */
  range: number;
}

export interface Device {
  id: string;
  siteId: string;
  floorId: string;
  type: string;
  x: number;
  y: number;
  label: string;
  manufacturer?: string;
  model?: string;
  serial?: string;
  installDate?: string;
  warrantyUntil?: string;
  notes?: string;
  photos: string[];
  net: NetConfig;
  creds: Credentials;
  extra: Record<string, string>;
  ports?: number;
  camera?: CameraView;
  /** only on comms racks: the cabinet's build and what is mounted in it */
  rack?: RackData;
  updatedAt: number;
}

// ---------------------------------------------------------------- comms rack

export type RackKind = "wall" | "floor" | "open";
export type RackDoor = "glass" | "perforated" | "solid" | "none";

export interface RackSpec {
  kind: RackKind;
  /** height in rack units (1U = 44.45 mm) */
  units: number;
  widthMm: number;
  depthMm: number;
  door?: RackDoor;
  lock?: boolean;
  fans?: boolean;
  pdu?: boolean;
}

export type RackItemKind =
  | "patch"
  | "switch"
  | "router"
  | "firewall"
  | "modem"
  | "nvr"
  | "server"
  | "ups"
  | "shelf"
  | "cable-mgr"
  | "pdu"
  | "fan"
  | "blank"
  | "other";

export interface RackItem {
  id: string;
  kind: RackItemKind;
  label: string;
  /** lowest rack unit it occupies (1 = bottom of the cabinet) */
  u: number;
  /** height in rack units */
  height: number;
  /** equipment on the map this slot holds */
  deviceId?: string;
  notes?: string;
}

export interface RackData {
  spec: RackSpec;
  items: RackItem[];
}

export interface LinkEnd {
  deviceId: string;
  port?: string;
}

/**
 * A cable (connects two devices) or an infrastructure route (tray / conduit).
 * floorId undefined = logical link only (e.g. a riser between floors).
 */
export interface Link {
  id: string;
  siteId: string;
  floorId?: string;
  kind: "cable" | "tray";
  layer: LayerId;
  cableType: string;
  label?: string;
  color?: string;
  notes?: string;
  points: Point[];
  a?: LinkEnd;
  b?: LinkEnd;
  /** manual length override in meters */
  lengthM?: number;
}

// ---------------------------------------------------------------- space model

export type WallType =
  | "concrete"
  | "mamad"
  | "block"
  | "drywall"
  | "glass"
  | "wood"
  | "sandwich"
  | "partition"
  | "fence";

export type CablePass = "yes" | "partial" | "no" | "unknown";
export type Drilling = "allowed" | "restricted" | "forbidden";

export interface Wall {
  id: string;
  siteId: string;
  floorId: string;
  /** start / end in map pixels */
  a: Point;
  b: Point;
  type: WallType;
  exterior?: boolean;
  thicknessCm?: number;
  heightM?: number;
  /** existing cable pass-through (השחלה) */
  cablePass?: CablePass;
  /** conduit inside the wall, e.g. "צינור 20 מ״מ" */
  conduit?: string;
  pullString?: boolean;
  drilling?: Drilling;
  finish?: string;
  notes?: string;
}

export type OpeningKind = "door" | "window" | "vitrine" | "gate" | "passage";

/** Door / window placed on a wall; position is relative to the wall so it follows the wall. */
export interface Opening {
  id: string;
  siteId: string;
  floorId: string;
  wallId: string;
  kind: OpeningKind;
  /** distance of the opening's center from wall.a, in meters */
  offsetM: number;
  widthM: number;
  heightM?: number;
  notes?: string;
}

export type ObstacleKind = "column" | "stairs" | "elevator" | "shaft";

export interface Obstacle {
  id: string;
  siteId: string;
  floorId: string;
  kind: ObstacleKind;
  /** center + size in map pixels */
  x: number;
  y: number;
  w: number;
  h: number;
  notes?: string;
}

export type CeilingType = "acoustic" | "drywall" | "concrete" | "open" | "metal" | "wood" | "none";
export type FloorKind = "regular" | "raised" | "ducts";
export type Lighting = "good" | "low" | "dark" | "sun" | "backlight";
export type EnvTag = "humid" | "dusty" | "hot" | "rain" | "vandal";

/** A room / zone. Older data only has name, color and points. */
export interface Area {
  id: string;
  siteId: string;
  floorId: string;
  name: string;
  color: string;
  points: Point[];
  usage?: string;
  outdoor?: boolean;
  ceilingType?: CeilingType;
  ceilingHeightM?: number;
  /** height of the space above a dropped ceiling */
  plenumM?: number;
  plenumAccess?: boolean;
  floorKind?: FloorKind;
  lighting?: Lighting;
  env?: EnvTag[];
  /** privacy zone — cameras must not cover it */
  noCameras?: boolean;
  power?: "available" | "limited" | "none";
  notes?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
  questions?: string[];
  /** snapshot id that lets the user undo the change this reply made */
  undoId?: string;
  /** short summary of what was drawn, e.g. "14 קירות · 6 חדרים" */
  stats?: string;
  cancelled?: boolean;
  /** labels of the map references attached to a user message */
  refs?: string[];
  error?: boolean;
}

export interface MapNote {
  id: string;
  siteId: string;
  floorId: string;
  x: number;
  y: number;
  text: string;
}

export interface AuditEntry {
  id: string;
  accountId: string;
  userId: string;
  at: number;
  action: string;
  target?: string;
}
