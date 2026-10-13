import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AssistantReply, type AssistantRequest } from "@/lib/space-schema";
import { bridgeEnabled, readBridgeProgress, readBridgeResponse, writeBridgeRequest } from "@/lib/bridge";
import { parsePartial, type StreamEvent } from "@/lib/space-stream";

const MODEL = "claude-opus-5-5";

// Stable across requests so it is served from the prompt cache.
const SYSTEM_PROMPT = `You are the space-planning assistant inside NetMap, an app that low-voltage installers in Israel (network, CCTV, audio, alarm) use to document the sites they install at. The installer describes a floor in Hebrew and you build or edit a model of its physical space: walls, doors and windows, rooms and obstacles, with the properties that matter for installing cameras and running cables.

How the model works
- Units are meters. Origin (0,0) is the top-left of the floor; x grows to the right (east), y grows downward (south). Start the building at x≥1, y≥1.
- Walls are straight segments (x1,y1)→(x2,y2) along the wall's center line. Use one segment per stretch of wall with the same material; split a wall where its material changes or where another wall meets it (T-junction endpoints must sit exactly on the other wall). A wall shared by two rooms appears once. Round coordinates to 0.05 m and make corners meet exactly.
- Openings belong to a wall: wallId plus offsetM, the distance from that wall's (x1,y1) end to the opening's center. Keep the opening inside the wall.
- Rooms are polygons along the wall center lines. Corridors, lobbies, yards and parking areas are rooms too. Outdoor areas: outdoor=true, ceilingType "none".
- Obstacles (columns, stairs, elevators, shafts) are given by center and size.
- Change only what the installer asked for. Leave every other element exactly as it is, even if an earlier instruction would seem to call for adjusting it. If you think another change is needed, ask in "questions" instead of making it.
- When you change anything, return the COMPLETE updated space, not only the changed parts. Keep the id of every existing element you keep or modify. Give new elements new short ids (like "w31", "r7", "o12") that don't collide with existing ids. If nothing changes (you are only answering or asking), return space as null.

Defaults when the installer doesn't say (typical Israeli construction; never contradict what they told you)
- Exterior walls: concrete, 20–25 cm, exterior=true. Interior partitions in offices and shops: drywall, 10 cm. Interior walls in apartments: block, 10–15 cm.
- A ממ״ד / מרחב מוגן is type "mamad", 25–30 cm, drilling "forbidden".
- Office ceiling: acoustic, 2.6–2.8 m, with a void above it. Apartments: concrete ceiling, about 2.6 m.
- Restrooms, showers and changing rooms: noCameras=true.
- Don't guess cablePass, conduit or pullString. Leave them unset unless the installer told you.

What to ask
Use "questions" (at most 3, short, in Hebrew) for missing details that change how cameras and cables get installed. For example: the ceiling type and whether there is access above it, wall materials, existing conduits or cable pass-throughs, where the comms cabinet is, outdoor areas, and the rough dimensions if none were given. If the description is too vague to draw anything sensible, return space null and ask. Otherwise, build a reasonable first version and ask only about what is still important.

Context you receive
- The current space (it may be empty) and the equipment already on the floor, in meters. The equipment is read-only: never move or remove it, and don't add equipment.
- Compass: the map shows North at the top, South at the bottom, East on the right and West on the left (y grows southward, x grows eastward). When the installer says "the north wall" or "the eastern corner", use these directions.
- "references": things the installer marked on the map for this message, numbered #1, #2… Each element has its id. A region is a rectangle in meters. Phrases like "#2", "this wall", "here" or "the area I marked" refer to them.
- If uncalibratedImage is true, the floor has a plan image whose scale hasn't been calibrated yet. Say once that the drawing may not line up with the image until they calibrate it with the scale tool.

Scope
For now you only model the space. If asked to place cameras or plan cable routes, say briefly in Hebrew that this is coming in the next stage, and help with the space instead.

Reply in "reply": one to three short Hebrew sentences that summarize what you built or changed.`;

