/* Doctors Dental Care: progressive enhancement only. Every page works without this file. */
(function () {
  'use strict';
  var d = document, b = d.body;

  /* Sticky header shadow */
  var header = d.querySelector('.site-header');
  var onScroll = function () { header && header.classList.toggle('scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* Mobile menu */
  var btn = d.querySelector('.menu-btn'), menu = d.getElementById('mobile-menu');
  if (btn && menu) {
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.classList.toggle('open', open);
    });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('open')) { btn.click(); btn.focus(); }
    });
  }

  /* Open-now status, computed in Nepal time (UTC+5:45) whatever the visitor's timezone */
  var toMin = function (s) { var p = s.split(':'); return +p[0] * 60 + +p[1]; };
  var fmt = function (s) {
    var p = s.split(':'), h = +p[0], m = p[1];
    return ((h % 12) || 12) + ':' + m + (h < 12 ? ' AM' : ' PM');
  };
  var openAt = b.getAttribute('data-open'), closeAt = b.getAttribute('data-close');
  if (openAt && closeAt) {
    var now = new Date(Date.now() + (5 * 60 + 45) * 60000);
    var mins = now.getUTCHours() * 60 + now.getUTCMinutes();
    var isOpen = mins >= toMin(openAt) && mins < toMin(closeAt);
    var label = isOpen ? 'Open now · until ' + fmt(closeAt)
      : 'Closed now · opens ' + (mins < toMin(openAt) ? 'today' : 'tomorrow') + ' at ' + fmt(openAt);
    d.querySelectorAll('[data-status]').forEach(function (el) {
      el.textContent = label;
      el.classList.add(isOpen ? 'is-open' : 'is-closed');
    });
    var row = d.querySelector('.hours tr[data-day="' + now.getUTCDay() + '"]');
    if (row) row.classList.add('today');
  }

  /* Click-to-load Google map */
  d.querySelectorAll('[data-load-map]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var box = btn.closest('.map'), f = d.createElement('iframe');
      f.src = box.getAttribute('data-embed');
      f.title = 'Map showing Doctors Dental Care at Tenzing Chowk, Kapan, Kathmandu';
      f.referrerPolicy = 'no-referrer-when-downgrade';
      box.appendChild(f);
    });
  });

  /* Scroll reveal: content is visible by default; JS only adds the animation */
  var els = d.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  } else {
    els.forEach(function (el) { el.classList.add('in'); });
  }

  /* Appointment form */
  var form = d.getElementById('appointment-form');
  if (!form) return;
  var q = new URLSearchParams(location.search).get('service');
  var sel = form.querySelector('#service');
  if (q && sel) {
    Array.prototype.forEach.call(sel.options, function (o) { if (o.getAttribute('data-slug') === q) sel.value = o.value; });
  }
  var date = form.querySelector('#date');
  if (date) {
    var t = new Date(Date.now() + (5 * 60 + 45) * 60000);
    date.min = t.toISOString().slice(0, 10);
  }
  var status = d.getElementById('form-status');
  var waBase = form.getAttribute('data-wa');

  var waText = function () {
    var f = new FormData(form), lines = ['Hello Doctors Dental Care, I would like an appointment.'];
    ['name', 'phone', 'service', 'date', 'message'].forEach(function (k) {
      var v = (f.get(k) || '').toString().trim();
      if (v) lines.push(k.charAt(0).toUpperCase() + k.slice(1) + ': ' + v);
    });
    return waBase + '?text=' + encodeURIComponent(lines.join('\n'));
  };
  var show = function (kind, html) {
    status.className = 'form-status show ' + kind;
    status.innerHTML = html;
    status.setAttribute('tabindex', '-1');
    status.focus({ preventScroll: false });
  };

  form.addEventListener('submit', function (e) {
    if (!form.checkValidity()) return; // let the browser show its messages
    e.preventDefault();
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
