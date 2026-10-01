// Vérification de la production réelle, à lancer APRÈS la bascule.
//
//   node scripts/smoke/prod.mjs                        # lecture seule
//   node scripts/smoke/prod.mjs --checkout             # + sondes Stripe
//   node scripts/smoke/prod.mjs https://preview.url    # autre base
//
// Ce script interroge un site déployé, pas le code source : il n'a donc rien
// à faire dans la CI d'une PR. Il existe pour attraper en une commande les
// pannes que seul le déploiement révèle — un Price Stripe absent, une grille
// restée sur les anciens montants, une route en 404 parce que le rewrite
// n'est pas passé.
//
// Les sondes Stripe sont derrière --checkout parce qu'elles créent une
// session Checkout réelle en mode live. Une session n'est PAS un débit :
// rien n'est encaissé tant que personne ne saisit de carte. Mais c'est une
// écriture chez Stripe, donc elle reste explicite.

const args = process.argv.slice(2);
const WITH_CHECKOUT = args.includes('--checkout');
const BASE = (args.find((a) => a.startsWith('http')) || process.env.SMOKE_BASE_URL || 'https://emploia.fr')
  .replace(/\/$/, '');
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const TIMEOUT = 15000;

let passed = 0, failed = 0, skipped = 0;

function ok(label, detail) { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
function ko(label, detail) { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
function skip(label, why) { skipped++; console.log(`  — ${label} (ignoré : ${why})`); }

async function get(path) {
  const res = await fetch(BASE + path, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { 'User-Agent': 'emploia-smoke/1.0' },
  });
  return { status: res.status, body: await res.text() };
}

// Normalise les espaces insécables et fines que le HTML glisse dans les prix,
// sinon « 59 € » rendu avec une fine ne correspond jamais à « 59 € » tapé ici.
function norm(s) { return s.replace(/[   ]/g, ' '); }

async function page(path, { must = [], mustNot = [] } = {}) {
  let r;
  try { r = await get(path); }
  catch (e) { return ko(`${path} répond`, e.name === 'TimeoutError' ? `pas de réponse en ${TIMEOUT / 1000}s` : e.message); }

  if (r.status !== 200) return ko(`${path} répond 200`, `HTTP ${r.status}`);
  ok(`${path} répond 200`, `${Math.round(r.body.length / 1024)} Ko`);

  const body = norm(r.body);
  for (const needle of must) {
    if (body.includes(norm(needle))) ok(`${path} contient « ${needle} »`);
    else ko(`${path} contient « ${needle} »`, 'absent de la page servie');
  }
  for (const needle of mustNot) {
    if (!body.includes(norm(needle))) ok(`${path} ne contient plus « ${needle} »`);
    else ko(`${path} ne contient plus « ${needle} »`, 'TOUJOURS PRÉSENT');
  }
}

console.log(`\nVérification de ${BASE}\n`);

console.log('[A] Landing — la grille servie est bien la nouvelle');
await page('/', {
  must: ['59€', '24€', 'Pack Campagne'],
  // Anciens montants et preuves sociales fabriquées : leur présence signifie
  // que la prod sert encore une version antérieure à la PR #28.
  mustNot: ['45€', '19€', '24 800', '1 240 avis', '14 200'],
});

console.log('\n[B] Page écoles');
await page('/ecoles', { must: ['9 €', '40 000', 'pilote'] });

console.log('\n[C] Pages qui doivent répondre');
for (const p of ['/app', '/tools', '/dashboard', '/about', '/contact']) {
  try {
    const r = await get(p);
    r.status === 200 ? ok(`${p} répond 200`) : ko(`${p} répond 200`, `HTTP ${r.status}`);
  } catch (e) { ko(`${p} répond`, e.message); }
}

console.log('\n[D] Sitemap');
try {
  const r = await get('/sitemap.xml');
  if (r.status !== 200) ko('sitemap.xml répond 200', `HTTP ${r.status}`);
  else {
    ok('sitemap.xml répond 200');
    r.body.includes('/ecoles') ? ok('sitemap référence /ecoles') : ko('sitemap référence /ecoles', 'absent');
  }
} catch (e) { ko('sitemap.xml', e.message); }

console.log('\n[E] Console créateurs');
if (!ADMIN_SECRET) {
  skip('/api/admin/affiliates', 'ADMIN_SECRET absent de l’environnement');
} else {
  try {
    const res = await fetch(`${BASE}/api/admin/affiliates`, {
      headers: { 'x-admin-secret': ADMIN_SECRET },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (res.status !== 200) {
      ko('/api/admin/affiliates répond 200',
        `HTTP ${res.status}${res.status === 403 ? ' — ADMIN_SECRET ne correspond pas à celui posé sur Vercel' : ''}`);
    } else {
      const d = await res.json();
      const t = d.terms || {};
      ok('/api/admin/affiliates répond 200', `${(d.affiliates || []).length} créateur(s)`);
      t.listPrice === 59 && t.codeDiscount === 10 && t.commissionPerSale === 12
        ? ok('conditions du programme : 59 € / −10 € / 12 € de commission')
        : ko('conditions du programme', JSON.stringify(t));
    }
  } catch (e) { ko('/api/admin/affiliates', e.message); }
}

console.log('\n[F] Checkout Stripe');
if (!WITH_CHECKOUT) {
  skip('sondes de checkout', 'relancer avec --checkout pour les exécuter');
} else {
  for (const plan of ['campagne', 'pro']) {
    try {
      const res = await fetch(`${BASE}/api/stripe-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, email: 'smoke@example.test' }),
        signal: AbortSignal.timeout(TIMEOUT),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && typeof d.url === 'string' && d.url.includes('stripe.com')) {
        ok(`checkout « ${plan} » renvoie une session Stripe`, 'ouvrir l’URL pour vérifier le montant affiché');
      } else {
        // « Plan non configuré » = le STRIPE_PRICE_* correspondant manque sur
        // Vercel, exactement la panne que ce script existe pour attraper.
        ko(`checkout « ${plan} »`, d.error || `HTTP ${res.status}`);
      }
    } catch (e) { ko(`checkout « ${plan} »`, e.message); }
  }

  // Le plan retiré de la vente ne doit plus être achetable.
  try {
    const res = await fetch(`${BASE}/api/stripe-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'intensif' }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    res.status === 400
      ? ok('checkout « intensif » est refusé', 'HTTP 400, comme attendu')
      : ko('checkout « intensif » est refusé', `HTTP ${res.status} — le plan est encore achetable`);
  } catch (e) { ko('checkout « intensif »', e.message); }
}

console.log(`\n${failed ? '❌' : '✅'} ${passed} OK · ${failed} échec(s)${skipped ? ` · ${skipped} ignoré(s)` : ''}\n`);
if (failed) process.exit(1);
