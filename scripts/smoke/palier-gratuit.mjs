// Vérifie le palier gratuit sur un site déployé, avec un vrai compte.
//
//   EMPLOIA_TEST_EMAIL=... EMPLOIA_TEST_PASSWORD=... node scripts/smoke/palier-gratuit.mjs
//   … --consomme     # en plus : épuise les 5 générations (appels d'IA PAYANTS)
//   … https://autre  # autre base
//
// Pourquoi ce script existe. Les sondes de facturation vérifient la logique
// hors ligne, avec un Upstash en mémoire et un fetch stubé. Aucune ne dit ce
// que fait la production avec un vrai compte, un vrai KV et un vrai jeton —
// et c'est là que vivait le défaut corrigé en PR #64 : trois endpoints
// brûlaient un crédit gratuit quand l'IA répondait de travers.
//
// Deux phases, séparées par leur coût :
//
//   Phase A — GRATUITE. Elle teste le comportement de REFUS, qui ne déclenche
//   aucun appel d'IA : au-delà de la limite, l'endpoint répond 402 avant de
//   parler à Anthropic. C'est précisément ce que la PR #64 a corrigé, donc
//   l'essentiel se vérifie sans rien dépenser, et autant de fois qu'on veut.
//
//   Phase B — PAYANTE, derrière --consomme. Elle épuise les générations
//   restantes pour amener un compte neuf jusqu'à la limite. Chaque appel coûte
//   des jetons Anthropic réels.
//
// Le script ne crée aucun compte : il se connecte à un compte que vous avez
// créé. Les identifiants passent par l'environnement, le temps de la commande.

const args = process.argv.slice(2);
const BASE = (args.find((a) => a.startsWith('http')) || 'https://emploia.eu').replace(/\/$/, '');
const CONSOMME = args.includes('--consomme');
const EMAIL = process.env.EMPLOIA_TEST_EMAIL || '';
const PASSWORD = process.env.EMPLOIA_TEST_PASSWORD || '';
const TIMEOUT = 45000;
const FREE_LIMIT = 5;

let failed = 0;
const ok = (m, d) => console.log(`  ✓ ${m}${d ? ` — ${d}` : ''}`);
const ko = (m, d) => { failed++; console.error(`  ✗ ${m}${d ? ` — ${d}` : ''}`); };
const info = (m) => console.log(`  · ${m}`);

if (!EMAIL || !PASSWORD) {
  console.error(`
Identifiants absents. Créez d'abord un compte de test sur ${BASE}, puis :

  EMPLOIA_TEST_EMAIL=test@exemple.fr \\
  EMPLOIA_TEST_PASSWORD='…' \\
  node scripts/smoke/palier-gratuit.mjs

Utilisez un compte dédié, jamais votre compte personnel : la phase --consomme
épuise définitivement ses 5 générations gratuites.

Les identifiants ne sont lus que depuis l'environnement. Préfixez la commande
d'une espace pour qu'elle n'entre pas dans l'historique du shell.
`);
  process.exit(2);
}

let cookie = '';

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT),
    redirect: 'manual',
  });
  // Le jeton vit dans un cookie httpOnly posé à la connexion.
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

console.log(`\nPalier gratuit — ${BASE}\n`);

