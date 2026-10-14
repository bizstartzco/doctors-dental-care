/* Doctors Dental Care — chat assistant with WhatsApp handoff.
 *
 * Runs entirely in the browser. It answers only from assets/bot.json (generated from content.js,
 * the same facts the pages show), never diagnoses, never quotes prices it doesn't have, and hands
 * anything else to the clinic's WhatsApp with the question pre-filled. Nothing typed here leaves
 * the page unless the visitor presses a WhatsApp button.
 */
(function () {
  'use strict';
  var d = document, root = d.getElementById('bot');
  if (!root) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var launch = root.querySelector('.bot-launch');
  var hint = root.querySelector('.bot-hint');
  var WA = root.getAttribute('data-wa'), TEL = root.getAttribute('data-tel');
  var SRC = root.getAttribute('data-src');
  var BASE = SRC.slice(0, SRC.indexOf('assets/'));          // '/' or '/doctors-dental-care/'
  var link = function (p) { return BASE + p.replace(/^\//, ''); };
  var KB = null, panel, log, input, chips, state = { flow: null, data: {}, last: '' };
  var store = (function () { try { return window.sessionStorage; } catch (e) { return null; } })();

  /* ---------------------------------------------------------------- helpers */
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var waLink = function (text) { return WA + '?text=' + encodeURIComponent(text); };
  var STOP = ' a an the i me my we our you your is are am was be do does did can could would will should to of in on at for and or it this that with have has had please hi hello hey there any some about want need get just so if what how when where which who why tell know '.split(' ');
  var GENERIC = ' tooth teeth dental dentist dentistry treatment treatments clinic doctor procedure mouth smile oral '.split(' ');
  var stem = function (w) { return w.length > 4 ? w.replace(/(ings?|es|s|ed|e)$/, '') : w; };
  var tokens = function (t) {
    return t.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9ऀ-ॿ ]+/g, ' ').split(/\s+/).filter(Boolean).map(stem);
  };
  var has = function (text, list) { return list.some(function (k) { return (' ' + text + ' ').indexOf(' ' + k) > -1; }); };
  var npt = function () { return new Date(Date.now() + (5 * 60 + 45) * 60000); };
  var toMin = function (s) { var p = s.split(':'); return +p[0] * 60 + +p[1]; };
  var fmt = function (s) { var p = s.split(':'), h = +p[0]; return ((h % 12) || 12) + ':' + p[1] + (h < 12 ? ' AM' : ' PM'); };
  var openNow = function () {
    var n = npt(), m = n.getUTCHours() * 60 + n.getUTCMinutes();
    if (m >= toMin(KB.clinic.open) && m < toMin(KB.clinic.close)) return 'We are <b>open now</b>, until ' + fmt(KB.clinic.close) + ' (Nepal time).';
    return 'We are <b>closed right now</b> and open again ' + (m < toMin(KB.clinic.open) ? 'today' : 'tomorrow') + ' at ' + fmt(KB.clinic.open) + '.';
  };

  /* ---------------------------------------------------------------- knowledge: service keywords */
  var SVC_KEYS = {
    'root-canal-treatment': ['root canal', 'rct', 'canal', 'nerve', 'pulp', 'abscess', 'infected tooth', 'infection'],
    'dental-implants': ['implant', 'screw', 'missing tooth', 'missing teeth', 'replace a tooth', 'replace tooth', 'lost a tooth', 'lost tooth'],
    'crowns-and-bridges': ['crown', 'cap', 'bridge', 'zirconia', 'ceramic', 'porcelain', 'metal ceramic', 'cracked', 'broken tooth', 'chipped'],
    dentures: ['denture', 'false teeth', 'false tooth', 'partial', 'rpd', 'no teeth', 'all my teeth', 'nakkali'],
    'scaling-and-gum-treatment': ['scaling', 'scale', 'cleaning', 'clean my teeth', 'tartar', 'plaque', 'gum', 'bleeding', 'bad breath', 'polish', 'root planing', 'periodont', 'pyorrhea'],
    'tooth-extraction': ['extract', 'extraction', 'pull', 'remove a tooth', 'remove my tooth', 'take out', 'wisdom', 'impacted', 'akkal'],
    orthodontics: ['brace', 'orthodont', 'crooked', 'straighten', 'straight teeth', 'align', 'aligner', 'retainer', 'gap', 'spacing', 'overbite', 'protrud', 'buck teeth', 'crowded'],
    'fillings-and-whitening': ['filling', 'fill', 'cavity', 'cavities', 'hole', 'decay', 'caries', 'kira', 'whiten', 'whitening', 'white', 'yellow', 'stain', 'bleach', 'brighter'],
  };
  var INTENTS = [
    ['emergency', ['swelling in my face', 'face is swollen', 'face swelling', 'swollen face', 'cant breathe', 'can not breathe', 'difficulty breathing', 'trouble breathing', 'hard to breathe', 'cant swallow', 'difficulty swallowing', 'fever', 'wont stop bleeding', 'not stop bleeding', 'bleeding a lot', 'knocked out', 'accident', 'broken jaw', 'jaw is broken', 'emergency', 'urgent', 'severe pain']],
    ['human', ['human', 'real person', 'a person', 'talk to someone', 'speak to someone', 'talk to doctor', 'speak to doctor', 'call me', 'call back', 'agent', 'staff', 'receptionist', 'whatsapp']],
    ['book', ['book', 'appointment', 'schedule', 'reserve', 'slot', 'want to visit', 'can i visit', 'can i come', 'come in', 'see the dentist', 'see a dentist', 'consultation', 'checkup', 'check up', 'check-up', 'milcha', 'aauna']],
    ['price', ['price', 'cost', 'fee', 'charge', 'rate', 'how much', 'expensive', 'cheap', 'afford', 'rs', 'npr', 'rupee', 'kati parcha', 'kati ho', 'paisa', 'budget']],
    ['payment', ['insurance', 'esewa', 'khalti', 'fonepay', 'card', 'cash', 'pay', 'payment', 'installment', 'emi']],
    ['hours', ['open', 'hour', 'timing', 'what time', 'opening time', 'closing time', 'close', 'closing', 'saturday', 'sunday', 'today', 'tomorrow', 'tonight', 'morning', 'evening', 'holiday', 'dashain', 'tihar', 'khulcha', 'baje', 'kahile']],
    ['location', ['where', 'address', 'location', 'locate', 'map', 'direction', 'how to get', 'how do i get', 'find you', 'kapan', 'tenzing', 'parking', 'kaha', 'near']],
    ['tests', ['x-ray', 'xray', 'x ray', 'opg', 'iopa', 'blood test', 'blood sugar', 'cbc', 'hba1c', 'lab', 'investigation', 'scan']],
    ['careers', ['job', 'vacanc', 'career', 'hiring', 'recruit', 'work with you', 'work for you', 'work at', 'cv', 'resume', 'internship', 'apply for']],
    ['gallery', ['photo', 'picture', 'gallery', 'video', 'see the clinic', 'inside the clinic']],
    ['dentist', ['who is the dentist', 'who are the', 'which doctor', 'doctor name', 'doctors', 'dentists', 'dr ', 'navin', 'sah', 'qualification', 'experience', 'specialist', 'surgeon', 'orthodontist', 'female doctor', 'lady doctor']],
    ['kids', ['child', 'children', 'kid', 'baby', 'son', 'daughter', 'toddler', 'school', 'baccha']],
    ['thanks', ['thank', 'thanks', 'dhanyabad', 'dhanyavad', 'great', 'ok thanks', 'bye', 'goodbye']],
    ['greeting', ['hi', 'hello', 'hey', 'namaste', 'namaskar', 'good morning', 'good evening', 'good afternoon']],
  ];
  var QUESTION = /^(does|do|is|are|can|could|will|would|should|how|what|when|why|which|am|after)\b/;
  var SYMPTOM = ['pain', 'ache', 'hurt', 'sore', 'sensitiv', 'throb', 'swell', 'swollen', 'toothache', 'dukh', 'dukhyo', 'kamyo', 'loose', 'wobbly', 'broken', 'chipped', 'cracked', 'bleed'];

  var matchIntent = function (text) {
    for (var i = 0; i < INTENTS.length; i++) if (has(text, INTENTS[i][1])) return INTENTS[i][0];
    return null;
  };
  var matchService = function (text) {
    var best = null, score = 0;
    Object.keys(SVC_KEYS).forEach(function (slug) {
      var s = 0;
      SVC_KEYS[slug].forEach(function (k) { if (has(text, [k])) s += k.indexOf(' ') > -1 ? 3 : 2; });
      if (s > score) { score = s; best = slug; }
    });
    return best && KB.services.filter(function (x) { return x.slug === best; })[0];
  };
  /* FAQ match by distinctive-word overlap; generic words count for little. */
  var faqScore = function (q, cand, ignore) {
    var a = tokens(q).filter(function (w) { return STOP.indexOf(w) < 0 && !(ignore && ignore.indexOf(w) > -1); });
    var b = tokens(cand);
    var s = 0;
    a.forEach(function (w) { if (b.indexOf(w) > -1) s += GENERIC.indexOf(w) > -1 ? .3 : 1; });
    return a.length ? s / Math.max(2, a.length) : 0;
  };
  var bestFaq = function (q, list, ignore) {
    var best = null, top = 0;
    list.forEach(function (f) { var s = faqScore(q, f[0], ignore); if (s > top) { top = s; best = f; } });
    return top >= .5 ? best : null;
  };

  /* ---------------------------------------------------------------- UI */
  var build = function () {
    panel = d.createElement('div');
    panel.className = 'bot-panel'; panel.id = 'bot-panel';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.setAttribute('aria-label', 'Chat with Doctors Dental Care');
    panel.innerHTML =
      '<div class="bot-head"><span class="bot-av" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="#fff" d="M12 4.2C10.4 3 8.6 2.6 7 2.8 4.4 3.1 2.8 5.2 3 8.2c.1 2.2 1.1 3.8 1.6 6 .5 2.4.8 6.8 2.8 6.8 1.6 0 1.8-2.4 2.3-4.4.3-1.2 1.1-2 2.3-2s2 .8 2.3 2c.5 2 .7 4.4 2.3 4.4 2 0 2.3-4.4 2.8-6.8.5-2.2 1.5-3.8 1.6-6 .2-3-1.4-5.1-4-5.4-1.6-.2-3.4.2-5 1.4z"/></svg></span>' +
      '<div><b>Doctors Dental Care</b><small><i class="bot-dot"></i><span class="bot-st">Assistant · replies instantly</span></small></div>' +
      '<a class="bot-wa" href="' + esc(waLink('Hello Doctors Dental Care, I have a question.')) + '" target="_blank" rel="noopener" aria-label="Open WhatsApp chat with the clinic">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.3-.8-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z"/></svg>WhatsApp</a>' +
      '<button class="bot-x" type="button" aria-label="Close chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
      '<div class="bot-log" role="log" aria-live="polite" aria-relevant="additions"></div>' +
      '<div class="bot-chips"></div>' +
      '<form class="bot-form"><label class="sr-only" for="bot-in">Type your question</label><input id="bot-in" autocomplete="off" maxlength="300" placeholder="Ask about hours, treatments, booking…"><button type="submit" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form>' +
      '<p class="bot-foot">Automated answers from this website. Not medical advice. Messages are only sent if you press WhatsApp.</p>';
    root.appendChild(panel);
    log = panel.querySelector('.bot-log'); input = panel.querySelector('#bot-in'); chips = panel.querySelector('.bot-chips');
    panel.querySelector('.bot-x').addEventListener('click', close);
    panel.querySelector('.bot-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value.trim(); if (!v) return;
      input.value = ''; user(v); respond(v);
    });
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); launch.focus(); } });
    var st = panel.querySelector('.bot-st');
    var n = npt(), m = n.getUTCHours() * 60 + n.getUTCMinutes();
    if (m >= toMin(KB.clinic.open) && m < toMin(KB.clinic.close)) { st.textContent = 'Clinic open now · team on WhatsApp'; panel.querySelector('.bot-dot').classList.add('on'); }
    else st.textContent = 'Clinic closed now · opens ' + fmt(KB.clinic.open);
  };

  var scroll = function () { log.scrollTop = log.scrollHeight; };
  var save = function () { if (store) try { store.setItem('ddc-bot', log.innerHTML); } catch (e) { /* storage full or blocked */ } };
  var user = function (text) {
    state.last = text;
    var el = d.createElement('div'); el.className = 'msg me'; el.textContent = text;
    log.appendChild(el); setChips([]); scroll(); save();
  };
  /* bot(html, actions[], chips[]) — html is built only from our own data, escaped where it came from KB */
  var bot = function (html, actions, next) {
    var typing = d.createElement('div'); typing.className = 'msg ai typing'; typing.innerHTML = '<i></i><i></i><i></i>';
    typing.setAttribute('aria-hidden', 'true');
    log.appendChild(typing); scroll();
    setTimeout(function () {
      typing.remove();
      var el = d.createElement('div'); el.className = 'msg ai';
      el.innerHTML = html + (actions && actions.length ? '<div class="msg-acts">' + actions.map(function (a) {
        return '<a class="act ' + (a.cls || '') + '" href="' + esc(a.href) + '"' + (a.ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(a.label) + '</a>';
      }).join('') + '</div>' : '');
      log.appendChild(el); setChips(next || []); scroll(); save();
    }, reduce ? 50 : 420 + Math.min(700, html.length * 2));
  };
  var setChips = function (list) {
    chips.innerHTML = '';
    list.forEach(function (c) {
      var b = d.createElement('button'); b.type = 'button'; b.className = 'chip-q'; b.textContent = c;
      b.addEventListener('click', function () { user(c); respond(c); });
      chips.appendChild(b);
    });
  };
  var MAIN = ['Book a visit', 'Our doctors', 'Opening hours', 'Where are you?', 'Treatments', 'Prices', 'Talk to a person'];
  var waAct = function (text, label) { return { label: label || 'Continue on WhatsApp', href: waLink(text), ext: true, cls: 'wa' }; };
  var askWa = function () { return waAct('Hello Doctors Dental Care, I have a question: ' + state.last); };
  var callAct = { label: 'Call the clinic', href: TEL, cls: 'call' };

  /* ---------------------------------------------------------------- answers */
  var serviceAnswer = function (s, q) {
    var t = ' ' + q.toLowerCase() + ' ';
    var faq = bestFaq(q, s.faqs, tokens(s.name));
    var acts = [{ label: 'Read about ' + s.name.toLowerCase(), href: link(s.url) }, { label: 'Book for this', href: link('/appointment/?service=' + s.slug) }, waAct('Hello Doctors Dental Care, I have a question about ' + s.name.toLowerCase() + ': ' + q)];
    if (faq) return bot('<p><b>' + esc(faq[0]) + '</b></p><p>' + esc(faq[1]) + '</p>', acts, ['Book a visit', 'Prices', 'Talk to a person']);
    if (s.choices && has(t, ['zirconia', 'metal', 'ceramic', 'porcelain', 'option', 'material', 'which is better', 'vs', 'versus', 'difference', 'compare'])) return bot(s.choices.map(function (c) { return '<p><b>' + esc(c[0]) + ':</b> ' + esc(c[1]) + '</p>'; }).join('') + '<p>The dentist will recommend what suits your tooth.</p>', acts, ['Prices', 'Book a visit']);
    if (has(t, ['how many visit', 'how long', 'how many time', 'sessions', 'days'])) return bot('<p><b>' + esc(s.name) + ':</b> ' + esc(s.visits) + '</p>', acts, ['Book a visit', 'What happens after?']);
    if (has(t, ['after', 'aftercare', 'recover', 'heal', 'eat', 'care'])) return bot('<p><b>After ' + esc(s.name.toLowerCase()) + '</b></p><ul>' + s.after.slice(0, 4).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>', acts, ['Book a visit', 'Talk to a person']);
    if (has(t, ['sign', 'symptom', 'need one', 'do i need'])) return bot('<p><b>' + esc(s.name) + ' may be needed if you notice:</b></p><ul>' + s.signs.slice(0, 5).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><p>Only an examination can confirm it.</p>', acts, ['Book a visit']);
    return bot('<p><b>' + esc(s.name) + '</b> — ' + esc(s.lede) + '</p><p><b>Visits:</b> ' + esc(s.visits) + '</p>', acts, ['How many visits?', 'What happens after?', 'Book a visit']);
  };

  var symptomAnswer = function (q) {
    var t = q.toLowerCase(), s = matchService(t);
    var html = '<p>Sorry you are dealing with that. I can’t diagnose, but the dentist can examine it and explain your options.</p>';
    if (has(t, ['hot', 'cold', 'linger', 'night', 'throb'])) s = s || KB.services[0];
    if (has(t, ['loose', 'wobbly', 'bleed'])) s = s || KB.services.filter(function (x) { return x.slug === 'scaling-and-gum-treatment'; })[0];
    if (s) html += '<p>This sometimes relates to <a href="' + esc(link(s.url)) + '">' + esc(s.name.toLowerCase()) + '</a>.</p>';
    html += '<p class="warn">Spreading facial swelling, fever, or trouble swallowing or breathing needs urgent care: call us straight away or go to a hospital emergency department.</p>';
    return bot(html, [{ label: 'Book a visit', href: link('/appointment/' + (s ? '?service=' + s.slug : '')) }, waAct('Hello Doctors Dental Care, I have a dental problem: ' + q), callAct], ['Book a visit', 'Opening hours']);
  };

  var respond = function (q) {
    var t = q.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9ऀ-ॿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (state.flow) return flow(q, t);
    if (q === 'Book a visit' || q === 'Book a check-up') return startBooking();
    if (q === 'Treatments') return bot('<p>We offer full-scope dentistry under one roof. Which treatment are you interested in?</p>', [{ label: 'See all treatments', href: link('/services/') }], KB.services.map(function (s) { return s.name; }));
    if (q === 'Talk to a person') return bot('<p>Our team replies on WhatsApp. Tap below. Your question will be pre-filled.</p>', [waAct('Hello Doctors Dental Care, I would like to talk to someone.'), callAct]);
    var named = KB.services.filter(function (s) { return s.name.toLowerCase() === t; })[0];
    if (named) return serviceAnswer(named, q);

    var intent = matchIntent(t);
    var svc = matchService(t);
    var symptom = has(t, SYMPTOM);

    if (intent === 'emergency') return bot('<p class="warn"><b>This sounds urgent.</b> Facial swelling that is spreading, fever, heavy bleeding that won’t stop, or difficulty swallowing or breathing needs urgent attention.</p><p>Call us now. If you can’t reach us or it is getting worse, go to the nearest hospital emergency department.</p>', [callAct, waAct('URGENT: ' + q, 'Message us on WhatsApp')]);
    if (intent === 'book') return startBooking(svc);
    if (intent === 'price' && has(t, ['how much time', 'how long'])) intent = svc ? null : 'hours';
    if (intent === 'price' && KB.tests.length && has(t, ['x-ray', 'xray', 'x ray', 'opg', 'iopa', 'blood', 'cbc', 'sugar', 'hba1c', 'test'])) intent = 'tests'; // tests have published prices
    if (intent === 'price') return bot('<p>We don’t publish prices online. The cost depends on what the examination finds and the option you choose ' + (svc ? 'for ' + esc(svc.name.toLowerCase()) + ' ' : '') + '(for example, zirconia vs metal-ceramic crowns).</p><p>Our team can give you an idea on WhatsApp, and we explain costs before any treatment starts.</p>', [waAct('Hello Doctors Dental Care, could you tell me the price ' + (svc ? 'for ' + svc.name.toLowerCase() : 'of a treatment') + '? ' + q, 'Ask the price on WhatsApp')], ['Book a check-up', 'Treatments']);
    if (intent === 'payment') {
      var NAMES = { esewa: 'eSewa', khalti: 'Khalti', qr: 'Fonepay / bank QR', clinic: 'cash or card at the clinic' };
      var pm = (KB.payments.methods || []).map(function (m) { return NAMES[m]; });
      return bot('<p>' + (KB.payments.deposit ? 'When you book online, a deposit of <b>Rs. ' + esc(KB.payments.deposit) + '</b> holds your time and is taken off your bill. ' : '') +
        (pm.length ? 'You can pay with ' + esc(pm.join(', ').replace(/, ([^,]*)$/, ' or $1')) + '.' : 'Please check payment options with the team on WhatsApp.') + '</p><p>For anything else, like insurance or instalments, please ask the team.</p>',
        [{ label: 'Book online', href: link('/appointment/') }, askWa()], ['Prices', 'Book a visit']);
    }
    if (intent === 'tests' || (intent === 'price' && has(t, ['x-ray', 'xray', 'x ray', 'opg', 'blood', 'test']))) {
      if (!KB.tests.length) return bot('<p>Your doctor will tell you if you need an X-ray or a test, and where to have it. Please ask the team on WhatsApp for details.</p>', [askWa()]);
      var hit = KB.tests.filter(function (x) { return faqScore(q, x.name) >= .5 || has(t, [x.name.toLowerCase().split(' (')[0]]); });
      var list = (hit.length ? hit : KB.tests).slice(0, 6);
      return bot('<p>' + (hit.length ? '' : 'Investigations available at the clinic:') + '</p><ul>' + list.map(function (x) { return '<li><b>' + esc(x.name) + '</b>' + (x.price ? ' · Rs. ' + esc(x.price) : '') + (hit.length && x.preparation ? '<br><small>' + esc(x.preparation) + '</small>' : '') + '</li>'; }).join('') + '</ul>',
        [{ label: 'See all investigations', href: link('/investigations/') }, { label: 'Book a test', href: link('/appointment/' + (hit.length === 1 ? '?test=' + hit[0].id : '')) }], ['Book a visit', 'Opening hours']);
    }
    if (intent === 'careers') return bot('<p>' + (KB.jobs.length ? 'We are currently hiring for: ' + KB.jobs.map(function (j) { return '<b>' + esc(j.title) + '</b>'; }).join(', ') + '.' : 'We have no advertised openings right now, but you can send your CV and we’ll keep it on file.') + '</p>',
      [{ label: KB.jobs.length ? 'See openings and apply' : 'Send your CV', href: link('/careers/') }], ['Where are you?']);
    if (intent === 'gallery') return bot('<p>' + (KB.hasGallery || KB.hasVideos ? 'Take a look inside the clinic.' : 'Photos of the clinic are coming soon. You are welcome to visit during opening hours.') + '</p>',
      [].concat(KB.hasGallery ? [{ label: 'Photo gallery', href: link('/gallery/') }] : [], KB.hasVideos ? [{ label: 'Videos', href: link('/gallery/videos/') }] : []), ['Where are you?', 'Book a visit']);
    if (intent === 'human') return bot('<p>Of course. Our team replies on WhatsApp, and your question will be pre-filled. You can also call during opening hours.</p>', [askWa(), callAct]);
    if (svc && !(intent === 'hours' || intent === 'location' || intent === 'dentist' || intent === 'tests')) return symptom && !QUESTION.test(t) ? symptomAnswer(q) : serviceAnswer(svc, q);
    if (intent === 'hours') {
      var hol = has(t, ['holiday', 'dashain', 'tihar', 'festival']);
      return bot('<p>We are open <b>' + esc(KB.clinic.hoursText) + '</b>, Saturdays included.</p><p>' + openNow() + '</p>' + (hol ? '<p>Hours can change on public holidays, so please confirm on WhatsApp before you come.</p>' : ''), hol ? [askWa()] : [], ['Book a visit', 'Where are you?']);
    }
    if (intent === 'location') return bot('<p>We are at <b>' + esc(KB.clinic.address) + '</b>.</p><p>If you have trouble finding us, message us and we’ll guide you.</p>', [{ label: 'Get directions', href: KB.clinic.directions, ext: true }, waAct('Hello Doctors Dental Care, could you guide me to the clinic?', 'Ask for directions on WhatsApp')], ['Opening hours', 'Book a visit']);
    if (intent === 'dentist') {
      var docs = KB.doctors.filter(function (x) { return !svc || !x.specialties.length || x.specialties.indexOf(svc.slug) > -1; });
      return bot('<p>We have a panel of doctors under one roof' + (svc ? ', and these doctors provide ' + esc(svc.name.toLowerCase()) : '') + ':</p><ul>' + docs.slice(0, 6).map(function (x) { return '<li><a href="' + esc(link(x.url)) + '">' + esc(x.name) + '</a>' + (x.title ? ' · ' + esc(x.title) : '') + '</li>'; }).join('') + '</ul><p>You can choose your doctor when you book online, or pick “any available doctor”.</p>',
        [{ label: 'Meet our doctors', href: link('/doctors/') }, { label: 'Book online', href: link('/appointment/') }], ['Book a visit', 'Treatments']);
    }
    if (intent === 'kids') return bot('<p>Yes, we offer check-ups and advice for children and adults. For a child’s first visit, tell us their age when you book.</p>', [{ label: 'Book a check-up', href: link('/appointment/') }, askWa()]);
    if (symptom) return symptomAnswer(q);
    var faq = bestFaq(q, KB.faqs.concat([].concat.apply([], KB.services.map(function (s) { return s.faqs; }))));
    if (faq) return bot('<p><b>' + esc(faq[0]) + '</b></p><p>' + esc(faq[1]) + '</p>', [askWa()], MAIN.slice(0, 4));
    if (intent === 'thanks') return bot('<p>You’re welcome! If anything else comes up, we’re here, or message the team on WhatsApp.</p>', [], ['Book a visit']);
    if (intent === 'greeting') return bot('<p>Namaste! 👋 How can we help today?</p>', [], MAIN);
    return bot('<p>I’m not sure I can answer that here, but our team can. Send it to us on WhatsApp. Your question will be pre-filled.</p>', [askWa(), callAct], MAIN.slice(0, 4));
  };

  /* ---------------------------------------------------------------- booking flow → WhatsApp */
  var OPTIONS = function () { return ['General check-up'].concat(KB.services.map(function (s) { return s.name; }), ['Not sure']); };
  var startBooking = function (svc) {
    state.flow = svc ? 'name' : 'service'; state.data = { service: svc ? svc.name : '' };
    if (svc) return bot('<p>Great, let’s request a visit for <b>' + esc(svc.name.toLowerCase()) + '</b>. What’s your name?</p>', [], ['Cancel']);
    bot('<p>Let’s request a visit. What would you like to come in for?</p>', [], OPTIONS().concat(['Cancel']));
  };
  var flow = function (q, t) {
    if (has(t, ['cancel', 'stop', 'nevermind', 'never mind'])) { state.flow = null; return bot('<p>No problem. Anything else I can help with?</p>', [], MAIN); }
    if (state.flow === 'service') { state.data.service = q; state.flow = 'name'; return bot('<p>Got it. What’s your name?</p>', [], ['Cancel']); }
    if (state.flow === 'name') {
      state.data.name = q.slice(0, 60); state.flow = 'when';
      return bot('<p>Thanks, ' + esc(state.data.name.split(' ')[0]) + '. When suits you? We’re open ' + esc(KB.clinic.hoursText) + '.</p>', [], ['Today', 'Tomorrow', 'This week', 'Morning', 'Evening', 'Saturday', 'Cancel']);
    }
    if (state.flow === 'when') {
      state.data.when = q.slice(0, 80); state.flow = null;
      var msg = 'Hello Doctors Dental Care, I would like to book an appointment.\nName: ' + state.data.name + '\nFor: ' + (state.data.service || 'General check-up') + '\nPreferred time: ' + state.data.when;
      var slug = (KB.services.filter(function (s) { return s.name === state.data.service; })[0] || {}).slug;
      return bot('<p>Here’s your request:</p><div class="sum"><span>Name</span><b>' + esc(state.data.name) + '</b><span>For</span><b>' + esc(state.data.service || 'General check-up') + '</b><span>When</span><b>' + esc(state.data.when) + '</b></div><p>Tap below to send it to our team on WhatsApp. They’ll confirm a time with you.</p>',
        [{ label: 'Pick an exact time online', href: link('/appointment/' + (slug ? '?service=' + slug : '')) }, waAct(msg, 'Send request on WhatsApp')], ['Opening hours', 'Where are you?']);
    }
  };

  /* ---------------------------------------------------------------- open / close */
  var opened = false;
  var open = function () {
    root.classList.add('open'); launch.setAttribute('aria-expanded', 'true'); launch.setAttribute('aria-label', 'Close chat');
    if (hint) hint.remove();
    if (store) try { store.setItem('ddc-bot-seen', '1'); } catch (e) { }
    var ready = function () {
      if (!panel) {
        build();
        var prev = store && (function () { try { return store.getItem('ddc-bot'); } catch (e) { return null; } })();
        if (prev) { log.innerHTML = prev; scroll(); setChips(MAIN); }
        else bot('<p>Namaste! 👋 I’m the Doctors Dental Care assistant. I can help with opening hours, directions, treatments and booking, or connect you to our team on WhatsApp.</p>', [], MAIN);
      }
      setTimeout(function () { input.focus({ preventScroll: true }); }, 60);
    };
    if (KB) return ready();
    fetch(SRC).then(function (r) { return r.json(); }).then(function (j) { KB = j; ready(); })
      .catch(function () { location.href = waLink('Hello Doctors Dental Care, I have a question.'); });
    opened = true;
  };
  var close = function () { root.classList.remove('open'); launch.setAttribute('aria-expanded', 'false'); launch.setAttribute('aria-label', 'Chat with us: questions, booking and WhatsApp'); };
  launch.setAttribute('aria-expanded', 'false');
  launch.addEventListener('click', function () { root.classList.contains('open') ? close() : open(); });
  d.addEventListener('click', function (e) { var a = e.target.closest('[data-open-chat]'); if (a) { e.preventDefault(); open(); } });

  /* One gentle hint per session, after a short delay */
  var seen = store && (function () { try { return store.getItem('ddc-bot-seen'); } catch (e) { return null; } })();
  if (hint && !seen) setTimeout(function () { if (!opened) hint.classList.add('show'); }, 5000);
  if (hint) hint.addEventListener('click', open);

  /* test hook: window.__ddcBot.ask('...') resolves with the bot's reply text (used by tools/bot-check.js) */
  window.__ddcBot = {
    open: open,
    ask: function (q) {
      return new Promise(function (res) {
        var n = log ? log.querySelectorAll('.msg.ai:not(.typing)').length : 0;
        state.flow = state.flow; user(q); respond(q);
        var t = setInterval(function () {
          var all = log.querySelectorAll('.msg.ai:not(.typing)');
          if (all.length > n) { clearInterval(t); var last = all[all.length - 1]; res({ text: last.textContent, html: last.innerHTML, flow: state.flow }); }
        }, 40);
      });
    },
    reset: function () { state.flow = null; if (log) log.innerHTML = ''; },
  };
})();
