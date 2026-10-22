// Run the assistant evaluation set against a deployed Worker.
// Usage: node evals/run.mjs https://portfolio-assistant.<you>.workers.dev/chat [origin] [from] [to]
// The Worker allows 20 messages per visitor per hour, so run the 30 questions in two batches (0 15, then 15 30).
// Exits non-zero if any question fails. Each question costs one real model call.
import { readFile } from "node:fs/promises";

const [endpoint, origin = "https://rickhollandsworth.com", from = "0", to = "999"] = process.argv.slice(2);
if (!endpoint) { console.error("usage: node evals/run.mjs <endpoint> [origin]"); process.exit(2); }

const all = JSON.parse(await readFile(new URL("./questions.json", import.meta.url), "utf8"));
const items = all.slice(Number(from), Number(to));

async function ask(q, page) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: origin },
    body: JSON.stringify({ messages: [{ role: "user", content: q }], page }),
  });
  const text = await res.text();
  let out = "", err = null, cut = false;
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const ev = JSON.parse(line.slice(6));
    if (ev.t) out += ev.t;
    if (ev.error) err = ev.error;
    if (ev.cut) cut = true;
  }
  return { status: res.status, out, err, cut };
}

let failed = 0;
for (const [i, it] of items.entries()) {
  const { status, out, err, cut } = await ask(it.q, it.page);
  const problems = [];
  if (status !== 200 || err) problems.push(`status ${status} ${err || ""}`);
  if (cut) problems.push("answer cut off at the length limit");
  for (const bad of it.must_not_include || []) if (out.toLowerCase().includes(bad.toLowerCase())) problems.push(`contains "${bad}"`);
  if (it.must_include_any && !it.must_include_any.some((s) => out.toLowerCase().includes(s.toLowerCase()))) problems.push(`missing one of ${JSON.stringify(it.must_include_any)}`);
  if (it.expect_link && !out.includes(it.expect_link)) problems.push(`no link to ${it.expect_link}`);
  if (/\b(I|my)\b (led|designed|managed|worked)/.test(out)) problems.push("first person as Rick");
  const ok = problems.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${String(i + 1).padStart(2)} ${it.q}`);
  if (!ok || process.env.VERBOSE) console.log(`     ${problems.join("; ")}\n     → ${out.replace(/\n/g, " ").slice(0, 400)}`);
  await new Promise((r) => setTimeout(r, 300));
}
console.log(`\n${items.length - failed}/${items.length} passed`);
process.exit(failed ? 1 : 0);
