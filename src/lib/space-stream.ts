import type { AssistantReplyT, SpaceModelM } from "./space-schema";

/** Events streamed from /api/space-assistant as newline-delimited JSON. */
export type Stage = "thinking" | "reply" | "walls" | "openings" | "rooms" | "obstacles" | "finishing";

export type StreamEvent =
  | { t: "stage"; stage: Stage }
  | { t: "thinking"; text: string }
  | { t: "progress"; stage: Stage; reply?: string; space: SpaceModelM }
  | { t: "done"; result: AssistantReplyT }
  | { t: "error"; code: string; message: string };

const KEYS = ["walls", "openings", "rooms", "obstacles"] as const;

/**
 * Pulls every fully written object out of `"key": [ {...}, {...}, {...` in a JSON text that is
 * still being generated. Incomplete trailing objects are ignored.
 */
function completedItems<T>(text: string, key: string): T[] {
  const m = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(text);
  if (!m) return [];
  const out: T[] = [];
  let depth = 0;
  let inStr = false;
  let esc = false;
  let start = -1;
  for (let i = m.index + m[0].length; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") {
      if (depth === 0 && c === "{") start = i;
      depth++;
    } else if (c === "}" || c === "]") {
      if (depth === 0) break; // end of this array
      depth--;
      if (depth === 0 && c === "}" && start >= 0) {
        try {
          out.push(JSON.parse(text.slice(start, i + 1)) as T);
        } catch {
          // ignore malformed fragment
        }
        start = -1;
      }
    }
  }
  return out;
}

/** The reply string written so far (may be cut mid-sentence). */
function partialReply(text: string): string | undefined {
  const m = /"reply"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(text);
  if (!m) return undefined;
  try {
    return JSON.parse(`"${m[1].replace(/\\$/, "")}"`) as string;
  } catch {
    return undefined;
  }
}

export function parsePartial(text: string): { stage: Stage; reply?: string; space: SpaceModelM } {
  const space = {
    walls: completedItems<SpaceModelM["walls"][number]>(text, "walls"),
    openings: completedItems<SpaceModelM["openings"][number]>(text, "openings"),
    rooms: completedItems<SpaceModelM["rooms"][number]>(text, "rooms"),
    obstacles: completedItems<SpaceModelM["obstacles"][number]>(text, "obstacles"),
  };
  // the stage is the last section that has started
  let stage: Stage = text.trim() ? "reply" : "thinking";
  let at = -1;
  for (const k of KEYS) {
    const i = text.search(new RegExp(`"${k}"\\s*:\\s*\\[`));
    if (i > at) {
      at = i;
      stage = k;
    }
  }
  return { stage, reply: partialReply(text), space };
}
