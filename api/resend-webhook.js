export const config = { runtime: 'edge' };
import { kvIncr, kvSetNX } from './_lib/auth.js';

// Resend delivery webhooks (Svix-signed). Aggregates email deliverability
// counters so the admin console can show open / click rates.
// Setup: Resend → Webhooks → add https://emploia.fr/api/resend-webhook,
// subscribe to email.* events, copy the signing secret into
// RESEND_WEBHOOK_SECRET (whsec_...).

const SECRET = process.env.RESEND_WEBHOOK_SECRET;

// Resend event type → our counter suffix.
const EVENT_MAP = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
};

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Verify a Svix signature (the scheme Resend uses).
async function verify(payload, headers, secret) {
  const id = headers.get('svix-id');
  const ts = headers.get('svix-timestamp');
  const sigHeader = headers.get('svix-signature');
  if (!id || !ts || !sigHeader) return false;
  // Reject stale deliveries (replay protection): 5 min tolerance.
  if (Math.abs(Date.now() / 1000 - parseInt(ts, 10)) > 300) return false;

  const key = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const cryptoKey = await crypto.subtle.importKey(
    'raw', base64ToBytes(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signed = `${id}.${ts}.${payload}`;
  const mac = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(signed));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  // Header holds space-separated "v1,<sig>" entries; any match is valid.
  return sigHeader.split(' ').some((part) => {
    const sig = part.includes(',') ? part.split(',')[1] : part;
    return sig && timingSafeEqual(sig, expected);
  });
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  if (!SECRET) return new Response('Webhook secret not configured', { status: 500 });

  const body = await req.text();
  const ok = await verify(body, req.headers, SECRET);
  if (!ok) return new Response('Invalid signature', { status: 400 });

  let event;
  try { event = JSON.parse(body); } catch { return new Response('Invalid JSON', { status: 400 }); }

  // Idempotency — Svix retries on non-2xx.
  const svixId = req.headers.get('svix-id');
  if (svixId) {
    const fresh = await kvSetNX(`resend_wh:${svixId}`, '1', 86400);
    if (!fresh) return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const suffix = EVENT_MAP[event.type];
  if (suffix) {
    try { await kvIncr(`track:email_${suffix}`); } catch (e) { /* best effort */ }
  }
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
