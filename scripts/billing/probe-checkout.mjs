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
const lookups = [];
// Le code promo tel qu'il existe RÉELLEMENT chez Stripe : créé en casse mixte
// depuis le dashboard, comme cela s'est produit le 2026-10-01.
const STORED_CODE = 'testAA';
const STORED_ID = 'promo_stub_id';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('api.stripe.com/v1/promotion_codes')) {
    const asked = new URL(u).searchParams.get('code');
    lookups.push(asked === null ? '(listing)' : asked);
    // Stripe filtre sur la chaîne exacte : seule la casse stockée répond au
    // filtre. Sans filtre, il renvoie la liste, casse d'origine comprise.
    const data = asked === null
      ? [{ id: STORED_ID, code: STORED_CODE }, { id: 'promo_autre', code: 'AUTRE20' }]
      : (asked === STORED_CODE ? [{ id: STORED_ID, code: STORED_CODE }] : []);
    return new Response(JSON.stringify({ data }), { status: 200 });
  }
  if (u.includes('api.stripe.com')) {
    captured.push(Object.fromEntries(new URLSearchParams(opts.body)));
    return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/stub' }), { status: 200 });
  }
  // Upstash rate-limit calls: allow them through as "no prior hits".
  return new Response(JSON.stringify({ result: 1 }), { status: 200 });
};

const { default: handler } = await import('../../api/stripe-checkout.js');

const call = (plan, code) => handler(new Request('https://emploia.eu/api/stripe-checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', origin: 'https://emploia.eu', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250) + 1}` },
  body: JSON.stringify(code ? { plan, code, consent: true, email: 'probe@example.com' } : { plan, consent: true, email: 'probe@example.com' }),
}));

let fail = 0;
for (const plan of ['pro', 'campagne']) {
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

// ── Codes créateurs ───────────────────────────────────────────────────────
// Le code arrive d'une légende de vidéo, retapé par un spectateur : sa casse
// n'est pas garantie. L'attribution, elle, doit rester unique.
console.log('\n  Codes créateurs');
for (const typed of [STORED_CODE, STORED_CODE.toUpperCase(), STORED_CODE.toLowerCase()]) {
  captured.length = 0; lookups.length = 0;
  await call('campagne', typed);
  const sent = captured[0] || {};
  const discounted = sent['discounts[0][promotion_code]'] === STORED_ID;
  const attributed = sent['metadata[affiliate]'] === STORED_CODE.toUpperCase();
  const noPromoField = sent.allow_promotion_codes === undefined;
  const okAll = discounted && attributed && noPromoField;
  console.log(`  ${okAll ? '✓' : '✗'} saisi « ${typed.padEnd(7)} » → remise appliquée, attribué à ${sent['metadata[affiliate]'] || 'PERSONNE'} (${lookups.length} recherche${lookups.length > 1 ? 's' : ''})`);
  if (!discounted) { console.log('      ✗ la remise n\'a pas été appliquée'); fail++; }
  if (!attributed) { console.log(`      ✗ attribution attendue ${STORED_CODE.toUpperCase()}`); fail++; }
  if (!noPromoField) { console.log('      ✗ allow_promotion_codes ne doit pas coexister avec discounts'); fail++; }
}

// Un code inconnu ne doit pas faire échouer la vente : on retombe sur le champ
// promo de Stripe, et aucune commission n'est attribuée.
captured.length = 0;
await call('campagne', 'INCONNU99');
const unknown = captured[0] || {};
const degrades = unknown.allow_promotion_codes === 'true' && unknown['metadata[affiliate]'] === undefined;
console.log(`  ${degrades ? '✓' : '✗'} code inconnu → vente maintenue, aucune attribution`);
if (!degrades) fail++;

// Un code sur l'abonnement ne doit rien déclencher : la commission est
// réservée au Pack, sinon il faudrait la reprendre sur les résiliations.
captured.length = 0;
await call('pro', STORED_CODE);
const onPro = captured[0] || {};
const ignored = onPro['discounts[0][promotion_code]'] === undefined
  && onPro['metadata[affiliate]'] === undefined
  && onPro.allow_promotion_codes === undefined;
console.log(`  ${ignored ? '✓' : '✗'} code sur « pro » → ignoré, aucune remise ni attribution`);
if (!ignored) fail++;

// ── Consentement à l'exécution immédiate ──────────────────────────────────
// Les CGV promettent qu'une commande n'est pas passée sans consentement. La
// page peut être contournée ; le serveur, non. On vérifie qu'aucun appel
// Stripe ne part, pas seulement que le statut est 400.
console.log('\n  Droit de rétractation');
captured.length = 0;
const noConsent = await handler(new Request('https://emploia.eu/api/stripe-checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', origin: 'https://emploia.eu', 'x-forwarded-for': '10.0.1.7' },
  body: JSON.stringify({ plan: 'campagne', email: 'probe@example.com' }),
}));
const refused = noConsent.status === 400 && captured.length === 0;
console.log(`  ${refused ? '✓' : '✗'} sans consentement → refusé (status ${noConsent.status}, appels Stripe : ${captured.length})`);
if (!refused) fail++;

captured.length = 0;
await call('campagne');
const stamped = (captured[0] || {})['metadata[consent_immediate]'] === 'true'
  && typeof (captured[0] || {})['metadata[consent_at]'] === 'string';
console.log(`  ${stamped ? '✓' : '✗'} avec consentement → tracé dans les métadonnées Stripe`);
if (!stamped) fail++;

globalThis.fetch = realFetch;
console.log(fail === 0 ? '\n✅ sonde checkout : conforme\n' : `\n❌ ${fail} écart(s)\n`);
process.exit(fail === 0 ? 0 : 1);
