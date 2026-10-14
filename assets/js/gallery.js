/* Photo gallery (filters + accessible lightbox) and video gallery (click-to-load YouTube). */
(function () {
  'use strict';
  var d = document;

  /* ---- filters */
  var bar = d.querySelector('.filters'), grid = d.getElementById('gallery');
  if (bar && grid) bar.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-filter]'); if (!b) return;
    bar.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    var f = b.getAttribute('data-filter');
    grid.querySelectorAll('figure').forEach(function (fig) { fig.hidden = f !== '*' && fig.getAttribute('data-cat') !== f; });
  });

  /* ---- lightbox */
  var links = function () { return Array.prototype.slice.call(d.querySelectorAll('a[data-lightbox]')).filter(function (a) { return !a.closest('figure').hidden; }); };
  var box, img, cap, idx = 0, opener = null;
  function build() {
    box = d.createElement('div'); box.className = 'lightbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Photo viewer');
    box.innerHTML = '<button class="lb-x" type="button" aria-label="Close">×</button><button class="lb-prev" type="button" aria-label="Previous photo">‹</button><figure><img alt=""><figcaption></figcaption></figure><button class="lb-next" type="button" aria-label="Next photo">›</button>';
    d.body.appendChild(box);
    img = box.querySelector('img'); cap = box.querySelector('figcaption');
    box.querySelector('.lb-x').addEventListener('click', close);
    box.querySelector('.lb-prev').addEventListener('click', function () { show(idx - 1); });
    box.querySelector('.lb-next').addEventListener('click', function () { show(idx + 1); });
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    d.addEventListener('keydown', function (e) {
      if (!box.classList.contains('open')) return;
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') show(idx - 1); else if (e.key === 'ArrowRight') show(idx + 1);
      else if (e.key === 'Tab') { var f = box.querySelectorAll('button'); if (e.shiftKey && d.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && d.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); } }
    });
    var x0 = null;
    box.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', function (e) { if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1)); x0 = null; });
  }
  function show(i) {
    var l = links(); if (!l.length) return;
    idx = (i + l.length) % l.length;
    var a = l[idx];
    img.src = a.getAttribute('href'); img.alt = a.querySelector('img').alt; cap.textContent = a.getAttribute('data-caption') || '';
  }
  function close() { box.classList.remove('open'); d.documentElement.style.overflow = ''; if (opener) opener.focus(); }
  d.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-lightbox]'); if (!a) return;
    e.preventDefault(); if (!box) build();
    opener = a; show(links().indexOf(a));
    box.classList.add('open'); d.documentElement.style.overflow = 'hidden'; box.querySelector('.lb-x').focus();
  });
  if (location.hash && /^#p\d+$/.test(location.hash)) { var t = d.querySelector(location.hash + ' a[data-lightbox]'); if (t) setTimeout(function () { t.click(); }, 400); }

  /* ---- videos: swap the thumbnail for the player only on click */
  d.querySelectorAll('[data-yt]').forEach(function (b) {
    b.addEventListener('click', function () {
      var f = d.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(b.getAttribute('data-yt')) + '?autoplay=1&rel=0';
      f.title = b.getAttribute('aria-label').replace(/^Play video: /, '');
      f.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture'; f.allowFullscreen = true;
      f.className = 'vframe';
      b.replaceWith(f); f.focus();
    });
  });
})();