function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(req: Request) {
  let body: AssistantRequest;
  try {
    body = (await req.json()) as AssistantRequest;
  } catch {
    return jsonError(400, "bad_request", "בקשה לא תקינה");
  }
  if (!body?.message?.trim() || body.message.length > 6000 || !body.space) {
    return jsonError(400, "bad_request", "ההודעה ריקה או ארוכה מדי");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    // development only, and only when explicitly turned on: hand the request to a Claude Code session
    if (bridgeEnabled()) {
      const id = await writeBridgeRequest(body);
      return Response.json({ pending: id }, { status: 202 });
    }
    return jsonError(503, "no_key", "העוזר עדיין לא מוגדר: חסר מפתח ANTHROPIC_API_KEY בקובץ .env.local");
  }

  // Prior turns as plain text; the API needs the conversation to start with a user turn.
  const history = (body.history ?? []).slice(-12);
  while (history.length && history[0].role !== "user") history.shift();
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.text }));

  const context = {
    site: body.siteName,
    floor: body.floorName,
    uncalibratedImage: !!body.uncalibratedImage,
    references: body.refs ?? [],
    devices: body.devices,
    space: body.space,
  };
  messages.push({
    role: "user",
    content: `<current_floor>\n${JSON.stringify(context)}\n</current_floor>\n\n${body.message.trim()}`,
  });

  const client = new Anthropic();
  const encoder = new TextEncoder();

  // Stream newline-delimited JSON events so the app can show the build as it happens.
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (e: StreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          open = false;
        }
      };

      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: "high", format: betaZodOutputFormat(AssistantReply) },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages,
      });
      // user pressed "cancel" (or closed the page): stop generating, stop paying
      req.signal.addEventListener("abort", () => {
        open = false;
        stream.abort();
      });

      send({ t: "stage", stage: "thinking" });
      let text = "";
      let lastProgress = 0;
      try {
        for await (const ev of stream) {
          if (ev.type !== "content_block_delta") continue;
          if (ev.delta.type === "thinking_delta") {
            send({ t: "thinking", text: ev.delta.thinking });
          } else if (ev.delta.type === "text_delta") {
            text += ev.delta.text;
            const now = Date.now();
            if (now - lastProgress > 400) {
              lastProgress = now;
              send({ t: "progress", ...parsePartial(text) });
            }
          }
        }
        send({ t: "stage", stage: "finishing" });
        const msg = await stream.finalMessage();
        if (msg.stop_reason === "refusal") {
          send({ t: "error", code: "refusal", message: "העוזר לא יכול לטפל בבקשה הזו. נסו לנסח אותה אחרת." });
        } else if (msg.stop_reason === "max_tokens") {
          send({ t: "error", code: "too_long", message: "התוכנית גדולה מדי לבקשה אחת. נסו לבנות אותה בחלקים (למשל אגף אחרי אגף)." });
        } else if (!msg.parsed_output) {
          send({ t: "error", code: "parse", message: "התקבלה תשובה לא תקינה מהעוזר. נסו שוב." });
        } else {
          send({ t: "done", result: msg.parsed_output });
        }
      } catch (err) {
        if (!req.signal.aborted) send({ t: "error", ...describeError(err) });
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(out, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function describeError(err: unknown): { code: string; message: string } {
  if (err instanceof Anthropic.AuthenticationError) {
    return { code: "auth", message: "מפתח ה-API לא תקין. בדקו את ANTHROPIC_API_KEY בקובץ .env.local" };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { code: "rate_limit", message: "יותר מדי בקשות כרגע. נסו שוב בעוד רגע." };
  }
  if (err instanceof Anthropic.BadRequestError) {
    console.error("space-assistant bad request:", err.message);
    return { code: "api_bad_request", message: "הבקשה לעוזר נדחתה. נסו לנסח מחדש." };
  }
  if (err instanceof Anthropic.APIError) {
    console.error("space-assistant API error:", err.status, err.message);
    return { code: "api", message: "שגיאה זמנית בשירות העוזר. נסו שוב." };
  }
  console.error("space-assistant error:", err);
  return { code: "internal", message: "שגיאה לא צפויה" };
}

/** Polls the development bridge for the answer to a pending request. */
export async function GET(req: Request) {
  if (!bridgeEnabled()) return jsonError(404, "not_found", "לא נמצא");
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const since = Number(url.searchParams.get("since") ?? 0) || 0;
  const progress = await readBridgeProgress(id, since);
  const r = await readBridgeResponse(id);
  if (r.status === "pending") return Response.json({ pending: id, ...progress });
  if (r.status === "invalid") return jsonError(502, "parse", "התקבלה תשובה לא תקינה. נסו שוב.");
  return Response.json({ result: r.result, ...progress });
}