// ── Connexion ───────────────────────────────────────────────────────────────
console.log('[0] Connexion');
const login = await call('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
if (login.status !== 200) {
  ko('connexion', `HTTP ${login.status}${login.json?.error ? ` — ${login.json.error}` : ''}`);
  console.log(`\n❌ impossible de continuer sans session\n`);
  process.exit(1);
}
ok('connecté');

const me = await call('/api/auth/me');
if (me.status !== 200) { ko('/api/auth/me', `HTTP ${me.status}`); process.exit(1); }
const user = me.json?.user || me.json;
const plan = user?.plan || '(absent)';
let used = user?.generationsUsed ?? 0;

if (plan !== 'free') {
  ko('le compte doit être gratuit', `plan « ${plan} » — un compte payant ne teste pas le palier`);
  console.log(`\n❌ utilisez un compte sans abonnement ni accès Pro actif\n`);
  process.exit(1);
}
ok('plan', `free · ${used} génération(s) déjà utilisée(s)`);

// ── Phase B : épuiser, si demandé ───────────────────────────────────────────
// Placée avant la phase A : on ne peut tester le refus qu'une fois la limite
// atteinte. Sur un compte déjà épuisé, rien n'est dépensé.
const PAYLOAD = { company: 'Sonde EmploiA', jobTitle: 'Test', tone: 'professional' };
if (used < FREE_LIMIT) {
  if (!CONSOMME) {
    console.log(`\n[B] Épuisement — ignoré`);
    info(`${FREE_LIMIT - used} génération(s) restante(s) : relancer avec --consomme pour les dépenser`);
    info(`chaque appel coûte des jetons Anthropic réels, d'où le drapeau explicite`);
    console.log(`\n⚠️  le refus ne peut pas être testé tant que la limite n'est pas atteinte\n`);
    process.exit(failed ? 1 : 0);
  }
  console.log(`\n[B] Épuisement des ${FREE_LIMIT - used} génération(s) restante(s) — APPELS PAYANTS`);
  while (used < FREE_LIMIT) {
    const r = await call('/api/generate/follow-up', { method: 'POST', body: PAYLOAD });
    if (r.status !== 200) { ko(`génération ${used + 1}`, `HTTP ${r.status}${r.json?.error ? ` — ${r.json.error}` : ''}`); break; }
    const after = (await call('/api/auth/me')).json?.user?.generationsUsed ?? used + 1;
    after === used + 1
      ? ok(`génération ${used + 1} livrée`, `compteur ${used} → ${after}`)
      : ko(`génération ${used + 1}`, `compteur ${used} → ${after}, attendu ${used + 1}`);
    used = after;
  }
}

// ── Phase A : le refus, et la stabilité du compteur ─────────────────────────
// C'est le cœur : avant la PR #64, chaque refus incrémentait le compteur sans
// le rendre. Trois refus d'affilée amenaient un compte à 8 « utilisées » sur 5,
// et c'est ce nombre que /app et /dashboard affichent à l'utilisateur.
console.log(`\n[A] Refus au-delà de la limite, et compteur stable — aucun appel d'IA`);
if (used < FREE_LIMIT) {
  ko('la limite doit être atteinte', `${used}/${FREE_LIMIT} — relancer avec --consomme`);
} else {
  const before = used;
  for (let i = 1; i <= 3; i++) {
    const r = await call('/api/generate/follow-up', { method: 'POST', body: PAYLOAD });
    r.status === 402
      ? ok(`refus ${i}`, 'HTTP 402, comme attendu')
      : ko(`refus ${i}`, `HTTP ${r.status} — la génération a été livrée au-delà de la limite`);
  }
  const after = (await call('/api/auth/me')).json?.user?.generationsUsed ?? -1;
  after === before
    ? ok('compteur inchangé après 3 refus', `${after}/${FREE_LIMIT} — le crédit est bien rendu`)
    : ko('compteur inchangé après 3 refus', `${before} → ${after} : chaque refus gonfle le compteur (défaut de la PR #64)`);
}

// ── Les autres gardes, gratuits ─────────────────────────────────────────────
console.log(`\n[C] Les autres gardes du palier`);
for (const [path, expected, why] of [
  ['/api/generate/salary-negotiation', 403, 'réservé aux payants'],
  ['/api/generate/interview-debrief', 403, 'réservé aux payants'],
  ['/api/smart-apply', 403, 'réservé aux payants'],
]) {
  const r = await call(path, { method: 'POST', body: { jobTitle: 'Test' } });
  r.status === expected
    ? ok(`${path} → ${expected}`, why)
    : ko(`${path} → ${expected}`, `HTTP ${r.status} — ${r.status === 200 ? 'livré à un compte gratuit' : 'code inattendu'}`);
}

console.log(`\n${failed ? '❌' : '✅'} ${failed} problème(s)\n`);
process.exit(failed ? 1 : 0);
