/* Contact, feedback and careers forms: send to the clinic server in the background (with a captcha where the form asks
   for one); fall back to WhatsApp if the server can't be reached. */
(function () {
  'use strict';
  document.querySelectorAll('form.api-form').forEach(function (form) {
    var status = form.querySelector('.form-status'), btn = form.querySelector('button[type="submit"]'), label = btn.textContent;
    var capUrl = form.getAttribute('data-captcha'), capQ = form.querySelector('[data-cap-q]'), capTok = form.querySelector('[name="captcha_token"]'), capIn = form.querySelector('[name="captcha"]');
    var show = function (kind, html) { status.className = 'form-status show ' + kind; status.innerHTML = html; status.setAttribute('tabindex', '-1'); status.focus(); };

    /* Captcha: the server signs the question. On a static preview with no server, a local question is shown instead. */
    var offline = false;
    var newCaptcha = function () {
      if (!capUrl) return;
      capQ.textContent = 'loading…'; if (capIn) capIn.value = '';
      fetch(capUrl, { headers: { Accept: 'application/json' } }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (j) { capQ.textContent = j.question; capTok.value = j.token; })
        .catch(function () { offline = true; var a = 2 + Math.floor(Math.random() * 8), b = 2 + Math.floor(Math.random() * 8); capQ.textContent = 'What is ' + a + ' + ' + b + '?'; capTok.value = 'local:' + (a + b); });
    };
    newCaptcha();
    var nb = form.querySelector('[data-cap-new]'); if (nb) nb.addEventListener('click', newCaptcha);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      if (offline && capTok && capTok.value.indexOf('local:') === 0 && capIn.value.trim() !== capTok.value.slice(6)) { show('err', '<b>That answer is not right.</b> Please try the security question again.'); newCaptcha(); return; }
      var cv = form.querySelector('input[type="file"]');
      if (cv && cv.files[0] && cv.files[0].size > 5 * 1024 * 1024) { show('err', '<b>That file is larger than 5 MB.</b> Please send a smaller PDF or Word file.'); return; }
      btn.disabled = true; btn.textContent = 'Sending…';
      fetch(form.getAttribute('data-api'), { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var err = new Error(j.error || 'Could not send'); err.captcha = j.captcha; err.server = true; throw err; } return j; }); })
        .then(function (j) { show('ok', '<b>Thank you, it has been sent.</b>' + (j.message || ' We will get back to you soon.')); form.reset(); newCaptcha(); })
        .catch(function (err) {
          if (err.server) { show('err', '<b>' + String(err.message).replace(/</g, '&lt;') + '</b>'); newCaptcha(); return; }
          var data = new FormData(form), text = ['Hello Doctors Dental Care,'];
          ['subject', 'body', 'message', 'name', 'phone', 'address', 'email'].forEach(function (k) { var v = data.get(k); if (v && typeof v === 'string') text.push(v); });
          show('err', '<b>Sorry, this could not be sent right now.</b> Your text is still in the form. You can <a href="' + form.getAttribute('data-wa') + '?text=' + encodeURIComponent(text.join('\n')) + '" target="_blank" rel="noopener">send it on WhatsApp instead</a>.');
        })
        .then(function () { btn.disabled = false; btn.textContent = label; });
    });
  });
})();
