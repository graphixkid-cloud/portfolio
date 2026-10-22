/* Portfolio Assistant — chat widget for rickhollandsworth.com
 * Loaded with: <script src="assets/js/ask.js" defer data-endpoint="https://…/chat" data-page="home"></script>
 * Answers stream from a Cloudflare Worker (see _worker/). The conversation stays in this browser tab
 * (sessionStorage); the "Get in touch" form only builds a mailto: link and sends nothing anywhere.
 */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script || window.__askLoaded) return;
  window.__askLoaded = true;

  var ENDPOINT = script.getAttribute("data-endpoint") || "";
  var PAGE = script.getAttribute("data-page") || "home";
  var EMAIL = "rick.hollandsworth@outlook.com";
  var LINKEDIN = "https://www.linkedin.com/in/rickhollandsworth/";
  var SITE = "https://rickhollandsworth.com";
  var MAX = 500;
  var STARTERS = ["What did Rick do at EBS?", "Has Rick led design teams?", "Show me his fintech work", "What’s his design-systems experience?"];
  var INTRO1 = "Hi! I’m an AI assistant for Rick Hollandsworth’s portfolio. I can answer questions about his experience, case studies and skills, and point you to the right page.";
  var INTRO2 = "I can’t speak for Rick or share anything that isn’t on his site. For anything else, contact Rick directly.";
  var STORE = "ask-conversation";

  // Preview gate: with data-preview, the widget only appears after visiting a page with ?ask=1 once.
  function store(kind) { try { return window[kind]; } catch (e) { return null; } }
  function get(kind, k) { try { var s = store(kind); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function set(kind, k, v) { try { var s = store(kind); if (s) { if (v === null) s.removeItem(k); else s.setItem(k, v); } } catch (e) { /* storage blocked */ } }
  if (script.hasAttribute("data-preview")) {
    if (/[?&]ask=1\b/.test(location.search)) set("localStorage", "ask-preview", "1");
    if (/[?&]ask=0\b/.test(location.search)) set("localStorage", "ask-preview", null);
    if (get("localStorage", "ask-preview") !== "1") return;
  }

  function track(name) {
    try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: "ask-" + name, title: "Assistant: " + name, event: true }); } catch (e) { /* ignore */ }
  }

  // ---------- helpers ----------
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  var SVG = {
    chat: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.3-4.6A7.5 7.5 0 1 1 20 11.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="8.8" cy="11.5" r="1.1" fill="currentColor"/><circle cx="12.5" cy="11.5" r="1.1" fill="currentColor"/><circle cx="16.2" cy="11.5" r="1.1" fill="currentColor"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    mail: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 6.5L12 13l8.5-6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    li: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10.5V16M8 7.6v.1M11.5 16v-5.5M11.5 13c0-1.6 1-2.6 2.4-2.6S16 11.3 16 13v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    alert: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5v5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1.2" fill="currentColor"/></svg>'
  };
  function icon(name) { var s = el("span", { class: "ask-ico" }); s.innerHTML = SVG[name]; return s; } // static, trusted markup only

  // ---------- links and markdown (model text is never inserted as HTML) ----------
  function safeUrl(raw) {
    var u = String(raw || "").trim();
    if (/^mailto:rick\.hollandsworth@outlook\.com(\?subject=[^&\s]*)?$/i.test(u)) return u;
    if (/^https:\/\/(www\.)?linkedin\.com\/in\/rickhollandsworth\/?$/i.test(u)) return LINKEDIN;
    if (/[\\\s]/.test(u)) return null;
    if (/^\/(?!\/)/.test(u) || /^https:\/\/rickhollandsworth\.com(\/|$)/i.test(u)) {
      try { if (new URL(u, SITE).origin === SITE) return u; } catch (e) { /* invalid */ }
    }
    return null;
  }
  function linkFor(url, text) {
    var a = el("a", { href: url, text: text, class: "ask-link" });
    var external = /^mailto:/.test(url) || /linkedin\.com/.test(url) || /\.pdf($|[?#])/i.test(url);
    if (external && !/^mailto:/.test(url)) { a.target = "_blank"; a.rel = "noopener"; }
    a.addEventListener("click", function () { track(/^mailto:/.test(url) ? "contact-email" : "link"); if (!external) markNavigating(); });
    return a;
  }
  function inline(text, parent) {
    var re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(https:\/\/[^\s<>()]*[^\s<>().,;:!?'"])|(rick\.hollandsworth@outlook\.com)/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (m[1] !== undefined) parent.appendChild(el("strong", { text: m[1] }));
      else if (m[4] !== undefined) {
        var bare = safeUrl(m[4]);
        parent.appendChild(bare ? linkFor(bare, m[4].replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "")) : document.createTextNode(m[4]));
      } else if (m[5] !== undefined) parent.appendChild(linkFor("mailto:" + EMAIL, EMAIL));
      else {
        var url = safeUrl(m[3]);
        parent.appendChild(url ? linkFor(url, m[2]) : document.createTextNode(m[2] + " (" + m[3] + ")"));
      }
      last = re.lastIndex;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }
  function renderMarkdown(text, into) {
    into.textContent = "";
    String(text).replace(/\r/g, "").split(/\n{2,}/).forEach(function (para) {
      if (!para.trim()) return;
      var p = el("p");
      para.split("\n").forEach(function (line, i) {
        if (i) p.appendChild(el("br"));
        inline(line.replace(/^\s*[-*]\s+/, "• "), p);
      });
      into.appendChild(p);
    });
  }

  // ---------- mailto ----------
  function buildMailto(f) {
    f = f || {};
    var clean = function (v) { return (v == null ? "" : String(v)).trim(); };
    var name = clean(f.name), company = clean(f.company), role = clean(f.role), note = clean(f.note);
    var subject = role && company ? "Portfolio inquiry: " + role + " at " + company : role ? "Portfolio inquiry: " + role : "Portfolio inquiry";
    var lines = [];
    if (name) lines.push("Name: " + name);
    if (company) lines.push("Company: " + company);
    if (role) lines.push("Role: " + role);
    if (note) { lines.push(""); lines.push(note); }
    return "mailto:" + EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(lines.join("\n"));
  }
  window.__ask = { buildMailto: buildMailto, safeUrl: safeUrl };

  // ---------- state ----------
  var state = { messages: [], asked: [], open: false, busy: false };
  try { var saved = JSON.parse(get("sessionStorage", STORE) || "null"); if (saved && Array.isArray(saved.messages)) { state.messages = saved.messages.slice(-20); state.asked = saved.asked || []; state.open = !!saved.reopen; } } catch (e) { /* ignore */ }
  var navigating = false;
  function markNavigating() { navigating = true; save(); }
  function save() { set("sessionStorage", STORE, JSON.stringify({ messages: state.messages.slice(-20), asked: state.asked, reopen: navigating && state.open })); }

  // ---------- DOM ----------
  var root = el("div", { class: "ask-root" });
  var seen = get("localStorage", "ask-seen") === "1";
  var launcher = el("button", { type: "button", class: "ask-launcher" + (seen ? "" : " ask-launcher--label"), "aria-label": "Ask about Rick", "aria-expanded": "false", "aria-controls": "ask-panel" });
  var lIconChat = icon("chat"), lIconClose = icon("close");
  lIconClose.hidden = true;
  launcher.appendChild(lIconChat); launcher.appendChild(lIconClose);
  launcher.appendChild(el("span", { class: "ask-launcher-text", text: "Ask about Rick", "aria-hidden": "true" }));

  var scrim = el("div", { class: "ask-scrim", hidden: "" });
  var panel = el("div", { class: "ask-panel", id: "ask-panel", role: "dialog", "aria-modal": "false", "aria-labelledby": "ask-title", hidden: "" });

  var closeBtn = el("button", { type: "button", class: "ask-close", "aria-label": "Close assistant" }, [icon("close")]);
  var header = el("div", { class: "ask-header" }, [
    el("span", { class: "ask-mono", "aria-hidden": "true", text: "RH" }),
    el("div", { class: "ask-head-text" }, [
      el("div", { class: "ask-title-row" }, [el("h2", { id: "ask-title", class: "ask-title", text: "Portfolio Assistant" }), el("span", { class: "ask-badge", text: "AI" })]),
      el("p", { class: "ask-sub", text: "Usually replies instantly" })
    ]),
    closeBtn
  ]);

  // chat view
  var log = el("div", { class: "ask-log", tabindex: "-1" });
  var live = el("div", { class: "ask-sr", "aria-live": "polite" });
  var input = el("input", { type: "text", class: "ask-input", maxlength: String(MAX), placeholder: "Ask about Rick’s work…", "aria-label": "Ask a question about Rick’s work", autocomplete: "off" });
  var sendBtn = el("button", { type: "submit", class: "ask-send", "aria-label": "Send" }, [icon("send")]);
  var counter = el("p", { class: "ask-counter", "aria-live": "polite", hidden: "" });
  var form = el("form", { class: "ask-form" }, [el("div", { class: "ask-input-row" }, [input, sendBtn]), counter]);
  var disclaimer = el("p", { class: "ask-disclaimer", text: "AI can make mistakes. Check the case studies or ask Rick. Messages are sent to Anthropic’s Claude to generate answers." });
  var chatView = el("div", { class: "ask-view ask-chat" }, [log, live]);

  // contact view
  var contactView = el("div", { class: "ask-view ask-contact", hidden: "" });

  var footer = el("div", { class: "ask-footer" }, [form, disclaimer]);
  panel.appendChild(header); panel.appendChild(chatView); panel.appendChild(contactView); panel.appendChild(footer);
  root.appendChild(scrim); root.appendChild(panel); root.appendChild(launcher);

  function contactButton(label) {
    return el("button", { type: "button", class: "ask-btn ask-btn--primary", onclick: function () { showContact(); } }, [icon("mail"), el("span", { text: label || "Get in touch with Rick" })]);
  }
  function contactLinks() {
    return el("div", { class: "ask-contact-links" }, [
      el("a", { class: "ask-link ask-iconlink", href: "mailto:" + EMAIL, onclick: function () { track("contact-email"); } }, [icon("mail"), el("span", { text: EMAIL })]),
      el("a", { class: "ask-link ask-iconlink", href: LINKEDIN, target: "_blank", rel: "noopener", onclick: function () { track("contact-linkedin"); } }, [icon("li"), el("span", { text: "linkedin.com/in/rickhollandsworth" })])
    ]);
  }
  function chips(list) {
    var wrap = el("div", { class: "ask-chips" });
    list.forEach(function (q) {
      wrap.appendChild(el("button", { type: "button", class: "ask-chip", text: q, onclick: function () { track("chip"); send(q); } }));
    });
    return wrap;
  }
  function bubble(role) {
    var b = el("div", { class: "ask-msg ask-msg--" + role });
    var row = el("div", { class: "ask-row ask-row--" + role }, [b]);
    log.appendChild(row);
    return b;
  }
  function scrollDown() { chatView.scrollTop = chatView.scrollHeight; }

  function renderWelcome() {
    var intro = bubble("assistant");
    intro.appendChild(el("p", { text: INTRO1 })); intro.appendChild(el("p", { text: INTRO2 }));
    log.appendChild(el("div", { class: "ask-cta" }, [
      contactButton(),
      el("a", { class: "ask-link ask-cta-link", href: LINKEDIN, target: "_blank", rel: "noopener", text: "or message Rick on LinkedIn", onclick: function () { track("contact-linkedin"); } })
    ]));
    log.appendChild(el("p", { class: "ask-label", text: "Try asking" }));
    log.appendChild(chips(STARTERS));
  }
  function renderHistory() {
    log.textContent = "";
    renderWelcome();
    state.messages.forEach(function (m) {
      var b = bubble(m.role);
      if (m.role === "assistant") renderMarkdown(m.content, b); else b.textContent = m.content;
    });
    scrollDown();
  }

  function fallback(kind, partial) {
    var box = el("div", { class: "ask-notice" });
    var title = kind === "rate_limited" ? "Message limit reached" : "The assistant is resting";
    var text = kind === "rate_limited" ? "You’ve reached the message limit for now. You can get in touch with Rick directly."
      : partial ? "The answer was cut off. You can still reach Rick directly, and every case study is on the site."
        : "It’s unavailable right now. You can still reach Rick directly, and every case study is on the site.";
    box.appendChild(el("div", { class: "ask-notice-head" }, [icon("alert"), el("strong", { text: title })]));
    box.appendChild(el("p", { text: text }));
    box.appendChild(contactButton());
    box.appendChild(contactLinks());
    log.appendChild(box);
    live.textContent = text;
    scrollDown();
  }

  function setBusy(b) {
    state.busy = b;
    input.disabled = b; sendBtn.disabled = b;
    Array.prototype.forEach.call(log.querySelectorAll(".ask-chip"), function (c) { c.disabled = b; });
  }

  function send(text) {
    text = String(text || "").trim().slice(0, MAX);
    if (!text || state.busy) return;
    track("send");
    state.asked.push(text);
    state.messages.push({ role: "user", content: text });
    bubble("user").textContent = text;
    input.value = ""; updateCounter();
    var b = bubble("assistant");
    b.classList.add("ask-msg--typing");
    b.appendChild(el("span", { class: "ask-dots", "aria-label": "Assistant is typing" }, [el("i"), el("i"), el("i")]));
    scrollDown();
    setBusy(true);
    save();

    var answer = "", finished = false, failure = null, cut = false;
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 45000);
    function paint() { b.classList.remove("ask-msg--typing"); b.textContent = answer; scrollDown(); }
    function finish() {
      clearTimeout(timer);
      if (answer && cut) {
        // The answer hit the length limit: drop a half-written link or sentence and say so.
        answer = answer.replace(/\s*\[[^\]]*(\]\([^)]*)?$/, "").replace(/\s*\*\*[^*]*$/, "").trimEnd();
        var lastStop = Math.max(answer.lastIndexOf(". "), answer.lastIndexOf(".\n"), answer.endsWith(".") ? answer.length - 1 : -1);
        if (lastStop > answer.length * 0.6) answer = answer.slice(0, lastStop + 1);
        answer += "\n\n(That answer ran long. Ask a follow-up for more detail.)";
      }
      if (answer) {
        b.classList.remove("ask-msg--typing");
        renderMarkdown(answer, b);
        state.messages.push({ role: "assistant", content: answer });
      } else {
        b.parentNode.parentNode.removeChild(b.parentNode);
      }
      if (finished && !failure && !answer) failure = "unavailable";
      if (finished && !failure) {
        live.textContent = b.textContent;
        var rest = STARTERS.filter(function (q) { return state.asked.indexOf(q) < 0; }).slice(0, 2);
        if (rest.length) log.appendChild(chips(rest));
      } else {
        fallback(failure === "rate_limited" ? "rate_limited" : "unavailable", !!answer);
      }
      setBusy(false);
      save();
      scrollDown();
      focusInput();
    }
    function handle(ev) {
      if (ev.t) { answer += ev.t; paint(); }
      if (ev.cut) cut = true;
      if (ev.done) finished = true;
      if (ev.error) failure = ev.error;
    }
    if (!ENDPOINT || typeof fetch === "undefined") { failure = "unavailable"; finish(); return; }

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: state.messages.slice(-10), page: PAGE }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (!res.ok || !res.body) { failure = res.status === 429 ? "rate_limited" : "unavailable"; return; }
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = "";
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return;
          buf += dec.decode(r.value, { stream: true });
          var i;
          while ((i = buf.indexOf("\n")) >= 0) {
            var line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
            if (line.indexOf("data:") !== 0) continue;
            try { handle(JSON.parse(line.slice(5))); } catch (e) { /* skip bad line */ }
          }
          if (finished || failure) return;
          return pump();
        });
      }
      return pump();
    }).catch(function () { failure = failure || "unavailable"; })
      .then(function () { if (!finished && !failure) failure = "unavailable"; finish(); });
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); send(input.value); });
  function updateCounter() {
    var left = MAX - input.value.length;
    counter.hidden = input.value.length <= 400;
    counter.textContent = left + " characters left";
  }
  input.addEventListener("input", updateCounter);

  // ---------- contact form ----------
  function field(id, label, required, multiline, placeholder) {
    var ctl = el(multiline ? "textarea" : "input", { id: id, name: id.replace("ask-f-", ""), class: "ask-field-input", placeholder: placeholder || "", maxlength: multiline ? "1000" : "120" });
    if (!multiline) ctl.type = "text";
    if (required) { ctl.required = true; ctl.setAttribute("aria-required", "true"); }
    if (multiline) ctl.rows = 3;
    if (id === "ask-f-name") ctl.autocomplete = "name";
    if (id === "ask-f-company") ctl.autocomplete = "organization";
    return el("div", { class: "ask-field" }, [el("label", { for: id, text: label }), ctl]);
  }
  var cForm, cError, cDone;
  function buildContact() {
    contactView.textContent = "";
    var back = el("button", { type: "button", class: "ask-back", onclick: showChat }, ["← Back to chat"]);
    cError = el("p", { class: "ask-error", role: "alert", hidden: "" });
    cDone = el("p", { class: "ask-done", role: "status", hidden: "" });
    cForm = el("form", { class: "ask-cform", novalidate: "" }, [
      field("ask-f-name", "Your name", true, false, "Jane Smith"),
      field("ask-f-company", "Company", true, false, "Acme Corp"),
      field("ask-f-role", "Role you’re hiring for", false, false, "Principal Product Designer"),
      field("ask-f-note", "Note (optional)", false, true, "Anything Rick should know"),
      cError,
      el("button", { type: "submit", class: "ask-btn ask-btn--primary" }, [icon("mail"), el("span", { text: "Draft email" })]),
      el("p", { class: "ask-fine", text: "Nothing is sent until you press Send in your email app." }),
      cDone
    ]);
    cForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = function (n) { return cForm.elements[n].value.trim(); };
      var missing = [];
      if (!v("name")) missing.push("your name");
      if (!v("company")) missing.push("your company");
      if (missing.length) {
        cError.textContent = "Please add " + missing.join(" and ") + ".";
        cError.hidden = false;
        cForm.elements[!v("name") ? "name" : "company"].focus();
        return;
      }
      cError.hidden = true;
      var href = buildMailto({ name: v("name"), company: v("company"), role: v("role"), note: v("note") });
      track("contact-draft");
      cDone.textContent = "Your email app should open with a draft to Rick. If it doesn’t, email " + EMAIL + ".";
      cDone.hidden = false;
      window.location.href = href;
    });
    contactView.appendChild(back);
    contactView.appendChild(el("h3", { class: "ask-ctitle", text: "Get in touch with Rick", tabindex: "-1" }));
    contactView.appendChild(el("p", { class: "ask-cintro", text: "Tell Rick a little about the role. This opens a pre-filled email in your email app." }));
    contactView.appendChild(cForm);
  }
  function showContact() {
    track("contact-open");
    if (!cForm) buildContact();
    chatView.hidden = true; form.hidden = true; contactView.hidden = false;
    contactView.scrollTop = 0;
    contactView.querySelector(".ask-ctitle").focus();
  }
  function showChat() {
    contactView.hidden = true; chatView.hidden = false; form.hidden = false;
    scrollDown(); focusInput();
  }

  // ---------- open / close ----------
  // On phones the sheet covers the page, so the page behind it is made inert while it is open.
  function setInert(on) {
    Array.prototype.forEach.call(document.body.children, function (n) {
      if (n === root || n.tagName === "SCRIPT") return;
      if (on) { if (!n.hasAttribute("inert")) { n.setAttribute("inert", ""); n.setAttribute("data-ask-inert", ""); } }
      else if (n.hasAttribute("data-ask-inert")) { n.removeAttribute("inert"); n.removeAttribute("data-ask-inert"); }
    });
  }
  // On phones, don't pop the keyboard over the answer: focus the conversation instead of the input.
  function focusInput() { if (mq.matches) log.focus({ preventScroll: true }); else input.focus(); }
  var mq = window.matchMedia ? window.matchMedia("(max-width: 600px)") : { matches: false };
  function open() {
    if (state.open && !panel.hidden) return;
    state.open = true;
    panel.hidden = false; scrim.hidden = !mq.matches;
    panel.setAttribute("aria-modal", mq.matches ? "true" : "false");
    setInert(mq.matches);
    launcher.setAttribute("aria-expanded", "true");
    launcher.setAttribute("aria-label", "Close assistant");
    lIconChat.hidden = true; lIconClose.hidden = false;
    launcher.classList.remove("ask-launcher--label");
    root.classList.add("ask-open");
    set("localStorage", "ask-seen", "1");
    if (!log.childNodes.length) renderHistory();
    track("open");
    setTimeout(function () { if (contactView.hidden) focusInput(); }, 30);
  }
  function close() {
    state.open = false;
    panel.hidden = true; scrim.hidden = true;
    setInert(false);
    launcher.setAttribute("aria-expanded", "false");
    launcher.setAttribute("aria-label", "Ask about Rick");
    lIconChat.hidden = false; lIconClose.hidden = true;
    root.classList.remove("ask-open");
    launcher.focus();
  }
  launcher.addEventListener("click", function () { if (panel.hidden) open(); else close(); });
  closeBtn.addEventListener("click", close);
  scrim.addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) { e.preventDefault(); close(); } });
  window.addEventListener("pagehide", save);

  function mount() {
    document.body.appendChild(root);
    if (state.open) { state.open = false; open(); }
  }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
