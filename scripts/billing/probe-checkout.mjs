// Ad-hoc probe: run the real stripe-checkout handler against a stubbed Stripe
// endpoint and inspect the exact form body it would POST. Proves mode= and the
// presence/absence of trial_period_days on the wire, not just in source.
process.env.STRIPE_SECRET_KEY = 'sk_test_stub';
process.env.STRIPE_PRICE_PRO = 'price_stub_pro';
process.env.STRIPE_PRICE_INTENSIF = 'price_stub_intensif';
process.env.STRIPE_PRICE_CAMPAGNE = 'price_stub_campagne';
process.env.KV_REST_API_URL = 'http://127.0.0.1:9/stub';
process.env.KV_REST_API_TOKEN = 'stub';

const captured = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('api.stripe.com')) {
    captured.push(Object.fromEntries(new URLSearchParams(opts.body)));
    return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/stub' }), { status: 200 });
  }
  // Upstash rate-limit calls: allow them through as "no prior hits".
  return new Response(JSON.stringify({ result: 1 }), { status: 200 });
};

const { default: handler } = await import('../../api/stripe-checkout.js');

const call = plan => handler(new Request('https://emploia.fr/api/stripe-checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', origin: 'https://emploia.fr', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250) + 1}` },
  body: JSON.stringify({ plan, email: 'probe@example.com' }),
}));

let fail = 0;
for (const plan of ['pro', 'intensif', 'campagne']) {
  captured.length = 0;
  const res = await call(plan);
  const body = await res.json();
  const sent = captured[0];
  if (!sent) { console.log(`  ✗ ${plan}: aucun appel Stripe (status ${res.status}, ${JSON.stringify(body)})`); fail++; continue; }
  const trial = sent['subscription_data[trial_period_days]'];
  const expectedMode = plan === 'campagne' ? 'payment' : 'subscription';
  const expectTrial = plan !== 'campagne';
  const modeOk = sent.mode === expectedMode;
  const trialOk = expectTrial ? trial === '7' : trial === undefined;
  console.log(`  ${modeOk && trialOk ? '✓' : '✗'} ${plan.padEnd(9)} mode=${sent.mode.padEnd(13)} price=${sent['line_items[0][price]'].padEnd(22)} trial_period_days=${trial === undefined ? 'ABSENT' : trial}`);
  if (!modeOk) { console.log(`      ✗ mode attendu ${expectedMode}`); fail++; }
  if (!trialOk) { console.log(`      ✗ trial attendu ${expectTrial ? '7' : 'ABSENT'}`); fail++; }
}

// A retired annual plan key must be rejected outright.
captured.length = 0;
const res = await call('pro_annual');
console.log(`  ${res.status === 400 && captured.length === 0 ? '✓' : '✗'} pro_annual → rejeté (status ${res.status}, appels Stripe: ${captured.length})`);
if (res.status !== 400) fail++;

globalThis.fetch = realFetch;
console.log(fail === 0 ? '\n✅ sonde checkout : conforme\n' : `\n❌ ${fail} écart(s)\n`);
process.exit(fail === 0 ? 0 : 1);
