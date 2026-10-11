// Ad-hoc probe: run the real stripe-webhook handler against an in-memory KV and
// prove the creator-commission ledger by observed behaviour, not by reading the
// source. Commission is money owed to a third party, so the guarantees are:
//   1. a Pack sale carrying a creator code credits that code exactly once
//   2. replaying the same event credits nothing more (idempotency covers it)
//   3. a Pack sale with no code credits nobody
//   4. a subscription never credits a creator (commission is Pack-only)
const SECRET = 'whsec_stub';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.STRIPE_SECRET_KEY = 'sk_test_stub'; // requis par le repli discounts[]
process.env.KV_REST_API_URL = 'http://kv.stub';
process.env.KV_REST_API_TOKEN = 'stub';
delete process.env.RESEND_API_KEY; // keep the probe offline

// Le promotion code tel qu'il existe chez Stripe, et son identifiant opaque :
// l'événement ne porte que l'identifiant, jamais le code en clair.
const PROMO_ID = 'promo_stub_lea';
const PROMO_CODE = 'LEA10';
const promoLookups = [];

// ── In-memory Upstash stub ──────────────────────────────────────────────────
// Same shape as probe-webhook.mjs, plus SADD/INCR/SMEMBERS/MGET which the
// affiliate ledger needs. An unhandled command fails loudly rather than
// returning null: a silent no-op is exactly how a missed credit would hide.
const store = new Map();
const sets = new Map();
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('http://kv.stub')) {
    const [op, key, val, ...rest] = JSON.parse(opts.body);
    const reply = (result) => new Response(JSON.stringify({ result }), { status: 200 });
    switch (String(op).toUpperCase()) {
      case 'GET': {
        const v = store.get(key);
        return reply(v === undefined ? null : v);
      }
      case 'SET': {
        const isNX = rest.map(String).map((s) => s.toUpperCase()).includes('NX');
        if (isNX && store.has(key)) return reply(null);
        store.set(key, val);
        return reply('OK');
      }
      case 'INCR': {
        const next = (Number(store.get(key)) || 0) + 1;
        store.set(key, String(next));
        return reply(next);
      }
      case 'SADD': {
        if (!sets.has(key)) sets.set(key, new Set());
        const before = sets.get(key).size;
        [val, ...rest].filter((m) => m !== undefined).forEach((m) => sets.get(key).add(m));
        return reply(sets.get(key).size - before);
      }
      case 'SMEMBERS':
        return reply([...(sets.get(key) || [])]);
      case 'MGET':
        return reply([key, val, ...rest].filter((k) => k !== undefined).map((k) => store.get(k) ?? null));
      default:
        throw new Error(`Commande KV non simulée : ${op}`);
    }
  }
  // Résolution d'un promotion code par son identifiant — le seul appel Stripe
  // que le webhook s'autorise, en lecture.
  if (u.includes('api.stripe.com/v1/promotion_codes/')) {
    const id = u.split('/promotion_codes/')[1];
    promoLookups.push(id);
    if (id === PROMO_ID) return new Response(JSON.stringify({ id, code: PROMO_CODE }), { status: 200 });
    return new Response(JSON.stringify({ error: { message: 'No such promotion code' } }), { status: 404 });
  }
  if (u.includes('/api/track')) return new Response('{}', { status: 200 });
  return new Response('{}', { status: 200 });
};

const { default: handler } = await import('../../api/stripe-webhook.js');

async function sign(payload) {
  const ts = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${payload}`));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${ts},v1=${hex}`;
}

async function send(event) {
  const payload = JSON.stringify(event);
  return handler(new Request('https://emploia.eu/api/stripe-webhook', {
    method: 'POST',
    headers: { 'stripe-signature': await sign(payload) },
    body: payload,
  }));
}

function packSale({ id, email, affiliate }) {
  return {
    id,
    type: 'checkout.session.completed',
    data: {
      object: {
        mode: 'payment',
        customer: 'cus_stub',
        customer_email: email,
        metadata: affiliate ? { plan: 'campagne', affiliate } : { plan: 'campagne' },
      },
    },
  };
}

