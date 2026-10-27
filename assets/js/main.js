/* Doctors Dental Care v2: motion + behaviour. Progressive enhancement only; every page works without it. */
(function () {
  'use strict';
  var d = document, b = d.body, root = d.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (/[?&]shot/.test(location.search)) root.classList.add('shot');
  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };
  var clamp = function (v, a, z) { return Math.max(a, Math.min(z, v)); };

  /* ---------------------------------------------------------------- split headlines */
  $$('[data-split]').forEach(function (el) {
    var i = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = d.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(d.createTextNode(part)); return; }
            var w = d.createElement('span'), s = d.createElement('span');
            w.className = 'w'; s.textContent = part; s.style.setProperty('--i', i++);
            w.appendChild(s); frag.appendChild(w);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'svg' && n.tagName !== 'MARK') walk(n);
      });
    })(el);
    el.classList.add('split');
  });

  /* ---------------------------------------------------------------- reveal on scroll */
  var revealables = $$('.rv, .rv-scale, .split, .tcard, .art-host, [data-count]');
  if (root.classList.contains('shot')) revealables.forEach(function (el) { el.classList.add('in'); });
  var countUp = function (el) {
    var end = +el.getAttribute('data-count'), t0 = null, dur = 1400;
    if (reduce) { el.textContent = end; return; }
    (function step(t) {
      if (!t0) t0 = t;
      var p = clamp((t - t0) / dur, 0, 1), e = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.round(end * e);
      if (p < 1) requestAnimationFrame(step);
    })(performance.now());
  };
  if (!reduce && !root.classList.contains('shot')) $$('[data-count]').forEach(function (el) { el.textContent = '0'; });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        if (e.target.hasAttribute('data-count') && !root.classList.contains('shot')) countUp(e.target);
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    revealables.forEach(function (el) { io.observe(el); });
    /* pause looping illustrations while off screen */
    var pio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.target.classList.toggle('paused', !e.isIntersecting); });
    });
    $$('.art').forEach(function (el) { pio.observe(el); });
  } else {
    revealables.forEach(function (el) { el.classList.add('in'); });
  }
  /* the first screen should never wait for a scroll */
  requestAnimationFrame(function () { $$('.hero .split, .page-hero .split, .hero .rv, .page-hero .rv, .page-hero .art-host, .hero .rv-scale').forEach(function (el) { el.classList.add('in'); }); });

  /* ---------------------------------------------------------------- header, progress, action bar */
  var header = $('.site-header'), prog = $('.progress'), bar = $('.actionbar'), lastY = 0, ticking = false;
  var onScroll = function () {
    var y = window.scrollY, h = root.scrollHeight - innerHeight;
    if (prog) prog.style.setProperty('--p', h > 0 ? (y / h).toFixed(4) : 0);
    /* Booking and form pages keep the header still: a sliding header while filling a form is distracting (client, 2026-10-27). */
    if (header && !b.classList.contains('menu-open') && !b.classList.contains('steady')) header.classList.toggle('hide', y > 300 && y > lastY + 4);
    if (y < lastY - 4 && header) header.classList.remove('hide');
    if (bar) bar.classList.toggle('show', y > 260);
    lastY = y;
    scrollScenes();
    ticking = false;
  };
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });

  /* nav hover pill */
  var nav = $('.nav'), pill = nav && $('.pill', nav);
  if (nav && pill) {
    var moveTo = function (a) { if (!a) { pill.style.opacity = 0; return; } pill.style.left = a.offsetLeft + 'px'; pill.style.width = a.offsetWidth + 'px'; pill.style.opacity = 1; };
    var current = $('a[aria-current]', nav);
    moveTo(current);
    $$('a', nav).forEach(function (a) { a.addEventListener('mouseenter', function () { moveTo(a); }); });
    nav.addEventListener('mouseleave', function () { moveTo(current); });
  }

  /* menu overlay */
  var menuBtn = $('.menu-btn');
  if (menuBtn) {
    $$('.overlay nav a').forEach(function (a, i) { a.style.setProperty('--i', i); });
    var setMenu = function (open) {
      b.classList.toggle('menu-open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      $('.overlay').setAttribute('aria-hidden', String(!open));
    };
    menuBtn.addEventListener('click', function () { setMenu(!b.classList.contains('menu-open')); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && b.classList.contains('menu-open')) { setMenu(false); menuBtn.focus(); } });
  }

  /* ---------------------------------------------------------------- Nepal time: status, hours, clock */
  var npt = function () { return new Date(Date.now() + (5 * 60 + 45) * 60000); };
  var toMin = function (s) { var p = s.split(':'); return +p[0] * 60 + +p[1]; };
  var fmt = function (s) { var p = s.split(':'), h = +p[0]; return ((h % 12) || 12) + ':' + p[1] + (h < 12 ? ' AM' : ' PM'); };
  var openAt = b.getAttribute('data-open'), closeAt = b.getAttribute('data-close');
  var updateStatus = function () {
    if (!openAt) return;
    var n = npt(), mins = n.getUTCHours() * 60 + n.getUTCMinutes(), isOpen = mins >= toMin(openAt) && mins < toMin(closeAt);
    var label = isOpen ? 'Open now · until ' + fmt(closeAt) : 'Closed · opens ' + (mins < toMin(openAt) ? 'today' : 'tomorrow') + ' ' + fmt(openAt);
    $$('[data-status]').forEach(function (el) {
      el.textContent = label;
      el.classList.toggle('is-open', isOpen); el.classList.toggle('is-closed', !isOpen);
    });
    $$('.hours tr').forEach(function (r) { r.classList.toggle('today', +r.getAttribute('data-day') === n.getUTCDay()); });
    $$('[data-npt]').forEach(function (el) {
      var h = n.getUTCHours(), m = n.getUTCMinutes();
      el.textContent = ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' AM' : ' PM');
    });
  };
  var clock = $('.clock');
  var tickClock = function () {
    if (!clock) return;
    var n = npt(), s = n.getUTCSeconds() + n.getUTCMilliseconds() / 1000, m = n.getUTCMinutes() + s / 60, h = (n.getUTCHours() % 12) + m / 60;
    $('.h', clock).style.transform = 'rotate(' + h * 30 + 'deg)';
    $('.m', clock).style.transform = 'rotate(' + m * 6 + 'deg)';
    $('.s', clock).style.transform = 'rotate(' + (reduce ? Math.floor(s) : s) * 6 + 'deg)';
  };
  updateStatus(); tickClock();
  setInterval(updateStatus, 30000);
  if (clock) { if (reduce) setInterval(tickClock, 1000); else (function loop() { tickClock(); requestAnimationFrame(loop); })(); }

  /* ---------------------------------------------------------------- pointer effects */
  if (finePointer && !reduce) {
    $$('.tcard').forEach(function (c) {
      c.addEventListener('pointermove', function (e) {
        var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        c.style.setProperty('--mx', x * 100 + '%'); c.style.setProperty('--my', y * 100 + '%');
        c.style.transform = 'rotateX(' + ((.5 - y) * 8).toFixed(2) + 'deg) rotateY(' + ((x - .5) * 10).toFixed(2) + 'deg) translateY(-4px)';
      });
      c.addEventListener('pointerleave', function () { c.style.transform = ''; });
    });
    $$('.btn').forEach(function (btn) {
      var magnet = btn.hasAttribute('data-magnet');
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        btn.style.setProperty('--bx', x + 'px'); btn.style.setProperty('--by', y + 'px');
        if (magnet) btn.style.transform = 'translate(' + ((x - r.width / 2) * .18).toFixed(1) + 'px,' + ((y - r.height / 2) * .28).toFixed(1) + 'px)';
      });
      if (magnet) btn.addEventListener('pointerleave', function () { btn.style.transform = ''; });
    });
    $$('.cta').forEach(function (c) {
      c.addEventListener('pointermove', function (e) {
        var r = c.getBoundingClientRect();
        c.style.setProperty('--cx', e.clientX - r.left + 'px'); c.style.setProperty('--cy', e.clientY - r.top + 'px');
      });
    });
    var stage = $('.hero .stage');
    if (stage) {
      d.addEventListener('pointermove', function (e) {
        var x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5;
        stage.style.transform = 'translate(' + (x * -14).toFixed(1) + 'px,' + (y * -14).toFixed(1) + 'px)';
      });
    }
  }

  /* ---------------------------------------------------------------- scroll-linked scenes */
  var process = $('.process'), steps = process ? $$('.steps li', process) : [];
  var timeline = $('.timeline'), tItems = timeline ? $$('li', timeline) : [];
  var tocLinks = $$('.toc a'), blocks = tocLinks.map(function (a) { return d.getElementById(a.getAttribute('href').slice(1)); });
  function scrollScenes() {
    var vh = innerHeight;
    if (process) {
      var r = process.getBoundingClientRect(), p = clamp((vh * .85 - r.top) / (r.height * .9), 0, 1);
      if (reduce) p = 1;
      process.style.setProperty('--sp', p.toFixed(3));
      steps.forEach(function (li, i) { li.classList.toggle('lit', p >= (i + .3) / steps.length); });
    }
    if (timeline) {
      var tr = timeline.getBoundingClientRect(), tp = clamp((vh * .6 - tr.top) / tr.height, 0, 1);
      timeline.style.setProperty('--tp', tp.toFixed(3));
      tItems.forEach(function (li) { li.classList.toggle('lit', li.getBoundingClientRect().top < vh * .6); });
    }
    if (tocLinks.length) {
      var on = 0;
      blocks.forEach(function (bk, i) { if (bk && bk.getBoundingClientRect().top < vh * .35) on = i; });
      tocLinks.forEach(function (a, i) { a.classList.toggle('on', i === on); });
    }
  }
  onScroll();

  /* ---------------------------------------------------------------- click-to-load map */
  $$('[data-load-map]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var box = btn.closest('.map'), f = d.createElement('iframe');
      f.src = box.getAttribute('data-embed');
      f.title = 'Map showing Doctors Dental Care at Tenzing Chowk, Kapan, Kathmandu';
      f.referrerPolicy = 'no-referrer-when-downgrade';
      box.appendChild(f);
    });
  });

  /* ---------------------------------------------------------------- appointment form */
  var form = d.getElementById('appointment-form');
  if (!form) return;
  var q = new URLSearchParams(location.search).get('service');
  if (q) { var pick = form.querySelector('input[name="service"][data-slug="' + q + '"]'); if (pick) pick.checked = true; }
  var date = form.querySelector('#date');
  if (date) date.min = npt().toISOString().slice(0, 10);
  var status = d.getElementById('form-status'), waBase = form.getAttribute('data-wa');
  var waText = function () {
    var f = new FormData(form), lines = ['Hello Doctors Dental Care, I would like an appointment.'];
    ['name', 'phone', 'service', 'date', 'message'].forEach(function (k) {
      var v = (f.get(k) || '').toString().trim();
      if (v) lines.push(k.charAt(0).toUpperCase() + k.slice(1) + ': ' + v);
    });
    return waBase + '?text=' + encodeURIComponent(lines.join('\n'));
  };
  var show = function (kind, html) {
    status.className = 'form-status show ' + kind; status.innerHTML = html;
    status.setAttribute('tabindex', '-1'); status.focus();
  };
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.reportValidity()) return;
    var submit = form.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = 'Sending…';
    fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json, text/html' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        show('ok', '<b>Thank you. Your request has been sent.</b>We will call you back to confirm a time. If it is urgent, please call us directly.');
        form.reset();
      })
      .catch(function () {
        show('err', '<b>Sorry, the request could not be sent.</b>Your details are still in the form. <a href="' + waText() + '" target="_blank" rel="noopener">Send them on WhatsApp instead</a>, or call us.');
      })
      .then(function () { submit.disabled = false; submit.textContent = 'Send request'; });
  });
})();
