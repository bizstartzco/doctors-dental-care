/* Doctors Dental Care — online scheduler (/appointment/) and booking manager (/booking/).
 * Talks to the clinic server's /api/. If the API can't be reached (e.g. the static preview), the
 * WhatsApp/phone fallback that is already in the page stays visible. */
(function () {
  'use strict';
  var d = document;
  var root = d.getElementById('scheduler') || d.getElementById('manage');
  if (!root) return;
  var API = root.getAttribute('data-api'), WA = root.getAttribute('data-wa'), TEL = root.getAttribute('data-tel');
  var SITE = API.replace(/api\/$/, '');                         // '/' or '/doctors-dental-care/'
  var q = new URLSearchParams(location.search);
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var npr = function (n) { return 'Rs. ' + Number(n).toLocaleString('en-IN'); };
  var hm = function (s) { var p = s.split(':'), h = +p[0]; return ((h % 12) || 12) + ':' + p[1] + (h < 12 ? ' AM' : ' PM'); };
  var dayName = function (iso, opts) { return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC' }, opts)); };
  var initials = function (n) { return n.replace(/^(dr|mr|ms|mrs)\.?\s+/i, '').split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase(); };
  /* Demo mode: only on a static preview with no server, using assets/booking-demo.json. Nothing is saved. */
  var DEMO = null;
  var demoApi = function (path, opts) {
    var u = new URL(path, 'http://x/'), doc = u.searchParams.get('doctor');
    var npt = new Date(Date.now() + (5 * 60 + 45) * 60000), today = npt.toISOString().slice(0, 10), nowMin = npt.getUTCHours() * 60 + npt.getUTCMinutes();
    var mins = function (s) { return +s.slice(0, 2) * 60 + +s.slice(3); }, hhmm = function (m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
    var slotsOn = function (date) {
      var wd = new Date(date + 'T00:00:00Z').getUTCDay(), set = {};
      Object.keys(DEMO.hours).filter(function (s) { return !doc || s === doc; }).forEach(function (s) {
        DEMO.hours[s].filter(function (h) { return h[0] === wd; }).forEach(function (h) {
          for (var t = mins(h[1]); t + DEMO.slot <= mins(h[2]); t += DEMO.slot) if (date !== today || t >= nowMin + DEMO.notice * 60) set[hhmm(t)] = 1;
        });
      });
      return Object.keys(set).sort().map(function (t) { return { start: t, end: hhmm(mins(t) + DEMO.slot) }; });
    };
    return new Promise(function (resolve) {
      setTimeout(function () {
        if (u.pathname === '/booking/options') return resolve(DEMO.options);
        if (u.pathname === '/booking/dates') { var out = []; for (var i = 0; i <= DEMO.days; i++) { var dd = new Date(Date.parse(today) + i * 864e5).toISOString().slice(0, 10); if (slotsOn(dd).length) out.push(dd); } return resolve({ dates: out }); }
        if (u.pathname === '/booking/slots') return resolve({ slots: slotsOn(u.searchParams.get('date')) });
        if (u.pathname === '/bookings') {
          var b = JSON.parse(opts.body), dr = DEMO.options.doctors.filter(function (x) { return x.slug === b.doctor; })[0];
          return resolve({ token: 'demo', booking: { ref: 'DEMO-' + Math.random().toString(36).slice(2, 8).toUpperCase(), service: b.service, doctor: dr ? dr.name : 'Any available doctor', date: b.date, start: b.start, end: '', name: b.name, status: DEMO.options.deposit ? 'pending' : 'confirmed', deposit: DEMO.options.deposit, paid: false, payMethod: b.payMethod, canCancel: false }, methods: [] });
        }
        resolve({});
      }, 250);
    });
  };
  var realApi = function (path, opts) {
    if (DEMO) return demoApi(path, opts);
    return fetch(API + path, Object.assign({ headers: { Accept: 'application/json' } }, opts)).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Something went wrong.'); e.status = r.status; throw e; } return j; });
    });
  };
  var api = realApi;
  var post = function (path, body) { return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }); };
  var METHOD = {
    esewa: ['eSewa', 'Pay now with your eSewa wallet'], khalti: ['Khalti', 'Pay now with Khalti'],
    qr: ['Fonepay / bank QR', 'Scan our QR from any banking app'], clinic: ['Pay at the clinic', 'Cash or card when you arrive'],
  };
  var STATUS = { pending: ['Awaiting confirmation', 'warn'], confirmed: ['Confirmed', 'ok'], cancelled: ['Cancelled', 'bad'], completed: ['Completed', 'ok'], no_show: ['Missed', 'bad'], expired: ['Expired', 'bad'] };

  /* ================================================================== manage page */
  if (root.id === 'manage') {
    var ref = q.get('ref'), tok = q.get('t');
    if (!ref || !tok) { root.innerHTML = '<div class="panel"><p>This link is incomplete. Please use the link from your booking confirmation, or <a href="' + esc(WA) + '">message us on WhatsApp</a>.</p></div>'; return; }
    var load = function (msg) {
      api('bookings/' + encodeURIComponent(ref) + '?t=' + encodeURIComponent(tok)).then(function (j) { root.innerHTML = view(j.booking, j, msg); wire(j); })
        .catch(function (e) { root.innerHTML = '<div class="panel"><p>' + esc(e.status === 404 ? 'We could not find that booking.' : 'Booking details are unavailable right now.') + ' Please <a href="' + esc(WA) + '">message us on WhatsApp</a> or call.</p></div>'; });
    };
    var flash = q.get('paid') ? ['ok', 'Payment received. Your appointment is confirmed.'] : q.get('failed') ? ['bad', 'The payment did not go through, and nothing was charged. You can try again below or choose another method.'] : q.get('pending') ? ['warn', 'We are still waiting for the payment provider to confirm. Refresh this page in a minute.'] : null;
    load(flash);
    var wire = function (j) {
      var c = root.querySelector('[data-cancel]');
      if (c) c.addEventListener('click', function () {
        if (!confirm('Cancel this appointment?')) return;
        c.disabled = true;
        post('bookings/' + encodeURIComponent(ref) + '/cancel', { t: tok }).then(function () { load(['ok', 'Your appointment has been cancelled.']); }).catch(function (e) { alert(e.message); c.disabled = false; });
      });
      root.querySelectorAll('[data-pay]').forEach(function (b) {
        b.addEventListener('click', function () { b.disabled = true; pay(ref, tok, b.getAttribute('data-pay')).catch(function (e) { alert(e.message); b.disabled = false; }); });
      });
    };
    return;
  }

  /* shared booking view (confirmation + manage) */
  function view(b, j, flashMsg) {
    var st = STATUS[b.status] || [b.status, 'warn'];
    var link = location.origin + SITE + 'booking/?ref=' + encodeURIComponent(b.ref) + '&t=' + encodeURIComponent(j.token || q.get('t'));
    var tokenQ = '?t=' + encodeURIComponent(j.token || q.get('t'));
    var waMsg = 'Hello Doctors Dental Care, I have booked online.\nReference: ' + b.ref + '\nName: ' + b.name + '\nFor: ' + b.service + '\nWhen: ' + dayName(b.date, { weekday: 'long', day: 'numeric', month: 'long' }) + ' at ' + hm(b.start) + (b.doctor ? '\nDoctor: ' + b.doctor : '');
    var unpaid = b.deposit > 0 && !b.paid && b.status === 'pending';
    var methods = (j.methods || []).filter(function (m) { return m !== b.payMethod || m === 'esewa' || m === 'khalti'; });
    var h = DEMO ? '<p class="demo-note">Preview demo: this booking was not saved.' + (b.deposit && (b.payMethod === 'esewa' || b.payMethod === 'khalti') ? ' On the live site you would now go to ' + (b.payMethod === 'esewa' ? 'eSewa' : 'Khalti') + ' to pay ' + npr(b.deposit) + '.' : '') + '</p>' : '';    if (flashMsg) h += '<div class="flash ' + flashMsg[0] + '" role="status">' + esc(flashMsg[1]) + '</div>';
    h += '<div class="confirm-card panel"><div class="cc-top"><div><small>Booking reference</small><b class="ref">' + esc(b.ref) + '</b></div><span class="badge ' + st[1] + '">' + esc(st[0]) + '</span></div>' +
      '<dl class="cc-grid"><dt>Patient</dt><dd>' + esc(b.name) + '</dd><dt>For</dt><dd>' + esc(b.service) + '</dd>' +
      (b.doctor ? '<dt>Doctor</dt><dd>' + esc(b.doctor) + '</dd>' : '') +
      '<dt>When</dt><dd>' + esc(dayName(b.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) + ', ' + hm(b.start) + '</dd>' +
      '<dt>Where</dt><dd>Doctors Dental Care, Tenzing Chowk, Kapan</dd>' +
      (b.deposit > 0 ? '<dt>Deposit</dt><dd>' + npr(b.deposit) + ' · ' + (b.paid ? '<b class="paid">Paid</b>' : 'Not paid yet') + (b.payMethod ? ' (' + esc((METHOD[b.payMethod] || [b.payMethod])[0]) + ')' : '') + '</dd>' : '') +
      '</dl>';
    if (b.status === 'pending' && b.payMethod === 'qr' && !b.paid && j.qr) {
      h += '<div class="qr-box"><img src="' + esc(j.qr.image) + '" alt="Clinic payment QR code" width="220" height="220"><div><b>Scan to pay ' + npr(b.deposit) + '</b><p>Use any banking or wallet app. Put <b>' + esc(b.ref) + '</b> in the remarks.' + (j.qr.note ? ' ' + esc(j.qr.note) : '') + '</p><p>We confirm your booking once the payment shows in our account.</p></div></div>';
    }
    if (!DEMO && unpaid && methods.indexOf('esewa') + methods.indexOf('khalti') > -2) {
      h += '<div class="pay-again"><b>Pay the deposit online</b><div class="btn-row">' + ['esewa', 'khalti'].filter(function (m) { return methods.indexOf(m) > -1; }).map(function (m) { return '<button class="btn btn-primary btn-sm" type="button" data-pay="' + m + '">Pay with ' + METHOD[m][0] + '</button>'; }).join('') + '</div></div>';
    }
    if (b.status === 'pending' && !(b.deposit > 0 && !b.paid && (b.payMethod === 'esewa' || b.payMethod === 'khalti'))) h += '<p class="muted">We will call or WhatsApp you to confirm.</p>';
    h += '<div class="btn-row cc-acts">' +
      (!DEMO && ['pending', 'confirmed'].indexOf(b.status) > -1 ? '<a class="btn btn-ghost btn-sm" href="' + esc(API + 'bookings/' + encodeURIComponent(b.ref) + '/ics' + tokenQ) + '">Add to calendar</a>' : '') +
      '<a class="btn btn-wa btn-sm" href="' + esc(WA + '?text=' + encodeURIComponent(waMsg)) + '" target="_blank" rel="noopener">Send to clinic on WhatsApp</a>' +
      (b.canCancel ? '<button class="btn btn-ghost btn-sm" type="button" data-cancel>Cancel appointment</button>' : '') + '</div>' +
      '<p class="muted small">Keep this link to view or cancel your booking: <a href="' + esc(link) + '">' + esc(link) + '</a></p></div>';
    return h;
  }

  function pay(ref, tok, method) {
    return post('bookings/' + encodeURIComponent(ref) + '/pay', { t: tok, method: method }).then(function (p) { return go(p, ref, tok); });
  }
  function go(p, ref, tok) {
    if (p.type === 'form') {
      var f = d.createElement('form'); f.method = 'POST'; f.action = p.action;
      Object.keys(p.fields).forEach(function (k) { var i = d.createElement('input'); i.type = 'hidden'; i.name = k; i.value = p.fields[k]; f.appendChild(i); });
      d.body.appendChild(f); f.submit(); return new Promise(function () {});
    }
    if (p.type === 'redirect') { location.href = p.url; return new Promise(function () {}); }
    if (p.type === 'error') throw new Error(p.error);
    location.href = SITE + 'booking/?ref=' + encodeURIComponent(ref) + '&t=' + encodeURIComponent(tok);
    return new Promise(function () {});
  }

  /* ================================================================== scheduler */
  var O, state = { kind: 'treatment', service: null, test: null, doctor: 'any', date: null, start: null, method: null };
  api('booking/options').then(function (o) { O = o; init(); }).catch(function () {
    /* No server: on a static preview, fall back to the labelled demo dataset; otherwise keep the WhatsApp/phone fallback. */
    fetch(SITE + 'assets/booking-demo.json').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
      DEMO = j; O = j.options; init();
      root.insertAdjacentHTML('afterbegin', '<p class="demo-note">Preview demo: times are generated from the doctors’ weekly hours and nothing is saved. On the live site this books a real slot, takes the deposit and notifies the clinic.</p>');
    }).catch(function () { /* keep the fallback */ });
  });

  function init() {
    if (q.get('test')) { var t = O.tests.filter(function (x) { return String(x.id) === q.get('test'); })[0]; if (t) { state.kind = 'investigation'; state.test = t; state.service = t.name; } }
    if (q.get('service')) { var s = O.services.filter(function (x) { return x.slug === q.get('service'); })[0]; if (s) state.service = s.name; }
    if (q.get('doctor')) { var dr = O.doctors.filter(function (x) { return x.slug === q.get('doctor'); })[0]; if (dr) state.doctor = dr.slug; }
    root.innerHTML =
      '<div class="sched-grid"><div class="sched-steps">' +
      step(1, 'What do you need?', '<div id="s-what"></div>') +
      step(2, 'Choose your doctor', '<div id="s-doc"></div>') +
      step(3, 'Pick a date and time', '<div id="s-date" class="date-strip" role="listbox" aria-label="Available dates"></div><div id="s-slots" class="slots" aria-live="polite"></div>') +
      step(4, 'Your details', '<form id="s-form" class="form-grid" novalidate>' +
        '<div class="field"><label for="b-name">Full name</label><input id="b-name" name="name" autocomplete="name" required maxlength="80"></div>' +
        '<div class="field"><label for="b-phone">Phone</label><input id="b-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required maxlength="24" placeholder="98XXXXXXXX"></div>' +
        '<div class="field full"><label for="b-email">Email <span>(optional, for a confirmation email)</span></label><input id="b-email" name="email" type="email" autocomplete="email" maxlength="120"></div>' +
        '<div class="field full"><label for="b-notes">Anything we should know? <span>(optional)</span></label><textarea id="b-notes" name="notes" rows="3" maxlength="600" placeholder="For example: pain in a lower back tooth for three days"></textarea></div>' +
        '<div class="hp" aria-hidden="true"><label for="b-web">Leave empty</label><input id="b-web" name="website" tabindex="-1" autocomplete="off"></div></form>') +
      (O.deposit > 0 ? step(5, 'Deposit: ' + npr(O.deposit), '<p class="muted">A deposit holds your time slot and is taken off your bill.</p><div id="s-pay" class="pay-methods" role="radiogroup" aria-label="Payment method"></div>') : '') +
      '<div class="sched-submit"><button class="btn btn-primary" type="button" id="s-book" data-magnet disabled>Confirm booking</button><p class="muted small" id="s-hint">Choose a time to continue.</p><div class="form-status" id="s-status" role="status" aria-live="polite"></div></div>' +
      '</div><aside class="sched-sum panel" aria-label="Your booking"><h3>Your booking</h3><dl id="s-sum"></dl><p class="muted small">Open ' + esc(O.hoursText) + '. Prefer to talk? <a href="' + esc(WA) + '" target="_blank" rel="noopener">WhatsApp</a> or <a href="' + esc(TEL) + '">call</a>.</p></aside></div>';
    renderWhat(); renderDoctors(); loadDates(); renderPay(); summary();
    d.getElementById('s-form').addEventListener('input', summary);
    d.getElementById('s-book').addEventListener('click', submit);
  }
  function step(n, title, inner) { return '<section class="sstep panel" id="step-' + n + '"><h2><span>' + n + '</span>' + esc(title) + '</h2>' + inner + '</section>'; }

  function chip(label, on, attrs) { return '<button type="button" class="pick' + (on ? ' on' : '') + '" aria-pressed="' + (on ? 'true' : 'false') + '" ' + attrs + '>' + esc(label) + '</button>'; }
  function renderWhat() {
    var el = d.getElementById('s-what');
    var h = '<p class="grp">Treatments</p><div class="picks">' + ['General check-up'].concat(O.services.map(function (s) { return s.name; })).map(function (n) {
      return chip(n, state.kind === 'treatment' && state.service === n, 'data-what="t" data-name="' + esc(n) + '"');
    }).join('') + '</div>';
    if (O.tests.length) h += '<p class="grp">Investigations</p><div class="picks">' + O.tests.map(function (t) {
      return chip(t.name, state.kind === 'investigation' && state.test && state.test.id === t.id, 'data-what="i" data-id="' + t.id + '"');
    }).join('') + '</div>' + (state.test && state.test.preparation ? '<p class="note">' + esc('Preparation: ' + state.test.preparation) + '</p>' : '');
    el.innerHTML = h;
    el.querySelectorAll('[data-what]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('data-what') === 't') { state.kind = 'treatment'; state.test = null; state.service = b.getAttribute('data-name'); }
        else { state.kind = 'investigation'; state.test = O.tests.filter(function (t) { return String(t.id) === b.getAttribute('data-id'); })[0]; state.service = state.test.name; state.doctor = 'any'; }
        renderWhat(); renderDoctors(); loadDates(); summary();
      });
    });
  }
  function svcSlug() { var s = O.services.filter(function (x) { return x.name === state.service; })[0]; return s ? s.slug : null; }
  function renderDoctors() {
    var el = d.getElementById('s-doc'), sec = d.getElementById('step-2');
    if (state.kind === 'investigation') { sec.hidden = true; return; }
    sec.hidden = false;
    var slug = svcSlug();
    var list = O.doctors.filter(function (x) { return !slug || !x.specialties.length || x.specialties.indexOf(slug) > -1; });
    if (state.doctor !== 'any' && !list.some(function (x) { return x.slug === state.doctor; })) state.doctor = 'any';
    el.innerHTML = '<div class="doc-picks">' + '<button type="button" class="dpick' + (state.doctor === 'any' ? ' on' : '') + '" data-doc="any" aria-pressed="' + (state.doctor === 'any') + '"><span class="ph mono-ph any">✦</span><b>Any available doctor</b><small>Most free times</small></button>' +
      list.map(function (x) {
        return '<button type="button" class="dpick' + (state.doctor === x.slug ? ' on' : '') + '" data-doc="' + esc(x.slug) + '" aria-pressed="' + (state.doctor === x.slug) + '">' +
          (x.photo ? '<img class="ph" src="' + esc(SITE + 'uploads/' + x.photo) + '" alt="" width="64" height="64">' : '<span class="ph mono-ph">' + esc(initials(x.name)) + '</span>') +
          '<b>' + esc(x.name) + '</b><small>' + esc(x.title || 'Dentist') + '</small></button>';
      }).join('') + '</div>';
    el.querySelectorAll('[data-doc]').forEach(function (b) { b.addEventListener('click', function () { state.doctor = b.getAttribute('data-doc'); renderDoctors(); loadDates(); summary(); }); });
  }
  function docParam() { return state.doctor && state.doctor !== 'any' ? '&doctor=' + encodeURIComponent(state.doctor) : ''; }
  function loadDates() {
    var el = d.getElementById('s-date'), slotsEl = d.getElementById('s-slots');
    state.start = null; summary();
    el.innerHTML = '<p class="muted">Finding free days…</p>'; slotsEl.innerHTML = '';
    api('booking/dates?x=1' + docParam()).then(function (j) {
      if (!j.dates.length) { el.innerHTML = '<p class="muted">No free times in the next few weeks' + (state.doctor !== 'any' ? ' for this doctor. Try “Any available doctor”' : '') + '. You can also <a href="' + esc(WA) + '">message us on WhatsApp</a>.</p>'; return; }
      if (!state.date || j.dates.indexOf(state.date) < 0) state.date = j.dates[0];
      el.innerHTML = j.dates.map(function (iso) {
        return '<button type="button" role="option" class="dchip' + (iso === state.date ? ' on' : '') + '" aria-selected="' + (iso === state.date) + '" data-date="' + iso + '"><small>' + dayName(iso, { weekday: 'short' }) + '</small><b>' + dayName(iso, { day: 'numeric' }) + '</b><small>' + dayName(iso, { month: 'short' }) + '</small></button>';
      }).join('');
      el.querySelectorAll('[data-date]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.date = b.getAttribute('data-date'); state.start = null;
          el.querySelectorAll('[data-date]').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
          loadSlots(); summary();
        });
      });
      loadSlots();
    }).catch(function (e) { el.innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; });
  }
  function loadSlots() {
    var el = d.getElementById('s-slots');
    el.innerHTML = '<p class="muted">Loading times…</p>';
    api('booking/slots?date=' + state.date + docParam()).then(function (j) {
      if (!j.slots.length) { el.innerHTML = '<p class="muted">No free times left on this day.</p>'; return; }
      var groups = [['Morning', 0, 720], ['Afternoon', 720, 1020], ['Evening', 1020, 1440]];
      el.innerHTML = groups.map(function (g) {
        var list = j.slots.filter(function (s) { var m = +s.start.slice(0, 2) * 60 + +s.start.slice(3); return m >= g[1] && m < g[2]; });
        return list.length ? '<p class="grp">' + g[0] + '</p><div class="picks">' + list.map(function (s) { return chip(hm(s.start), s.start === state.start, 'data-slot="' + s.start + '"'); }).join('') + '</div>' : '';
      }).join('');
      el.querySelectorAll('[data-slot]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.start = b.getAttribute('data-slot');
          el.querySelectorAll('[data-slot]').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
          summary();
          var next = d.getElementById('step-4'); if (next && next.getBoundingClientRect().top > innerHeight) next.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }).catch(function (e) { el.innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; });
  }
  function renderPay() {
    var el = d.getElementById('s-pay'); if (!el) return;
    if (!state.method) state.method = O.methods[0];
    el.innerHTML = O.methods.map(function (m) {
      return '<label class="pm' + (state.method === m ? ' on' : '') + '"><input type="radio" name="pm" value="' + m + '"' + (state.method === m ? ' checked' : '') + '><span class="pm-logo pm-' + m + '">' + esc(METHOD[m][0]) + '</span><small>' + esc(METHOD[m][1]) + '</small></label>';
    }).join('');
    el.querySelectorAll('input').forEach(function (i) { i.addEventListener('change', function () { state.method = i.value; renderPay(); summary(); }); });
  }
  function summary() {
    var f = d.getElementById('s-form'), name = f ? f.name.value.trim() : '';
    var doc = state.kind === 'investigation' ? 'Assigned at the clinic' : state.doctor === 'any' ? 'Any available doctor' : (O.doctors.filter(function (x) { return x.slug === state.doctor; })[0] || {}).name;
    d.getElementById('s-sum').innerHTML =
      '<dt>For</dt><dd>' + esc(state.service || 'Choose a treatment') + '</dd>' +
      '<dt>Doctor</dt><dd>' + esc(doc || '') + '</dd>' +
      '<dt>When</dt><dd>' + (state.date && state.start ? esc(dayName(state.date, { weekday: 'short', day: 'numeric', month: 'short' })) + ', ' + hm(state.start) : '<span class="muted">Pick a time</span>') + '</dd>' +
      (name ? '<dt>Patient</dt><dd>' + esc(name) + '</dd>' : '') +
      (O.deposit > 0 ? '<dt>Deposit</dt><dd>' + npr(O.deposit) + (state.method ? ' · ' + esc(METHOD[state.method][0]) : '') + '</dd>' : '');
    var ready = !!(state.service && state.date && state.start);
    var btn = d.getElementById('s-book'); btn.disabled = !ready;
    d.getElementById('s-hint').textContent = ready ? (O.deposit > 0 && (state.method === 'esewa' || state.method === 'khalti') ? 'You will be taken to ' + METHOD[state.method][0] + ' to pay ' + npr(O.deposit) + '. Your time is held for ' + O.holdMinutes + ' minutes.' : 'You will get a booking reference straight away.') : (!state.service ? 'Choose what you need to continue.' : 'Choose a time to continue.');
  }
  function submit() {
    var f = d.getElementById('s-form'), st = d.getElementById('s-status'), btn = d.getElementById('s-book');
    if (!f.reportValidity()) { f.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (f.website.value) return;
    btn.disabled = true; btn.textContent = 'Booking…'; st.className = 'form-status';
    post('bookings', {
      kind: state.kind, service: state.service, testId: state.test ? state.test.id : null,
      doctor: state.kind === 'treatment' && state.doctor !== 'any' ? state.doctor : null,
      date: state.date, start: state.start, name: f.name.value, phone: f.phone.value, email: f.email.value, notes: f.notes.value,
      payMethod: O.deposit > 0 ? state.method : null,
    }).then(function (j) {
      if (j.pay) return go(j.pay, j.booking.ref, j.token);
      history.replaceState(null, '', SITE + 'booking/?ref=' + encodeURIComponent(j.booking.ref) + '&t=' + encodeURIComponent(j.token));
      root.innerHTML = '<div class="booked-head"><span class="tick" aria-hidden="true"></span><h2>' + (j.booking.status === 'confirmed' ? 'You’re booked in!' : 'Request received') + '</h2></div>' + view(j.booking, j);
      root.querySelector('.booked-head').scrollIntoView({ behavior: 'smooth', block: 'start' });
      var c = root.querySelector('[data-cancel]');
      if (c) c.addEventListener('click', function () { if (!confirm('Cancel this appointment?')) return; post('bookings/' + encodeURIComponent(j.booking.ref) + '/cancel', { t: j.token }).then(function () { location.reload(); }); });
    }).catch(function (e) {
      st.className = 'form-status show err'; st.innerHTML = '<b>' + esc(e.message) + '</b>' + (e.status === 409 ? '' : ' You can also <a href="' + esc(WA) + '">book on WhatsApp</a>.');
      btn.disabled = false; btn.textContent = 'Confirm booking';
      if (e.status === 409) loadSlots();
    });
  }
})();
