/* Pause/play control for the looping demo videos (FinFront FX Terminal, FinFront design library).
 *
 *  - Every <video autoplay loop> gets a visible, keyboard-operable button (WCAG 2.2.2 Pause, Stop, Hide).
 *  - The button is placed outside any aria-hidden link wrapper so screen readers can reach it.
 *  - Its name says what it does and which video: "Pause video: FinFront FX Terminal" / "Play video: …".
 *  - "Reduce motion" (now or later) stops autoplay and shows the poster; the visitor can still press Play.
 */
(function () {
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  var ICON_PLAY = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';

  Array.prototype.forEach.call(document.querySelectorAll('video[autoplay][loop]'), function (v) {
    var name = (v.getAttribute('aria-label') || 'demo').split(':')[0].trim();
    // Host: the frame around the video, but never inside an aria-hidden or tabindex=-1 link.
    var host = v.closest('.shot') || v.parentElement;
    var hidden = host.closest('[aria-hidden="true"]');
    if (hidden) host = hidden.parentElement;
    host.classList.add('has-vctl');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vctl';
    host.appendChild(btn);

    function render() {
      var playing = !v.paused && !v.ended;
      btn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      btn.setAttribute('aria-label', (playing ? 'Pause video: ' : 'Play video: ') + name);
      btn.title = playing ? 'Pause video' : 'Play video';
    }
    btn.addEventListener('click', function () {
      if (v.paused || v.ended) { var p = v.play(); if (p && p.catch) p.catch(render); }
      else v.pause();
    });
    v.addEventListener('play', render);
    v.addEventListener('playing', render);
    v.addEventListener('pause', render);

    function stopForReducedMotion() {
      v.removeAttribute('autoplay');
      v.autoplay = false;
      v.pause();
      if (v.currentTime > 0) v.load(); // back to the poster frame
      render();
    }
    if (mq && mq.matches) stopForReducedMotion();
    if (mq) {
      var onChange = function (e) { if (e.matches) stopForReducedMotion(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
    }
    render();
  });
})();
