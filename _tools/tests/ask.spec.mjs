// Playwright tests for the Portfolio Assistant widget (assets/js/ask.js).
// Run from the repo root:  NODE_PATH="$(npm root -g)" node _tools/tests/ask.spec.mjs [page.html ...]
// With no arguments it builds a fixture page; pass built pages (index.html, work/ebs/index.html) to test those.
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const ENDPOINT = "https://ask.test/chat";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "ask-"));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${pathToFileURL(join(ROOT, "assets/css/ask.css"))}"><title>t</title></head>
<body style="margin:0;font-family:sans-serif"><main style="height:2000px"><h1>Fixture</h1></main>
<script src="${pathToFileURL(join(ROOT, "assets/js/ask.js"))}" defer data-endpoint="${ENDPOINT}" data-page="ebs"></script></body></html>`;
  const f = join(dir, "index.html");
  writeFileSync(f, html);
  return pathToFileURL(f).href;
}

const sse = (events) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
// Built pages ship with the preview gate and the production endpoint: open them with ?ask=1 and point the widget at the mock.
const pages = process.argv.slice(2).map((p) => pathToFileURL(resolve(p)).href + "?ask=1");
const targets = pages.length ? pages : [fixture()];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let failures = 0;

async function test(name, url, fn, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, reducedMotion: opts.reducedMotion || "no-preference" });
  await ctx.addInitScript((ep) => {
    new MutationObserver((_, obs) => {
      const s = document.querySelector('script[src*="assets/js/ask.js"]');
      if (s) { s.setAttribute("data-endpoint", ep); obs.disconnect(); }
    }).observe(document, { childList: true, subtree: true });
  }, ENDPOINT);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.__posts = [];
  await page.route(ENDPOINT, async (route) => {
    page.__posts.push(JSON.parse(route.request().postData() || "{}"));
    const h = page.__handler || ((r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse([{ t: "Rick " }, { t: "led UX." }, { done: true }]) }));
    await h(route);
  });
  await page.route(/^https:\/\/(fonts|gc\.zgo|rickh\.goatcounter)/, (r) => r.abort());
  try {
    await page.goto(url);
    await page.waitForSelector(".ask-launcher");
    await fn(page);
    assert.deepEqual(errors, [], "page errors");
    console.log(`PASS ${name}`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${name}\n  ${String(e.message).split("\n").slice(0, 6).join("\n  ")}`);
  } finally {
    await ctx.close();
  }
}
const launcher = (p) => p.getByRole("button", { name: "Ask about Rick" });
async function openPanel(p) { await launcher(p).click(); await p.getByRole("dialog", { name: "Portfolio Assistant" }).waitFor(); }
async function lastAssistantText(p) {
  await p.waitForFunction(() => !document.querySelector(".ask-msg--typing") && !document.querySelector(".ask-input").disabled);
  return p.locator(".ask-msg--assistant").last().innerText();
}

