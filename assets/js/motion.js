/* Scroll motion for rickhollandsworth.com (GSAP + ScrollTrigger, self-hosted in assets/js/vendor/).
 *
 * Rules this file keeps:
 *  - Content never depends on it. With JavaScript off, GSAP missing, or "reduce motion" turned on,
 *    every page is the plain, fully visible layout.
 *  - Only transform and opacity are animated (no layout properties), so nothing reflows.
 *  - Native scrolling is never hijacked: no smooth-scroll library, no pinning.
 *  - Reveals play once and stay revealed; scrolling back up never hides text again.
 *  - Hidden-until-revealed content uses opacity only (never visibility:hidden), so it stays in the
 *    accessibility tree and find-in-page; keyboard focus inside an unrevealed block reveals it at once.
 *  - ScrollTrigger.refresh() is never run while the page is scrolling: it restores the old scroll
 *    position and would cancel a smooth in-page jump (that was the Work/About/Contact nav bug).
 *
 * The <head> adds the "motion" class to <html> so the hero can start hidden without a flash.
 * This file removes that class once it has taken over (or straight away if it can't run).
 */
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function release() { root.classList.remove('motion'); window.__motion = 'off'; }

  if (reduce || !window.gsap || !window.ScrollTrigger) { release(); return; }

  var gsap = window.gsap, ST = window.ScrollTrigger;
  gsap.registerPlugin(ST);
  // ScrollTrigger re-measures on "load" by itself, which would cancel a smooth jump the visitor
  // started before the page finished loading. Leave "load" out; refresh() below handles it safely.
  ST.config({ autoRefreshEvents: 'visibilitychange,DOMContentLoaded,resize' });
  window.__motion = 'on';

  // If anything below throws, show everything rather than leave content faded out.
  try { setup(); } catch (err) {
    gsap.set('.m-anim', { clearProps: 'transform,opacity,visibility' });
    release();
    if (window.console) console.warn('motion.js disabled:', err);
  }

  function setup() {

  var EASE = 'power3.out';
  var $ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  // Mark everything we touch so print styles can force it visible.
  function mark(els) { els.forEach(function (el) { el.classList.add('m-anim'); }); return els; }

  /* Reveal a group of elements when the first of them scrolls into view. */
  function reveal(els, opts) {
    els = mark(els.filter(Boolean));
    if (!els.length) return;
    opts = opts || {};
    gsap.from(els, {
      opacity: 0,
      y: opts.y == null ? 32 : opts.y,
      duration: opts.duration || 0.9,
      ease: EASE,
      stagger: opts.stagger == null ? 0.08 : opts.stagger,
      clearProps: 'transform,opacity',
      scrollTrigger: { trigger: opts.trigger || els[0], start: opts.start || 'top 85%', once: true }
    });
  }

  /* Image eases from slightly zoomed to rest as it travels through the viewport. */
  function settle(img, from) {
    if (!img) return;
    mark([img]);
    gsap.fromTo(img, { scale: from || 1.08 }, {
      scale: 1, ease: 'none',
      scrollTrigger: { trigger: img.closest('.shot') || img, start: 'top bottom', end: 'center 45%', scrub: 0.6 }
    });
  }

  /* ---------- Hero (home page) ---------- */
  var hero = document.querySelector('.hero .wrap');
  if (hero) {
    var parts = mark([hero.querySelector('.label'), hero.querySelector('h1'), hero.querySelector('.lede'), hero.querySelector('.hero-actions')].filter(Boolean));
    var stats = mark($('.stat', hero));
    root.classList.remove('motion'); // hand the hidden start state from CSS to GSAP
    var intro = gsap.timeline({ defaults: { ease: EASE } });
    intro.from(parts, { opacity: 0, y: 28, duration: 1, stagger: 0.1, clearProps: 'transform,opacity' })
         .from(stats, { opacity: 0, y: 20, duration: 0.8, stagger: 0.08, clearProps: 'transform,opacity' }, '-=0.55');

    // Count the headline numbers up ("$41B", "20M", "30", "5×"); screen readers get the final value.
    stats.forEach(function (stat, i) {
      var b = stat.querySelector('b');
      var m = b && b.textContent.match(/^(\D*)(\d+(?:\.\d+)?)(.*)$/);
      if (!m) return;
      var end = parseFloat(m[2]), dec = (m[2].split('.')[1] || '').length, n = { v: 0 };
      b.setAttribute('aria-label', b.textContent);
      gsap.to(n, {
        v: end, duration: 1.4, ease: 'power2.out', delay: 0.55 + i * 0.08,
        onUpdate: function () { b.textContent = m[1] + n.v.toFixed(dec) + m[3]; },
        onComplete: function () { b.textContent = m[1] + m[2] + m[3]; }
      });
    });

    // As the hero scrolls away its content drifts up and dims a little (scrubbed to the scrollbar).
    gsap.to(hero, {
      y: -60, opacity: 0.35, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.5 }
    });
  } else {
    root.classList.remove('motion');
  }

  /* ---------- Client logos ---------- */
  reveal($('.clients .label, .clients img'), { y: 14, stagger: 0.06, start: 'top 92%' });

  /* ---------- Section heads ---------- */
  $('.section-head').forEach(function (head) { reveal($(':scope > *', head), { y: 24, stagger: 0.1 }); });

  /* ---------- Case studies (home cards and case pages) ---------- */
  $('.case').forEach(function (cs) {
    var summary = cs.querySelector('.case-summary');
    if (summary) reveal($(':scope > *', summary), { y: 28, stagger: 0.09 });
    var heroShot = cs.querySelector('.case-hero .shot');
    if (heroShot) {
      reveal([heroShot], { y: 48, duration: 1.1, start: 'top 90%' });
      settle(heroShot.querySelector('img, video'), 1.1);
    }
    reveal($('.meta > div', cs), { y: 20, stagger: 0.07 });
    $('.case-block', cs).forEach(function (block) {
      var items = $('.decisions > li', block);
      reveal($(':scope > h4, :scope > p', block), { y: 24 });
      if (items.length) reveal(items, { y: 30, stagger: 0.07, trigger: items[0] });
    });
    $('.case-strip .shot', cs).forEach(function (shot) {
      reveal([shot], { y: 40, start: 'top 90%' });
      settle(shot.querySelector('img, video'), 1.06);
    });
    var links = cs.querySelector('.case-links');
    if (links) reveal([links], { y: 16 });
  });

  /* ---------- Earlier work, about, recommendations, contact ---------- */
  reveal($('.earlier > div, .earlier li'), { y: 20, stagger: 0.06 });

  var portrait = document.querySelector('.about > img');
  if (portrait) {
    reveal([portrait], { y: 40, duration: 1.1 });
    reveal($('.about .bio > p'), { y: 24, stagger: 0.1, trigger: portrait });
    reveal($('.about .facts > div'), { y: 20, stagger: 0.08 });
  }

  // Recommendations come in a row at a time as they reach the viewport.
  // The ones inside "Show more" (<details>) fade in when it opens instead.
  var recs = mark($('.rec').filter(function (r) { return !r.closest('details'); }));
  $('details.recs-expand').forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (d.open) {
        var inner = mark($('.rec', d));
        gsap.fromTo(inner, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: EASE, stagger: 0.05, clearProps: 'transform,opacity' });
      }
      refresh(); // the page got taller or shorter; re-measure everything below
    });
  });
  if (recs.length) {
    gsap.set(recs, { opacity: 0, y: 36 });
    ST.batch(recs, {
      start: 'top 90%', once: true,
      onEnter: function (batch) {
        gsap.to(batch, { opacity: 1, y: 0, duration: 0.8, ease: EASE, stagger: 0.1, clearProps: 'transform,opacity' });
      }
    });
  }

  var contact = document.querySelector('.contact .wrap');
  if (contact) reveal($(':scope > h2, :scope > .sub, :scope > dl > div', contact), { y: 30, stagger: 0.08 });

  /* ---------- Reading progress (case-study and resource pages) ---------- */
  if (document.querySelector('main article.case') && !document.querySelector('.hero')) {
    var bar = document.createElement('div');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    gsap.fromTo(bar, { scaleX: 0 }, {
      scaleX: 1, ease: 'none',
      scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 0.3 }
    });
  }

  // Images and fonts change page height after load; re-measure so triggers fire in the right place.
  window.addEventListener('load', refresh);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);

  // Keyboard users: tabbing into a block that hasn't scrolled into its reveal yet shows it at once,
  // so a focused link is never invisible.
  document.addEventListener('focusin', function (e) {
    for (var el = e.target; el && el !== document.body; el = el.parentElement) {
      if (!el.classList || !el.classList.contains('m-anim')) continue;
      gsap.getTweensOf(el).forEach(function (t) { if (!t.scrollTrigger || !t.scrollTrigger.vars.scrub) t.progress(1); });
      if (parseFloat(getComputedStyle(el).opacity) < 1 && !el.closest('.hero')) gsap.set(el, { clearProps: 'transform,opacity' });
    }
  });
  }

  // Re-measure, but never mid-scroll: refresh() puts the scroll position back where it started,
  // which cancels a smooth jump to #work, #about or #contact. Wait until scrolling settles.
  var lastScroll = 0;
  window.addEventListener('scroll', function () { lastScroll = Date.now(); }, { passive: true });
  function refresh() {
    if (Date.now() - lastScroll < 200) { setTimeout(refresh, 250); return; }
    ST.refresh();
    realign();
  }

  // Opened from a direct link (rickhollandsworth.com/#about): fonts and images arriving can shift the
  // section after the browser has jumped to it. Until the visitor scrolls, clicks or types themselves,
  // keep the linked section lined up under the header.
  var userMoved = false;
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (type) {
    window.addEventListener(type, function () { userMoved = true; }, { passive: true, once: true });
  });
  function realign() {
    if (userMoved || location.hash.length < 2) return;
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
  }
})();
