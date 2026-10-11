// Vérifie la configuration de l'endpoint webhook Stripe en live.
//
//   STRIPE_SECRET_KEY=sk_live_… node scripts/billing/verify-webhook.mjs
//
// Pourquoi ce script existe : un webhook mal configuré ne casse rien de
// visible. Le site encaisse, la page de succès s'affiche, et c'est seulement
// l'accès du client qui n'arrive jamais. Deux défauts réels l'ont montré le
// 2026-10-05 — une URL pointant sur un domaine abandonné, et un seul
// événement coché sur les cinq que le code traite.
//
// Lecture seule : aucune écriture, aucun paiement. Sûr à relancer.

const KEY = process.env.STRIPE_SECRET_KEY || '';

// Les cinq événements que `api/stripe-webhook.js` traite réellement. Garder
// cette liste alignée sur le `switch (event.type)` du handler : un événement
// traité dans le code mais non coché chez Stripe n'est jamais livré.
const REQUIRED_EVENTS = [
  'checkout.session.completed',   // octroi initial de l'accès
  'invoice.paid',                 // renouvellement mensuel Pro
  'invoice.payment_failed',       // échec de paiement
  'customer.subscription.deleted',// résiliation → révocation
  'customer.subscription.updated',// changement de plan
];

// Hôtes acceptables. L'hôte Vercel est préféré : le webhook est un endpoint
// serveur, invisible du client, donc l'y laisser le découple des bascules de
// domaine. Le domaine public reste accepté — il fonctionne — mais signalé.
const PREFERRED_HOST = 'emploia-clean.vercel.app';
const ACCEPTABLE_HOSTS = [PREFERRED_HOST, 'emploia.eu'];

let failed = 0;
const ok = (m, d) => console.log(`  ✓ ${m}${d ? ` — ${d}` : ''}`);
const ko = (m, d) => { failed++; console.error(`  ✗ ${m}${d ? ` — ${d}` : ''}`); };
const warn = (m, d) => console.log(`  ! ${m}${d ? ` — ${d}` : ''}`);

if (!KEY) {
  console.error('\nSTRIPE_SECRET_KEY absente. Relancer avec la clé live :\n');
  console.error('  STRIPE_SECRET_KEY=sk_live_… node scripts/billing/verify-webhook.mjs\n');
  console.error('La clé se passe en variable d\'environnement, le temps de la commande.');
  console.error('Ne pas l\'écrire dans un fichier du dépôt.\n');
  process.exit(2);
}

const res = await fetch('https://api.stripe.com/v1/webhook_endpoints?limit=100', {
  headers: { Authorization: `Bearer ${KEY}` },
  signal: AbortSignal.timeout(15000),
});

if (!res.ok) {
  const body = await res.text().catch(() => '');
  console.error(`\n❌ Stripe a répondu HTTP ${res.status}`);
  // Un 401 est presque toujours une clé de test utilisée contre le live.
  if (res.status === 401) console.error('   Clé refusée : vérifier qu\'il s\'agit bien d\'une sk_live_…');
  else console.error(`   ${body.slice(0, 300)}`);
  process.exit(1);
}

const { data: endpoints = [] } = await res.json();
const live = endpoints.filter((e) => e.livemode);

console.log(`\nEndpoints webhook en live : ${live.length}\n`);

if (live.length === 0) {
  ko('au moins un endpoint existe', 'aucun endpoint live — aucune livraison possible');
} else if (live.length > 1) {
  // Plusieurs endpoints livrent le même événement plusieurs fois. Le handler
  // est idempotent (kvSetNX sur l'id d'événement), donc ce n'est pas un double
  // octroi d'accès, mais c'est une source de confusion au débogage.
  warn(`${live.length} endpoints live`, 'chacun reçoit une copie de chaque événement');
}

for (const e of live) {
  const host = (() => { try { return new URL(e.url).host; } catch { return null; } })();
  console.log(`[${e.id}]  ${e.url}`);

  if (e.status !== 'enabled') ko('endpoint activé', `status « ${e.status} »`);
  else ok('endpoint activé');

  if (!host) ko('URL analysable', e.url);
  else if (host === PREFERRED_HOST) ok('hôte', `${host}, découplé du domaine public`);
  else if (ACCEPTABLE_HOSTS.includes(host)) warn('hôte', `${host} fonctionne, mais ${PREFERRED_HOST} survivrait à une bascule de domaine`);
  else ko('hôte', `${host} n'est pas un hôte du projet — toute livraison échoue`);

  if (!e.url.endsWith('/api/stripe-webhook')) ko('chemin', `attendu /api/stripe-webhook, trouvé ${e.url}`);
  else ok('chemin /api/stripe-webhook');

  const enabled = new Set(e.enabled_events || []);
  const all = enabled.has('*');
  const missing = all ? [] : REQUIRED_EVENTS.filter((ev) => !enabled.has(ev));

  if (all) ok('événements', '« * » — tous livrés');
  else if (missing.length === 0) ok('événements', `les ${REQUIRED_EVENTS.length} requis sont cochés`);
  else ko(`${missing.length} événement(s) manquant(s)`, missing.join(', '));

  // Un événement coché que le code ignore n'est pas une panne, mais c'est du
  // trafic inutile et souvent le signe d'une configuration faite à la main.
  const extra = all ? [] : [...enabled].filter((ev) => !REQUIRED_EVENTS.includes(ev));
  if (extra.length) warn(`${extra.length} événement(s) non traité(s) par le code`, extra.join(', '));

  console.log('');
}

console.log(`${failed ? '❌' : '✅'} ${failed} problème(s)\n`);
if (failed) {
  console.log('Correctif : Stripe → Développeurs → Webhooks → l\'endpoint →');
  console.log(`  URL         https://${PREFERRED_HOST}/api/stripe-webhook`);
  console.log(`  Événements  ${REQUIRED_EVENTS.join(', ')}\n`);
  console.log('Changer l\'URL ne régénère pas le secret de signature : STRIPE_WEBHOOK_SECRET');
  console.log('sur Vercel reste valide, il n\'y a rien à y toucher.\n');
}
process.exit(failed ? 1 : 0);
