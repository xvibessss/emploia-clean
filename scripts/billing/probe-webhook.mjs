// Ad-hoc probe: run the real stripe-webhook handler against an in-memory KV and
// a signed payload. Proves the three Pack Campagne traps by observed behaviour:
//   1. replaying the same event grants no extra days
//   2. an existing proUntil is prolonged, not overwritten
//   3. no Stripe subscription / paid plan is written for a one-off payment
const SECRET = 'whsec_stub';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.KV_REST_API_URL = 'http://kv.stub';
process.env.KV_REST_API_TOKEN = 'stub';
delete process.env.RESEND_API_KEY; // keep the probe offline

// ── In-memory Upstash stub ──────────────────────────────────────────────────
const store = new Map();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('http://kv.stub')) {
    const cmd = JSON.parse(opts.body);
    const [op, key, val, ...rest] = cmd;
    switch (String(op).toUpperCase()) {
      case 'GET': {
        const v = store.get(key);
        return new Response(JSON.stringify({ result: v === undefined ? null : v }), { status: 200 });
      }
      case 'SET': {
        // kvSetNX uses SET ... NX; detect it from the trailing args.
        const isNX = rest.map(String).map(s => s.toUpperCase()).includes('NX');
        if (isNX && store.has(key)) return new Response(JSON.stringify({ result: null }), { status: 200 });
        store.set(key, val);
        return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
      }
      default:
        return new Response(JSON.stringify({ result: null }), { status: 200 });
    }
  }
  if (u.includes('/api/track')) return new Response('{}', { status: 200 });
  return new Response('{}', { status: 200 });
};

const { default: handler } = await import('../../api/stripe-webhook.js');

async function sign(payload) {
  const ts = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${payload}`));
  const hex = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `t=${ts},v1=${hex}`;
}

async function send(event) {
  const payload = JSON.stringify(event);
  return handler(new Request('https://emploia.fr/api/stripe-webhook', {
    method: 'POST',
    headers: { 'stripe-signature': await sign(payload) },
    body: payload,
  }));
}

const EMAIL = 'buyer@example.com';
const DAY = 86400000;
const campagneEvent = id => ({
  id,
  type: 'checkout.session.completed',
  data: { object: { mode: 'payment', customer: 'cus_stub', customer_email: EMAIL, metadata: { plan: 'campagne' } } },
});
const setUser = u => store.set(`user:${EMAIL}`, JSON.stringify(u));
const getUser = () => JSON.parse(store.get(`user:${EMAIL}`));
const days = iso => (new Date(iso).getTime() - Date.now()) / DAY;

let fail = 0;
const check = (cond, label, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) fail++;
};

console.log('\n[A] Achat sur un compte gratuit sans proUntil');
store.clear();
setUser({ email: EMAIL, name: 'Alice Test', plan: 'free' });
await send(campagneEvent('evt_1'));
let u = getUser();
check(Math.abs(days(u.proUntil) - 90) < 0.1, 'proUntil ≈ +90 jours', `${days(u.proUntil).toFixed(2)} j`);
check(u.plan === 'free', "plan reste 'free' (sinon getCurrentUser ignore le grant)", `plan=${u.plan}`);
check(u.subscriptionId === undefined, 'aucun subscriptionId écrit', `subscriptionId=${String(u.subscriptionId)}`);
check(!!u.campagnePurchasedAt, 'campagnePurchasedAt horodaté');

console.log('\n[B] PIÈGE 1 — rejeu du même événement');
const before = getUser().proUntil;
const res = await send(campagneEvent('evt_1'));
const body = await res.json();
u = getUser();
check(u.proUntil === before, 'le rejeu n\'accorde AUCUN jour de plus', `${days(u.proUntil).toFixed(2)} j inchangé`);
check(body.duplicate === true, 'la réponse signale duplicate:true', JSON.stringify(body));

console.log('\n[C] PIÈGE 2 — achat sur un proUntil déjà actif (parrainage 30 j)');
store.clear();
const existing = new Date(Date.now() + 30 * DAY).toISOString();
setUser({ email: EMAIL, name: 'Bob Test', plan: 'free', proUntil: existing });
await send(campagneEvent('evt_2'));
u = getUser();
check(Math.abs(days(u.proUntil) - 120) < 0.1, 'proUntil PROLONGÉ à 30+90 = 120 j', `${days(u.proUntil).toFixed(2)} j`);
check(new Date(u.proUntil) > new Date(existing), 'le proUntil existant n\'est pas écrasé');

console.log('\n[D] PIÈGE 2 bis — proUntil expiré');
store.clear();
setUser({ email: EMAIL, plan: 'free', proUntil: new Date(Date.now() - 200 * DAY).toISOString() });
await send(campagneEvent('evt_3'));
u = getUser();
check(Math.abs(days(u.proUntil) - 90) < 0.1, 'un grant expiré repart de 90 j pleins', `${days(u.proUntil).toFixed(2)} j`);

console.log('\n[E] PIÈGE 3 — un abonnement ne doit pas coexister');
store.clear();
setUser({ email: EMAIL, plan: 'free' });
await send(campagneEvent('evt_4'));
u = getUser();
const subFields = ['subscriptionId', 'subscriptionStatus', 'cancelAtPeriodEnd'].filter(k => u[k] !== undefined);
check(subFields.length === 0, 'aucun champ d\'abonnement écrit', subFields.length ? `présents: ${subFields}` : 'aucun');
check(store.get(`stripe:cus_stub`) === JSON.stringify(EMAIL), 'mapping stripe:{customer} → email posé (portail/remboursement)');

console.log('\n[F] Non-régression — un abonnement Pro reste un abonnement');
store.clear();
setUser({ email: EMAIL, plan: 'free' });
await send({ id: 'evt_5', type: 'checkout.session.completed',
  data: { object: { mode: 'subscription', customer: 'cus_sub', subscription: 'sub_123', customer_email: EMAIL, metadata: { plan: 'pro' } } } });
u = getUser();
check(u.plan === 'pro', "plan devient 'pro'", `plan=${u.plan}`);
check(u.subscriptionId === 'sub_123', 'subscriptionId conservé pour un abonnement');
check(u.proUntil === undefined, 'aucun grant proUntil parasite sur un abonnement');

globalThis.fetch = realFetch;
console.log(fail === 0 ? '\n✅ sonde webhook : les trois pièges sont désarmés\n' : `\n❌ ${fail} écart(s)\n`);
process.exit(fail === 0 ? 0 : 1);
