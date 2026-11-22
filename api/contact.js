// Vercel serverless function: POST /api/contact
// Sends the contact-form inquiry by email using Resend (https://resend.com).
//
// Required environment variables (set in Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY      Resend API key (keep secret — never put it in frontend code)
//   CONTACT_TO_EMAIL    Inbox that receives inquiries (e.g. the business email)
//   CONTACT_FROM_EMAIL  Sender address on a domain verified in Resend,
//                       e.g. "Zoe Life Services Website <website@yourdomain.com>"
//
// If these are missing, the function returns 503 and the page tells the visitor
// the message was NOT sent and offers email/phone instead.

const MAX = { name: 100, email: 150, phone: 30, contactMethod: 20, service: 60, message: 2000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function clean(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 20000) throw new Error('too large');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  let raw;
  try {
    raw = await readBody(req);
  } catch {
    return send(res, 400, { ok: false, error: 'Invalid request.' });
  }

  // Spam protection: hidden honeypot field and minimum time on page.
  // Bots get a generic success so they don't retry; nothing is sent.
  if (clean(raw.website, 200) || (typeof raw.elapsedMs === 'number' && raw.elapsedMs < 2500)) {
    return send(res, 200, { ok: true });
  }

  const d = {};
  for (const k of Object.keys(MAX)) d[k] = clean(raw[k], MAX[k]);

  if (!d.name || !d.email || !d.message) {
    return send(res, 400, { ok: false, error: 'Please fill in your name, email and message.' });
  }
  if (!EMAIL_RE.test(d.email)) {
    return send(res, 400, { ok: false, error: 'Please enter a valid email address.' });
  }

  const key = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL;
  const from = process.env.CONTACT_FROM_EMAIL;
  if (!key || !to || !from) {
    console.error('Contact form is not configured: set RESEND_API_KEY, CONTACT_TO_EMAIL and CONTACT_FROM_EMAIL.');
    return send(res, 503, { ok: false, error: 'Online messaging is not available right now.' });
  }

  const rows = [
    ['Name', d.name],
    ['Email', d.email],
    ['Phone', d.phone || '—'],
    ['Preferred contact', d.contactMethod || '—'],
    ['Care needed', d.service || '—'],
  ];
  const html =
    '<h2 style="color:#642076;font-family:Arial,sans-serif">New care inquiry from the website</h2>' +
    '<table style="font-family:Arial,sans-serif;border-collapse:collapse">' +
    rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;font-weight:bold">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('') +
    '</table>' +
    `<p style="font-family:Arial,sans-serif;white-space:pre-wrap;border-top:1px solid #ddd;padding-top:12px">${esc(d.message)}</p>`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n') + '\n\n' + d.message;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: to.split(',').map((s) => s.trim()).filter(Boolean),
        reply_to: d.email,
        subject: `Care inquiry from ${d.name.replace(/[\r\n]+/g, ' ')}`,
        html,
        text,
      }),
    });
    if (!r.ok) {
      console.error('Resend error', r.status, await r.text().catch(() => ''));
      return send(res, 502, { ok: false, error: 'We could not deliver your message.' });
    }
    return send(res, 200, { ok: true });
  } catch (err) {
    console.error('Contact send failed', err);
    return send(res, 502, { ok: false, error: 'We could not deliver your message.' });
  }
};
