// Portfolio Assistant Worker: POST /chat streams an answer about Rick from the Anthropic API.
// The API key, model and limits live here, never in the browser.
import { buildSystem } from "./prompt.js";
import { checkLimits, hashIp } from "./limits.js";

const MAX_CHARS = 500;
const MAX_TURNS = 10;
const MAX_TOKENS = 400;
const MAX_HISTORY_CHARS = 2000; // per earlier turn, to bound cost
const UPSTREAM_TIMEOUT_MS = 30000;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

const sseHeaders = (h) => ({ ...h, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
const sseLine = (obj) => `data: ${JSON.stringify(obj)}\n\n`;
const sseOnce = (obj, h) => new Response(sseLine(obj), { status: 200, headers: sseHeaders(h) });

// Returns {messages} or {error}.
export function cleanMessages(input) {
  if (!Array.isArray(input) || input.length === 0) return { error: "bad_request" };
  const msgs = [];
  for (const m of input) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return { error: "bad_request" };
    const content = m.content.trim();
    if (content) msgs.push({ role: m.role, content });
  }
  const last = msgs.at(-1);
  if (!last || last.role !== "user") return { error: "bad_request" };
  if (last.content.length > MAX_CHARS) return { error: "too_long" };
  let recent = msgs.slice(-MAX_TURNS);
  while (recent.length && recent[0].role !== "user") recent = recent.slice(1);
  recent = recent.map((m, i) => (i === recent.length - 1 ? m : { role: m.role, content: m.content.slice(0, MAX_HISTORY_CHARS) }));
  return { messages: recent };
}

async function pump(upstream, writer) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const reader = upstream.body.getReader();
  let buf = "";
  let finished = false;
  try {
    while (!finished) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
        if (!data) continue;
        let ev;
        try { ev = JSON.parse(data); } catch { continue; }
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
          await writer.write(enc.encode(sseLine({ t: ev.delta.text })));
        } else if (ev.type === "message_stop") {
          await writer.write(enc.encode(sseLine({ done: true })));
          finished = true;
          break;
        } else if (ev.type === "error") {
          break;
        }
      }
    }
  } catch {
    /* fall through to the error line below */
  }
  try {
    if (!finished) await writer.write(enc.encode(sseLine({ error: "unavailable" })));
    await writer.close();
  } catch { /* client went away */ }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/chat") return new Response("Not found", { status: 404 });

    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!origin || !allowed.includes(origin)) return new Response("Forbidden", { status: 403 });
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad_request" }, 400, cors); }
    const cleaned = cleanMessages(body?.messages);
    if (cleaned.error) return json({ error: cleaned.error }, 400, cors);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    let limit = "ok";
    try {
      limit = await checkLimits(env, await hashIp(ip, env.SALT));
    } catch {
      // KV write contention or an outage: keep answering. The Anthropic spend limit is the hard backstop.
    }
    if (limit !== "ok") return sseOnce({ error: "rate_limited" }, cors);

    let upstream;
    try {
      upstream = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        // Short factual answers: thinking off and low effort keep replies fast and inside max_tokens.
        body: JSON.stringify({
          model: env.MODEL,
          max_tokens: MAX_TOKENS,
          thinking: { type: "disabled" },
          output_config: { effort: "low" },
          system: buildSystem(body.page),
          messages: cleaned.messages,
          stream: true,
        }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      return sseOnce({ error: "unavailable" }, cors);
    }
    if (!upstream.ok || !upstream.body) return sseOnce({ error: "unavailable" }, cors);

    const { readable, writable } = new TransformStream();
    const done = pump(upstream, writable.getWriter());
    ctx?.waitUntil?.(done);
    return new Response(readable, { status: 200, headers: sseHeaders(cors) });
  },
};