for (const url of targets) {
  console.log(`\n# ${url}`);

  await test("opens_and_focuses", url, async (p) => {
    await openPanel(p);
    const dlg = p.getByRole("dialog", { name: "Portfolio Assistant" });
    assert.ok(await dlg.getByText("AI", { exact: true }).isVisible());
    assert.ok(await dlg.getByText("Usually replies instantly").isVisible());
    assert.ok(await dlg.getByRole("button", { name: "Get in touch with Rick" }).first().isVisible());
    for (const c of ["What did Rick do at EBS?", "Has Rick led design teams?", "Show me his fintech work", "What’s his design-systems experience?"]) assert.ok(await dlg.getByRole("button", { name: c }).isVisible(), c);
    assert.ok(await dlg.getByText("AI can make mistakes. Check the case studies or ask Rick.", { exact: false }).isVisible());
    assert.ok(await p.evaluate(() => document.querySelector("#ask-panel").contains(document.activeElement)), "focus inside");
    await p.keyboard.press("Escape");
    assert.ok(await dlg.isHidden());
    assert.equal(await p.evaluate(() => document.activeElement.className), "ask-launcher");
  });

  await test("chip_sends", url, async (p) => {
    await openPanel(p);
    await p.getByRole("button", { name: "What did Rick do at EBS?" }).click();
    await lastAssistantText(p);
    assert.equal(await p.locator(".ask-chip").count(), 0, "starter questions removed after the first question");
    const body = p.__posts[0];
    assert.equal(body.messages.at(-1).content, "What did Rick do at EBS?");
    assert.ok(typeof body.page === "string" && body.page.length > 0);
  });

  await test("streams_answer", url, async (p) => {
    await openPanel(p);
    await p.locator(".ask-input").fill("Tell me about EBS");
    await p.locator(".ask-input").press("Enter");
    assert.equal(await lastAssistantText(p), "Rick led UX.");
    assert.equal(await p.locator(".ask-chat [aria-live]").innerText(), "Rick led UX.");
  });

  await test("renders_links", url, async (p) => {
    p.__handler = (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse([{ t: "See the [EBS case study](https://rickhollandsworth.com/work/ebs/) and **more**." }, { done: true }]) });
    await openPanel(p);
    await p.locator(".ask-input").fill("links?"); await p.locator(".ask-input").press("Enter");
    await lastAssistantText(p);
    const a = p.locator(".ask-msg--assistant").last().locator("a");
    assert.equal(await a.getAttribute("href"), "https://rickhollandsworth.com/work/ebs/");
    assert.equal(await a.innerText(), "EBS case study");
    assert.equal(await p.locator(".ask-msg--assistant").last().locator("strong").innerText(), "more");
  });

  await test("rejects_untrusted_links", url, async (p) => {
    p.__handler = (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse([{ t: "[x](https://evil.example) [y](javascript:alert(1)) <img src=x onerror=alert(1)>" }, { done: true }]) });
    await openPanel(p);
    await p.locator(".ask-input").fill("evil"); await p.locator(".ask-input").press("Enter");
    const text = await lastAssistantText(p);
    const last = p.locator(".ask-msg--assistant").last();
    assert.equal(await last.locator("a").count(), 0);
    assert.equal(await last.locator("img").count(), 0);
    assert.ok(text.includes("x (https://evil.example)") && text.includes("<img"));
    const verdicts = await p.evaluate(() => ["/\\evil.com", "//evil.com", "https://rickhollandsworth.com.evil.com/", "https://rickhollandsworth.com@evil.com/",
      "mailto:rick.hollandsworth@outlook.com?cc=x@evil.com", "mailto:rick.hollandsworth@outlook.com?subject=Hi&bcc=x@evil.com",
      "/work/ebs/", "https://rickhollandsworth.com/work/ebs/", "mailto:rick.hollandsworth@outlook.com?subject=Hi", "https://www.linkedin.com/in/rickhollandsworth/"].map((u) => !!window.__ask.safeUrl(u)));
    assert.deepEqual(verdicts, [false, false, false, false, false, false, true, true, true, true]);
  });

  await test("autolinks_bare_urls", url, async (p) => {
    p.__handler = (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse([{ t: "Email rick.hollandsworth@outlook.com or see https://www.linkedin.com/in/rickhollandsworth/. Not https://evil.example/x." }, { done: true }]) });
    await openPanel(p);
    await p.locator(".ask-input").fill("contact"); await p.locator(".ask-input").press("Enter");
    await lastAssistantText(p);
    const hrefs = await p.locator(".ask-msg--assistant").last().locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    assert.deepEqual(hrefs, ["mailto:rick.hollandsworth@outlook.com", "https://www.linkedin.com/in/rickhollandsworth/"]);
  });

  await test("cut_off_answer_is_tidied", url, async (p) => {
    p.__handler = (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse([{ t: "Rick led UX at EBS. See the [EBS case study](https://rickholl" }, { cut: true }, { done: true }]) });
    await openPanel(p);
    await p.locator(".ask-input").fill("pitch"); await p.locator(".ask-input").press("Enter");
    const text = await lastAssistantText(p);
    assert.ok(text.startsWith("Rick led UX at EBS."), text);
    assert.ok(!text.includes("rickholl") && !text.includes("["), text);
    assert.ok(text.includes("That answer ran long"), text);
  });

  await test("password_pdf_warning", url, async (p) => {
    p.__handler = (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse([{ t: "See the [Gizmo PDF](https://rickhollandsworth.com/assets/pdf/verizon-gizmo-watch-case-study.pdf)." }, { done: true }]) });
    await openPanel(p);
    await p.locator(".ask-input").fill("gizmo pdf"); await p.locator(".ask-input").press("Enter");
    await lastAssistantText(p);
    const n = p.locator(".ask-notice--lock");
    await n.waitFor();
    assert.ok(await n.getByText("Password required").isVisible());
    assert.ok(await n.getByRole("button", { name: "Ask Rick for the password" }).isVisible());
    assert.equal(await n.locator('a[href^="mailto:rick.hollandsworth@outlook.com?subject=Case%20study%20password%20request"]').count(), 1);
    // and not for open PDFs
    p.__handler = (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse([{ t: "See the [EBS PDF](https://rickhollandsworth.com/assets/pdf/ebs-case-study.pdf)." }, { done: true }]) });
    await p.locator(".ask-input").fill("ebs pdf"); await p.locator(".ask-input").press("Enter");
    await lastAssistantText(p);
    assert.equal(await p.locator(".ask-notice--lock").count(), 1);
  });

  await test("empty_answer_shows_fallback", url, async (p) => {
    p.__handler = (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse([{ done: true }]) });
    await openPanel(p);
    await p.locator(".ask-input").fill("hi"); await p.locator(".ask-input").press("Enter");
    await p.locator(".ask-notice").waitFor();
  });

  await test("stream_error_shows_fallback", url, async (p) => {
    p.__handler = (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse([{ t: "Partial " }, { error: "unavailable" }]) });
    await openPanel(p);
    await p.locator(".ask-input").fill("hi"); await p.locator(".ask-input").press("Enter");
    await p.locator(".ask-notice").waitFor();
    assert.ok((await p.locator(".ask-msg--assistant").last().innerText()).includes("Partial"));
    const n = p.locator(".ask-notice");
    assert.ok(await n.getByRole("button", { name: "Get in touch with Rick" }).isVisible());
    assert.equal(await n.locator('a[href^="mailto:rick.hollandsworth@outlook.com"]').count(), 1);
    assert.equal(await n.locator('a[href="https://www.linkedin.com/in/rickhollandsworth/"]').count(), 1);
    assert.equal(await p.locator(".ask-input").isEnabled(), true);
  });

  await test("network_abort_shows_fallback", url, async (p) => {
    p.__handler = (r) => r.abort();
    await openPanel(p);
    await p.locator(".ask-input").fill("hi"); await p.locator(".ask-input").press("Enter");
    await p.locator(".ask-notice").waitFor();
    assert.equal(await p.locator(".ask-msg--typing").count(), 0);
    assert.equal(await p.locator(".ask-input").isEnabled(), true);
  });

  await test("rate_limited_message", url, async (p) => {
    p.__handler = (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: sse([{ error: "rate_limited" }]) });
    await openPanel(p);
    await p.locator(".ask-input").fill("hi"); await p.locator(".ask-input").press("Enter");
    await p.locator(".ask-notice").getByText("You’ve reached the message limit for now. You can get in touch with Rick directly.").waitFor();
  });

  await test("contact_form", url, async (p) => {
    await openPanel(p);
    await p.locator(".ask-input").fill("hello"); await p.locator(".ask-input").press("Enter");
    await lastAssistantText(p);
    await p.getByRole("button", { name: "Get in touch with Rick" }).first().click();
    for (const l of ["Your name", "Company", "Role you’re hiring for", "Note (optional)"]) assert.ok(await p.getByLabel(l).isVisible(), l);
    await p.getByRole("button", { name: "Draft email" }).click();
    await p.getByRole("alert").filter({ hasText: "Please add your name and your company." }).waitFor();
    await p.getByRole("button", { name: "← Back to chat" }).click();
    assert.ok(await p.locator(".ask-log").getByText("Rick led UX.").isVisible(), "history intact");
    assert.ok(await p.locator(".ask-input").isVisible());
  });

  await test("contact_builds_mailto", url, async (p) => {
    const m = await p.evaluate(() => window.__ask.buildMailto({ name: "Ana Ruiz", company: "Smith & Co", role: "Staff Designer", note: "Line1\nLine2 é" }));
    assert.ok(m.startsWith("mailto:rick.hollandsworth@outlook.com?subject="));
    assert.ok(m.includes("subject=Portfolio%20inquiry%3A%20Staff%20Designer%20at%20Smith%20%26%20Co"), m);
    assert.ok(m.includes("Line1%0ALine2%20%C3%A9"), m);
    const m2 = await p.evaluate(() => window.__ask.buildMailto({ name: "A", company: "B" }));
    assert.ok(m2.includes("subject=Portfolio%20inquiry&"), m2);
    const m3 = await p.evaluate(() => window.__ask.buildMailto({}));
    assert.ok(!/undefined|null/.test(m2 + m3));
    // form drafts the email
    await openPanel(p);
    await p.getByRole("button", { name: "Get in touch with Rick" }).first().click();
    await p.getByLabel("Your name").fill("Ana Ruiz"); await p.getByLabel("Company").fill("Smith & Co");
    const nav = p.waitForRequest(() => true, { timeout: 500 }).catch(() => null);
    await p.evaluate(() => { window.__lastHref = null; });
    await p.getByRole("button", { name: "Draft email" }).click();
    await nav;
    await p.getByRole("status").filter({ hasText: "Your email app should open" }).waitFor();
  });

  await test("enforces_500_chars", url, async (p) => {
    await openPanel(p);
    assert.equal(await p.locator(".ask-input").getAttribute("maxlength"), "500");
    await p.locator(".ask-input").fill("x".repeat(390));
    assert.ok(await p.locator(".ask-counter").isHidden());
    await p.locator(".ask-input").fill("x".repeat(450));
    assert.equal(await p.locator(".ask-counter").innerText(), "50 characters left");
  });

  await test("phone_sheet", url, async (p) => {
    await openPanel(p);
    await p.waitForTimeout(400); // let the open animation finish
    const b = await p.locator("#ask-panel").boundingBox();
    assert.equal(Math.round(b.width), 390); assert.equal(Math.round(b.x), 0);
    assert.equal(Math.round(b.y + b.height), 844);
    assert.ok(await p.locator(".ask-scrim").isVisible());
    assert.equal(await p.locator("#ask-panel").getAttribute("aria-modal"), "true");
    assert.ok(await p.evaluate(() => [...document.body.children].some((n) => n.hasAttribute("inert"))), "page behind is inert");
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await p.getByRole("button", { name: "Close assistant" }).first().click();
    assert.ok(await p.locator("#ask-panel").isHidden());
    assert.ok(await p.evaluate(() => ![...document.body.children].some((n) => n.hasAttribute("inert"))), "inert removed");
  }, { viewport: { width: 390, height: 844 } });

  await test("desktop_panel", url, async (p) => {
    await openPanel(p);
    await p.waitForTimeout(400);
    const b = await p.locator("#ask-panel").boundingBox();
    const l = await p.locator(".ask-launcher").boundingBox();
    assert.equal(Math.round(b.width), 380);
    assert.ok(b.y + b.height <= l.y, "panel sits above launcher");
    assert.ok(await p.locator(".ask-scrim").isHidden());
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  });

  await test("reduced_motion", url, async (p) => {
    await openPanel(p);
    const anim = await p.locator("#ask-panel").evaluate((n) => getComputedStyle(n).animationName);
    assert.equal(anim, "none");
  }, { reducedMotion: "reduce" });

  await test("keeps_history_across_pages", url, async (p) => {
    await openPanel(p);
    await p.locator(".ask-input").fill("remember me"); await p.locator(".ask-input").press("Enter");
    await lastAssistantText(p);
    await p.reload();
    await p.waitForSelector(".ask-launcher");
    await openPanel(p);
    assert.ok(await p.locator(".ask-log").getByText("remember me").isVisible());
  });
}

await browser.close();
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
