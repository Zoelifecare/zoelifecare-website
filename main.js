(function () {
  'use strict';

  // Footer year
  document.querySelectorAll('.year').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // Mobile menu
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    var setOpen = function (open) {
      nav.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      toggle.querySelector('.i-open').style.display = open ? 'none' : '';
      toggle.querySelector('.i-close').style.display = open ? '' : 'none';
    };
    toggle.addEventListener('click', function () {
      setOpen(!nav.classList.contains('open'));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  // Contact form
  var form = document.getElementById('contactForm');
  if (!form) return;
  var status = document.getElementById('formStatus');
  var button = form.querySelector('button[type="submit"]');
  var EMAIL = 'immamutesi@gmail.com';
  var PHONE_HREF = 'tel:+15208584908';
  var PHONE_TEXT = '(520) 858-4908';
  var startedAt = Date.now();
  var sending = false;
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function setError(field, msg) {
    var id = field.id + '-error';
    var existing = document.getElementById(id);
    if (msg) {
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', id);
      if (!existing) {
        existing = document.createElement('span');
        existing.id = id;
        existing.className = 'field-error';
        field.insertAdjacentElement('afterend', existing);
      }
      existing.textContent = msg;
    } else {
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-describedby');
      if (existing) existing.remove();
    }
  }

  function validate() {
    var firstBad = null;
    var name = form.elements.name;
    var email = form.elements.email;
    var phone = form.elements.phone;
    var message = form.elements.message;

    var checks = [
      [name, name.value.trim() ? '' : 'Please enter your name.'],
      [email, !email.value.trim() ? 'Please enter your email address.'
        : (emailRe.test(email.value.trim()) ? '' : 'Please enter a valid email address, like name@example.com.')],
      [phone, !phone.value.trim() || /^[0-9+().\-\s]{7,30}$/.test(phone.value.trim()) ? '' : 'Please enter a valid phone number, or leave it blank.'],
      [message, message.value.trim() ? '' : 'Please tell us a little about how we can help.']
    ];
    checks.forEach(function (c) {
      setError(c[0], c[1]);
      if (c[1] && !firstBad) firstBad = c[0];
    });
    if (firstBad) firstBad.focus();
    return !firstBad;
  }

  ['name', 'email', 'phone', 'message'].forEach(function (n) {
    form.elements[n].addEventListener('input', function () {
      if (this.getAttribute('aria-invalid') === 'true') setError(this, '');
    });
  });

  function data() {
    var fd = new FormData(form);
    return {
      name: (fd.get('name') || '').trim(),
      email: (fd.get('email') || '').trim(),
      phone: (fd.get('phone') || '').trim(),
      contactMethod: fd.get('contactMethod') || 'Either',
      service: fd.get('service') || '',
      message: (fd.get('message') || '').trim(),
      website: fd.get('website') || '',
      elapsedMs: Date.now() - startedAt
    };
  }

  function mailtoLink(d) {
    var body = 'Name: ' + d.name + '\nEmail: ' + d.email + '\nPhone: ' + (d.phone || '-') +
      '\nPreferred contact method: ' + d.contactMethod + '\nCare needed: ' + d.service +
      '\n\n' + d.message;
    return 'mailto:' + EMAIL + '?subject=' + encodeURIComponent('Care inquiry from ' + d.name) +
      '&body=' + encodeURIComponent(body);
  }

  function showStatus(kind, html) {
    status.className = 'form-status show ' + kind;
    status.innerHTML = html;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;
    status.className = 'form-status';
    if (!validate()) return;

    var d = data();
    sending = true;
    button.disabled = true;
    button.textContent = 'Sending…';

    var controller = 'AbortController' in window ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 15000) : null;

    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        return { ok: res.ok && j.ok === true, error: j.error };
      });
    }).catch(function () {
      return { ok: false };
    }).then(function (r) {
      if (timer) clearTimeout(timer);
      if (r.ok) {
        showStatus('ok', '<strong>Thank you! Your request was sent.</strong> Our team will contact you soon. If your need is urgent, please call <a href="' + PHONE_HREF + '">' + PHONE_TEXT + '</a>.');
        form.reset();
        startedAt = Date.now();
        button.textContent = 'Request Sent';
        // Keep the button disabled for a short time to prevent duplicate submissions.
        setTimeout(function () { button.disabled = false; button.textContent = 'Send Request'; sending = false; }, 8000);
        return;
      }
      var msg = r.error && typeof r.error === 'string' && r.error.length < 200 ? r.error + ' ' : '';
      showStatus('err',
        '<strong>Sorry, your message could not be sent online.</strong> ' + msg.replace(/[<>&]/g, '') +
        'Nothing was delivered. Please email or call us instead. Your details are already filled in below.' +
        '<br><a class="btn" href="' + mailtoLink(d).replace(/"/g, '&quot;') + '">Email Us Instead</a>' +
        '<a class="btn light" style="box-shadow:inset 0 0 0 2px var(--green)" href="' + PHONE_HREF + '">Call ' + PHONE_TEXT + '</a>');
      button.disabled = false;
      button.textContent = 'Send Request';
      sending = false;
    });
  });
})();
