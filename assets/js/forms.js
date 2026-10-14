/* Contact + careers forms: send to the clinic server in the background; fall back to WhatsApp if it can't be reached. */
(function () {
  'use strict';
  document.querySelectorAll('form.api-form').forEach(function (form) {
    var status = form.querySelector('.form-status'), btn = form.querySelector('button[type="submit"]'), label = btn.textContent;
    var show = function (kind, html) { status.className = 'form-status show ' + kind; status.innerHTML = html; status.setAttribute('tabindex', '-1'); status.focus(); };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var cv = form.querySelector('input[type="file"]');
      if (cv && cv.files[0] && cv.files[0].size > 5 * 1024 * 1024) { show('err', '<b>That file is larger than 5 MB.</b> Please send a smaller PDF or Word file.'); return; }
      btn.disabled = true; btn.textContent = 'Sending…';
      fetch(form.getAttribute('data-api'), { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Could not send'); return j; }); })
        .then(function (j) { show('ok', '<b>Thank you, it has been sent.</b>' + (j.message || 'We will get back to you soon.')); form.reset(); })
        .catch(function (err) {
          var data = new FormData(form), text = ['Hello Doctors Dental Care,'];
          ['subject', 'body', 'message', 'name', 'phone'].forEach(function (k) { var v = data.get(k); if (v && typeof v === 'string') text.push(v); });
          show('err', '<b>' + (err.message && err.message !== 'Failed to fetch' && err.message !== 'Could not send' ? err.message.replace(/</g, '&lt;') : 'Sorry, this could not be sent right now.') + '</b> Your text is still in the form. You can <a href="' + form.getAttribute('data-wa') + '?text=' + encodeURIComponent(text.join('\n')) + '" target="_blank" rel="noopener">send it on WhatsApp instead</a>.');
        })
        .then(function () { btn.disabled = false; btn.textContent = label; });
    });
  });
})();