const sales = (code) => Number(store.get(`affiliate:${code}:sales`)) || 0;
const known = () => [...(sets.get('affiliates') || [])];
// Le handler écrit via kvSet, qui sérialise en JSON ; les valeurs semées
// directement dans le stub restent des objets. On relit donc dans les deux
// formes plutôt que de supposer l'une des deux.
const user = (email) => {
  const v = store.get(`user:${email}`);
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
};

let passed = 0, failed = 0;
function check(label, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

console.log('\nSonde affiliation créateurs\n');

// A buyer account must exist for the grant path; the credit itself is
// deliberately independent of it.
store.set('user:lea@example.test', { email: 'lea@example.test', name: 'Lea', plan: 'free' });
store.set('user:sans-code@example.test', { email: 'sans-code@example.test', name: 'Sam', plan: 'free' });

console.log('[A] Une vente avec code crédite le créateur');
await send(packSale({ id: 'evt_1', email: 'lea@example.test', affiliate: 'TESTCODE' }));
check("le code est crédité d'une vente", sales('TESTCODE') === 1, `${sales('TESTCODE')} vente`);
check('le code entre dans la liste des créateurs', known().includes('TESTCODE'), known().join(', ') || 'vide');

console.log('\n[B] Le rejeu du même événement ne recrédite rien');
await send(packSale({ id: 'evt_1', email: 'lea@example.test', affiliate: 'TESTCODE' }));
check('toujours une seule vente après rejeu', sales('TESTCODE') === 1, `${sales('TESTCODE')} vente`);

console.log('\n[C] Une vente sans code ne crédite personne');
await send(packSale({ id: 'evt_2', email: 'sans-code@example.test' }));
check('aucun créateur supplémentaire', known().length === 1, `${known().length} code connu`);
check('le compteur du code existant est inchangé', sales('TESTCODE') === 1, `${sales('TESTCODE')} vente`);

console.log('\n[D] Un abonnement ne crédite jamais de commission');
await send({
  id: 'evt_3',
  type: 'checkout.session.completed',
  data: {
    object: {
      mode: 'subscription',
      customer: 'cus_stub2',
      customer_email: 'lea@example.test',
      subscription: 'sub_stub',
      // Even if a code somehow rode along, a subscription must not pay out:
      // commission is settled on one-off sales only.
      metadata: { plan: 'pro', affiliate: 'TESTCODE' },
    },
  },
});
check('le compteur reste à 1 après un abonnement', sales('TESTCODE') === 1, `${sales('TESTCODE')} vente`);

console.log('\n[E] Un second créateur est suivi séparément');
store.set('user:max@example.test', { email: 'max@example.test', name: 'Max', plan: 'free' });
await send(packSale({ id: 'evt_4', email: 'max@example.test', affiliate: 'AUTRECODE' }));
check('le nouveau code a sa propre vente', sales('AUTRECODE') === 1, `${sales('AUTRECODE')} vente`);
check("le premier code n'a pas bougé", sales('TESTCODE') === 1, `${sales('TESTCODE')} vente`);
check('deux créateurs connus', known().length === 2, known().join(', '));

// ── Le trou résiduel : code saisi sur la page Stripe ────────────────────────
// Un acheteur qui n'est jamais passé par ?code= ne déclenche pas le chemin
// serveur : allow_promotion_codes lui accorde la remise, mais aucune
// metadata[affiliate] n'est posée. Sans repli, le créateur a fait la vente et
// n'est pas crédité — et c'est l'acheteur le plus engagé, celui qui a retenu
// le code au lieu de cliquer le lien.
//
// Un test par chemin : metadata (nominal) et discounts[] (repli).
console.log('\n[F] Code saisi sur la page Stripe, sans ?code= — repli par discounts[]');
store.set('user:nina@example.test', { email: 'nina@example.test', name: 'Nina', plan: 'free' });
promoLookups.length = 0;
await send({
  id: 'evt_5',
  type: 'checkout.session.completed',
  data: {
    object: {
      mode: 'payment',
      customer: 'cus_stub5',
      customer_email: 'nina@example.test',
      // Pas de metadata.affiliate : Stripe ne la pose pas sur ce chemin.
      metadata: { plan: 'campagne' },
      discounts: [{ promotion_code: PROMO_ID }],
    },
  },
});
check('le créateur est crédité malgré l’absence de metadata', sales(PROMO_CODE) === 1, `${sales(PROMO_CODE)} vente`);
check('le code résolu entre dans la liste des créateurs', known().includes(PROMO_CODE), known().join(', '));
check('une seule lecture Stripe a suffi', promoLookups.length === 1, `${promoLookups.length} appel(s)`);
check("l'accès Pro est accordé à l'acheteur", !!user('nina@example.test')?.proUntil);

console.log('\n[G] Le chemin nominal ne déclenche aucun appel Stripe');
// metadata.affiliate est lue en premier : le chemin ?code= ne doit pas payer
// une latence Stripe pour une information qu'il possède déjà.
store.set('user:paul@example.test', { email: 'paul@example.test', name: 'Paul', plan: 'free' });
promoLookups.length = 0;
await send({
  id: 'evt_6',
  type: 'checkout.session.completed',
  data: {
    object: {
      mode: 'payment',
      customer: 'cus_stub6',
      customer_email: 'paul@example.test',
      metadata: { plan: 'campagne', affiliate: 'TESTCODE' },
      // Les deux sources sont présentes et concordent : aucune lecture requise.
      discounts: [{ promotion_code: PROMO_ID }],
    },
  },
});
check('metadata primait, aucun appel Stripe', promoLookups.length === 0, `${promoLookups.length} appel(s)`);
check('la vente est attribuée à la metadata', sales('TESTCODE') === 2, `${sales('TESTCODE')} ventes`);
check("le code du repli n'a pas été crédité en double", sales(PROMO_CODE) === 1, `${sales(PROMO_CODE)} vente`);

console.log('\n[H] Les cas dégradés ne cassent pas la livraison');
// Un identifiant de promotion code inconnu (code supprimé entre-temps) ou une
// panne de l'API Stripe ne doit jamais empêcher l'acheteur d'obtenir son accès.
store.set('user:zoe@example.test', { email: 'zoe@example.test', name: 'Zoé', plan: 'free' });
await send({
  id: 'evt_7',
  type: 'checkout.session.completed',
  data: {
    object: {
      mode: 'payment',
      customer: 'cus_stub7',
      customer_email: 'zoe@example.test',
      metadata: { plan: 'campagne' },
      discounts: [{ promotion_code: 'promo_supprime' }],
    },
  },
});
check("un code introuvable n'empêche pas l'accès Pro", !!user('zoe@example.test')?.proUntil);
check('aucun créateur fantôme créé', known().length === 3, known().join(', '));

// Une remise par coupon direct, sans promotion code, ne doit créditer personne :
// c'est une remise commerciale accordée par Hugo, pas une vente d'apporteur.
store.set('user:hugo@example.test', { email: 'hugo@example.test', name: 'Hugo', plan: 'free' });
promoLookups.length = 0;
await send({
  id: 'evt_8',
  type: 'checkout.session.completed',
  data: {
    object: {
      mode: 'payment',
      customer: 'cus_stub8',
      customer_email: 'hugo@example.test',
      metadata: { plan: 'campagne' },
      discounts: [{ coupon: 'coupon_maison' }],
    },
  },
});
check('un coupon sans promotion code ne crédite personne', known().length === 3, known().join(', '));
check('aucune lecture Stripe pour un simple coupon', promoLookups.length === 0, `${promoLookups.length} appel(s)`);

if (failed) { console.error(`\n❌ sonde affiliation : ${failed} échec(s)\n`); process.exit(1); }
console.log(`\n✅ sonde affiliation : ${passed} vérifications OK\n`);
