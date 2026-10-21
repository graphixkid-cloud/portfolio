import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../src/index.js";
import { buildSystem } from "../src/prompt.js";
import { KNOWLEDGE } from "../src/knowledge.js";

const SITE = "https://rickhollandsworth.com";

function kv() {
  const m = new Map();
  return { store: m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => void m.set(k, v) };
}
const baseEnv = () => ({ ANTHROPIC_API_KEY: "test-key", MODEL: "claude-test-model", ALLOWED_ORIGINS: `${SITE}, https://staging.example`, SALT: "s", LIMITS: kv() });
const ctx = { waitUntil() {} };

function sse(events) {
  const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}
const delta = (t) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } });
const canned = () => sse([{ type: "message_start", message: {} }, delta("Rick "), delta("led UX."), { type: "message_stop" }]);

function req(body, { origin = SITE, method = "POST", ip = "1.2.3.4" } = {}) {
  const headers = { "content-type": "application/json", "CF-Connecting-IP": ip };
  if (origin) headers.Origin = origin;
  return new Request("https://worker.example/chat", { method, headers, body: method === "POST" ? JSON.stringify(body) : undefined });
}
const ask = (text, extra = {}) => ({ messages: [{ role: "user", content: text }], ...extra });
const lines = async (res) => (await res.text()).split("\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)));

let fetchMock;
beforeEach(() => { fetchMock = vi.fn(async () => canned()); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe("origin and CORS", () => {
  it("rejects_foreign_origin", async () => {
    const env = baseEnv();
    expect((await worker.fetch(req(ask("hi"), { origin: "https://evil.example" }), env, ctx)).status).toBe(403);
    expect((await worker.fetch(req(ask("hi"), { origin: null }), env, ctx)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("handles_preflight", async () => {
    const res = await worker.fetch(req(null, { method: "OPTIONS" }), baseEnv(), ctx);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
  });
  it("allows_staging_origin", async () => {
    const res = await worker.fetch(req(ask("hi"), { origin: "https://staging.example" }), baseEnv(), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://staging.example");
  });
  it("unknown_path_404", async () => {
    const r = new Request("https://worker.example/other", { method: "POST", headers: { Origin: SITE } });
    expect((await worker.fetch(r, baseEnv(), ctx)).status).toBe(404);
  });
});

describe("request validation", () => {
  it("rejects_long_message", async () => {
    const res = await worker.fetch(req(ask("x".repeat(501))), baseEnv(), ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "too_long" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects_bad_body", async () => {
    for (const body of [{}, { messages: [] }, { messages: [{ role: "assistant", content: "hi" }] }, { messages: [{ role: "system", content: "x" }] }]) {
      expect((await worker.fetch(req(body), baseEnv(), ctx)).status).toBe(400);
    }
  });
  it("keeps_last_10_turns", async () => {
    const messages = Array.from({ length: 14 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
    messages.push({ role: "user", content: "last" });
    await lines(await worker.fetch(req({ messages }), baseEnv(), ctx));
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.messages.length).toBeLessThanOrEqual(10);
    expect(sent.messages[0].role).toBe("user");
    expect(sent.messages.at(-1)).toEqual({ role: "user", content: "last" });
  });
  it("sends_cached_system", async () => {
    await lines(await worker.fetch(req(ask("hi")), baseEnv(), ctx));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("test-key");
    const sent = JSON.parse(init.body);
    expect(sent.system[1].cache_control.type).toBe("ephemeral");
    expect(sent.system[1].text).toBe(KNOWLEDGE);
    expect(sent.max_tokens).toBe(400);
    expect(sent.model).toBe("claude-test-model");
    expect(sent.stream).toBe(true);
    expect(sent.thinking).toEqual({ type: "disabled" });
    expect(sent.output_config).toEqual({ effort: "low" });
  });
});

describe("streaming", () => {
  it("streams_deltas", async () => {
    const res = await worker.fetch(req(ask("What did Rick do at EBS?")), baseEnv(), ctx);
    expect(res.headers.get("content-type")).toMatch("text/event-stream");
    expect(await lines(res)).toEqual([{ t: "Rick " }, { t: "led UX." }, { done: true }]);
  });
  it("upstream_error", async () => {
    fetchMock.mockImplementation(async () => new Response("overloaded", { status: 529 }));
    expect(await lines(await worker.fetch(req(ask("hi")), baseEnv(), ctx))).toEqual([{ error: "unavailable" }]);
  });
  it("upstream_network_failure", async () => {
    fetchMock.mockImplementation(async () => { throw new Error("boom"); });
    expect(await lines(await worker.fetch(req(ask("hi")), baseEnv(), ctx))).toEqual([{ error: "unavailable" }]);
  });
  it("stream_cut_off_reports_error", async () => {
    fetchMock.mockImplementation(async () => sse([delta("Rick ")]));
    expect(await lines(await worker.fetch(req(ask("hi")), baseEnv(), ctx))).toEqual([{ t: "Rick " }, { error: "unavailable" }]);
  });
});

describe("limits", () => {
  it("visitor_limit", async () => {
    const env = baseEnv();
    for (let i = 0; i < 20; i++) await lines(await worker.fetch(req(ask("hi")), env, ctx));
    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect(await lines(await worker.fetch(req(ask("hi")), env, ctx))).toEqual([{ error: "rate_limited" }]);
    expect(fetchMock).toHaveBeenCalledTimes(20);
    // another visitor is unaffected
    expect((await lines(await worker.fetch(req(ask("hi"), { ip: "5.6.7.8" }), env, ctx))).at(-1)).toEqual({ done: true });
  });
  it("daily_limit", async () => {
    const env = baseEnv();
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    await env.LIMITS.put(`d:${day}`, "450");
    expect(await lines(await worker.fetch(req(ask("hi")), env, ctx))).toEqual([{ error: "rate_limited" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("kv_failure_still_answers", async () => {
    const env = baseEnv();
    env.LIMITS.put = async () => { throw new Error("429 too many writes"); };
    const res = await worker.fetch(req(ask("hi")), env, ctx);
    expect(res.status).toBe(200);
    expect((await lines(res)).at(-1)).toEqual({ done: true });
  });
  it("never_stores_raw_ip", async () => {
    const env = baseEnv();
    await lines(await worker.fetch(req(ask("hi")), env, ctx));
    for (const k of env.LIMITS.store.keys()) expect(k).not.toContain("1.2.3.4");
  });
});

describe("page context", () => {
  it("page_context", () => {
    expect(buildSystem("ebs")[2].text).toContain("/work/ebs/");
    expect(buildSystem("x<script>").length).toBe(2);
    expect(buildSystem(undefined).length).toBe(2);
  });
  it("prompt_has_no_password", () => {
    const all = buildSystem("home").map((b) => b.text).join("\n").toLowerCase();
    expect(all).not.toContain("uxd2026");
  });
});
