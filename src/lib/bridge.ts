import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AssistantReply, type AssistantReplyT, type AssistantRequest } from "./space-schema";
import type { StreamEvent } from "./space-stream";

/**
 * Temporary development bridge: while no ANTHROPIC_API_KEY is configured, assistant requests are
 * written to .netmap-bridge/requests and answered by a Claude Code session that writes
 * .netmap-bridge/responses/<id>.json. Never enabled in production builds.
 */

/** Off unless NETMAP_DEV_BRIDGE=1 is set in .env.local, and never in production. */
export const bridgeEnabled = () => process.env.NODE_ENV === "development" && process.env.NETMAP_DEV_BRIDGE === "1";

const root = () => path.join(process.cwd(), ".netmap-bridge");
const safeId = (id: string) => /^[a-z0-9-]{8,40}$/.test(id);

export async function writeBridgeRequest(body: AssistantRequest): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(root(), "requests");
  await mkdir(dir, { recursive: true });
  await mkdir(path.join(root(), "responses"), { recursive: true });
  await writeFile(path.join(dir, `${id}.json`), JSON.stringify({ id, createdAt: new Date().toISOString(), ...body }, null, 2));
  return id;
}

/**
 * Progress events the Claude Code session appends while it works
 * (.netmap-bridge/responses/<id>.progress.ndjson), returned from index `since`.
 */
export async function readBridgeProgress(id: string, since: number): Promise<{ events: StreamEvent[]; next: number }> {
  if (!safeId(id)) return { events: [], next: since };
  let raw = "";
  try {
    raw = await readFile(path.join(root(), "responses", `${id}.progress.ndjson`), "utf8");
  } catch {
    return { events: [], next: since };
  }
  // only complete lines; a line being written right now is picked up next time
  const lines = raw.split("\n").slice(0, -1);
  const events: StreamEvent[] = [];
  for (const line of lines.slice(since)) {
    try {
      events.push(JSON.parse(line) as StreamEvent);
    } catch {
      // skip a malformed line
    }
  }
  return { events, next: lines.length };
}

export type BridgeResult =
  | { status: "pending" }
  | { status: "done"; result: AssistantReplyT }
  | { status: "invalid"; message: string };

export async function readBridgeResponse(id: string): Promise<BridgeResult> {
  if (!safeId(id)) return { status: "invalid", message: "bad id" };
  let raw: string;
  try {
    raw = await readFile(path.join(root(), "responses", `${id}.json`), "utf8");
  } catch {
    return { status: "pending" };
  }
  try {
    const parsed = AssistantReply.safeParse(JSON.parse(raw));
    if (!parsed.success) return { status: "invalid", message: parsed.error.message.slice(0, 300) };
    return { status: "done", result: parsed.data };
  } catch {
    return { status: "pending" }; // file is still being written
  }
}
