/* Lab test / dental X-ray booking (no doctor, no consultation). Posts to /api/requests; on a static preview with no
   server it shows a labelled demo confirmation, and otherwise falls back to WhatsApp. */
(function () {
  'use strict';
  var d = document;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var hm = function (s) { var p = s.split(':'), h = +p[0]; return ((h % 12) || 12) + ':' + p[1] + (h < 12 ? ' AM' : ' PM'); };
  d.querySelectorAll('form[data-request]').forEach(function (form) {
    var kind = form.getAttribute('data-request'), api = form.getAttribute('data-api'), wa = form.getAttribute('data-wa');
    var site = api.replace(/api\/requests$/, '');
    var status = form.querySelector('.form-status'), btn = form.querySelector('button[type="submit"]');
    var npt = new Date(Date.now() + (5 * 60 + 45) * 60000), today = npt.toISOString().slice(0, 10);
    var date = form.querySelector('[name="date"]'), time = form.querySelector('[name="start"]');
    date.min = today; date.max = new Date(Date.parse(today) + 30 * 864e5).toISOString().slice(0, 10);
    if (!date.value) date.value = today;
    var fillTimes = function () {
      var keep = time.value, nowMin = npt.getUTCHours() * 60 + npt.getUTCMinutes(), opts = [];
      for (var t = 7 * 60 + 30; t <= 19 * 60; t += 15) {
        if (date.value === today && t < nowMin + 30) continue;
        var v = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
        opts.push('<option value="' + v + '"' + (v === keep ? ' selected' : '') + '>' + hm(v) + '</option>');
      }
      time.innerHTML = opts.length ? opts.join('') : '<option value="">No times left today: choose another date</option>';
    };
    fillTimes(); date.addEventListener('change', fillTimes);
    var show = function (kindCls, html) { status.className = 'form-status show ' + kindCls; status.innerHTML = html; status.setAttribute('tabindex', '-1'); status.focus(); };

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var data = new FormData(form), body = { kind: kind };
      data.forEach(function (v, k) { body[k] = v; });
      btn.disabled = true;
      var label = btn.textContent; btn.textContent = 'Sending…';
      var waText = ['Hello Doctors Dental Care, I would like to book ' + (kind === 'xray' ? 'a dental X-ray' : 'a lab test') + '.', 'Name: ' + body.name, 'Phone: ' + body.phone, (body.tests ? (kind === 'xray' ? 'X-ray: ' : 'Tests: ') + body.tests : ''), 'When: ' + body.date + ' ' + body.start].filter(Boolean).join('\n');
      fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var er = new Error(j.error || 'Could not send'); er.server = r.status < 500 && r.status !== 404 && r.status !== 405; throw er; } return j; }); })
        .then(function (j) {
          var b = j.booking, link = site + 'booking/?ref=' + encodeURIComponent(b.ref) + '&t=' + encodeURIComponent(j.token);
          show('ok', '<b>Request received: ' + esc(b.ref) + '</b>' + esc(b.date) + ' at ' + hm(b.start) + '. We will call or WhatsApp you to confirm. <a href="' + esc(link) + '">View or cancel your request</a>.');
          form.reset(); date.value = today; fillTimes();
        })
        .catch(function (er) {
          if (er.server) { show('err', '<b>' + esc(er.message) + '</b>'); return; }
          if (/github\.io$/.test(location.hostname)) { show('ok', '<b>Preview demo: request not saved.</b>On the live site this books the ' + (kind === 'xray' ? 'X-ray' : 'lab test') + ' and notifies the clinic.'); return; }
          show('err', '<b>Sorry, this could not be sent right now.</b> <a href="' + wa + '?text=' + encodeURIComponent(waText) + '" target="_blank" rel="noopener">Send it on WhatsApp instead</a>, or call us.');
        })
        .then(function () { btn.disabled = false; btn.textContent = label; });
    });
  });
})();
