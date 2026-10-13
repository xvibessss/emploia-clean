#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   EmploiA — CI guards (fast, dependency-free static checks)
   Runs in CI on every PR to catch classes of bug the existing jobs miss:
   broken vercel.json rewrites (silent prod 404s), missing handler exports,
   and security-invariant regressions. Exit 0 = green.
   Run locally: node scripts/ci-guards.mjs
═══════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';

let fails = 0;
const fail = m => { console.error('  ✗ ' + m); fails++; };
const ok   = m => console.log('  ✓ ' + m);
const exists = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};

// ── 1. vercel.json rewrites all resolve to a real file/route ────────────────
console.log('\n[1] vercel.json rewrites → destinations existent');
try {
  const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const rw = v.rewrites || [];
  let broken = 0;
  for (const r of rw) {
    let d = (r.destination || '').split('?')[0];
    if (!d.startsWith('/') || d.includes(':')) continue; // external or param dest
    if (d.startsWith('/api/')) {
      const b = 'api/' + d.slice(5);
      if (exists(b + '.js') || exists(b + '/index.js') || exists(b)) continue;
    } else {
      const rel = d.slice(1);
      if (exists(rel) || exists(rel + '.html') || exists(rel + '/index.html')) continue;
    }
    fail(`rewrite cassé : ${r.source} → ${d}`); broken++;
  }
  if (!broken) ok(`${rw.length} rewrites, aucun cassé`);
} catch (e) { fail('vercel.json illisible : ' + e.message); }

// ── 2. every API handler exports a default ──────────────────────────────────
console.log('\n[2] chaque handler api/ a un export default');
const apiFiles = fs.existsSync('api') ? walk('api').filter(f => f.endsWith('.js')) : [];
let noDefault = 0;
for (const f of apiFiles) {
  const base = path.basename(f);
  if (base.startsWith('_') || f.includes('/_lib/')) continue; // libs, not handlers
  if (!/export\s+default/.test(fs.readFileSync(f, 'utf8'))) { fail(`pas d'export default : ${f}`); noDefault++; }
}
if (!noDefault) ok(`${apiFiles.length} fichiers api/ scannés, handlers OK`);

// ── 3. security invariants (regressions we never want back) ─────────────────
console.log('\n[3] invariants de sécurité');
const readAll = f => (exists(f) ? fs.readFileSync(f, 'utf8') : '');
const apiSrc = apiFiles.map(readAll).join('\n');
// no hardcoded fallback JWT secret
if (/JWT_SECRET\s*\|\|\s*['"]/.test(apiSrc + readAll('middleware.js'))) fail('secret JWT de repli en dur détecté (JWT_SECRET || "…")');
else ok('aucun secret JWT de repli en dur');
// chat persona not client-overridable
if (/system_override/.test(readAll('api/chat.js'))) fail('api/chat.js accepte system_override (persona détournable)');
else ok('chat : persona serveur figée');
// no committed .env
const envs = ['.env', '.env.local', '.env.production'].filter(exists);
if (envs.length) fail('fichier(s) secret(s) commités : ' + envs.join(', '));
else ok('aucun .env commité');

// ── 4. data locality: every function is pinned to Paris ─────────────────────
// La page /ecoles et /sous-traitants affirment à un acheteur institutionnel que
// le traitement applicatif s'exécute en France. Cette affirmation ne tient que
// si chaque fonction est effectivement épinglée, et elle se périmerait au
// premier handler ajouté sans y penser — d'où ce garde.
//
// Deux mécanismes distincts, et c'est le piège : la clé `regions` de
// vercel.json pilote les fonctions Serverless/Node, tandis qu'une fonction en
// runtime Edge s'exécute par défaut « dans la région la plus proche de la
// requête » et doit déclarer ses propres `regions` dans son export const
// config. Poser seulement la clé projet laisserait les 66 handlers Edge
// s'exécuter n'importe où, tout en ayant l'air réglé.
console.log('\n[4] localisation des données → toute fonction épinglée sur cdg1');
try {
  const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const projectRegions = v.regions || [];
  if (projectRegions.length === 1 && projectRegions[0] === 'cdg1') ok('vercel.json déclare regions: ["cdg1"]');
  else fail(`vercel.json doit déclarer regions: ["cdg1"] (actuel : ${JSON.stringify(projectRegions)})`);

  let unpinned = 0;
  for (const f of apiFiles) {
    const base = path.basename(f);
    if (base.startsWith('_') || f.includes('/_lib/')) continue; // libs, pas des handlers
    const src = readAll(f);
    const cfg = src.match(/export\s+const\s+config\s*=\s*\{[\s\S]*?\}\s*;/);
    // Un handler sans bloc config tourne en Node et hérite de la clé projet.
    if (!cfg) continue;
    if (!/runtime\s*:\s*['"]edge['"]/.test(cfg[0])) continue;
    if (!/regions\s*:\s*\[\s*['"]cdg1['"]\s*\]/.test(cfg[0])) {
      fail(`handler Edge non épinglé sur cdg1 : ${f} — ajouter regions: ['cdg1'] à son export const config`);
      unpinned++;
    }
  }
  if (!unpinned) ok(`tous les handlers Edge déclarent regions: ['cdg1']`);
} catch (e) { fail('contrôle de localisation impossible : ' + e.message); }

// ── 5. JSON config is valid ─────────────────────────────────────────────────
console.log('\n[5] JSON de config valide');
for (const j of ['vercel.json', 'package.json']) {
  if (!exists(j)) continue;
  try { JSON.parse(fs.readFileSync(j, 'utf8')); ok(`${j} valide`); }
  catch (e) { fail(`${j} invalide : ${e.message}`); }
}

// ── 6. La liste d'événements du vérificateur suit le handler ────────────────
// Un événement ajouté au handler mais pas à cette liste ne serait jamais
// réclamé chez Stripe : il ne serait donc jamais livré, et le code écrit pour
// le traiter ne tournerait jamais. C'est exactement la panne constatée en
// production le 2026-10-05 — quatre des cinq événements n'étaient pas cochés.
console.log('\n[6] verify-webhook.mjs couvre tous les événements du handler');
try {
  const handler = fs.readFileSync('api/stripe-webhook.js', 'utf8');
  const verifier = fs.readFileSync('scripts/billing/verify-webhook.mjs', 'utf8');

  const handled = [...handler.matchAll(/case\s+'([a-z_]+\.[a-z_.]+)'\s*:/g)].map(m => m[1]);
  const required = [...verifier.matchAll(/^\s*'([a-z_]+\.[a-z_.]+)',/gm)].map(m => m[1]);

  if (!handled.length) fail('aucun case event.type trouvé dans api/stripe-webhook.js — motif à revoir');
  else {
    const missing = handled.filter(e => !required.includes(e));
    const extra = required.filter(e => !handled.includes(e));
    if (missing.length) fail(`verify-webhook.mjs ignore ${missing.length} événement(s) traité(s) par le handler : ${missing.join(', ')}`);
    if (extra.length) fail(`verify-webhook.mjs exige ${extra.length} événement(s) que le handler ne traite pas : ${extra.join(', ')}`);
    if (!missing.length && !extra.length) ok(`les ${handled.length} événements du handler sont exigés à l'identique`);
  }
} catch (e) { fail('contrôle des événements webhook impossible : ' + e.message); }

// ── 7. les pages référencent l'empreinte courante des feuilles partagées ───
// Sans ce contrôle, modifier shared.css sans réestampiller laisserait les
// pages pointer l'ancienne URL : le cache servirait l'ancienne feuille, et on
// aurait reproduit en silence le décalage HTML/CSS que le versionnage corrige.
console.log("\n[7] shared.css / shared.js → empreinte à jour dans les pages");
try {
  const { stampAll, ASSETS } = await import('./assets/version.mjs');
  const { hashes, stale } = stampAll({ write: false });
  const versions = ASSETS.map(({ file }) => `${file} → ${hashes[file]}`).join(' · ');

  if (stale.length) {
    fail(`${stale.length} fichier(s) portent une empreinte périmée (${stale.slice(0, 5).join(', ')}${stale.length > 5 ? '…' : ''}) — corriger avec : npm run assets:version`);
  } else {
    ok(`empreintes à jour partout — ${versions}`);
  }
} catch (e) { fail("contrôle des empreintes d'assets impossible : " + e.message); }

// ── 8. runtime vs style d'API : un handler Node ne doit pas parler « Web » ──
// C'est la panne de /api/jobs, restée 500 en production du 23 mai au 6 octobre
// 2026. Le commit 0a40c4b a retiré `export const config = { runtime: 'edge' }`
// en laissant le corps écrit pour l'API Web. En runtime Node, `req.headers` est
// un objet simple : `req.headers.get(...)` lève un TypeError dès la deuxième
// ligne du handler, qui répond FUNCTION_INVOCATION_FAILED sans jamais démarrer.
//
// Rien ne signalait l'erreur : le fichier est syntaxiquement valide, il exporte
// bien un default, et le contrôle [2] passait. Seule l'invocation révélait la
// panne. Ce garde compare donc le runtime déclaré au style d'API employé.
//
// Les bibliothèques de api/_lib/ sont exclues : elles reçoivent le `req` des
// handlers Edge qui les appellent, et utilisent req.headers.get légitimement.
console.log("\n[8] runtime déclaré ↔ style d'API utilisé");
const WEB_API = [
  [/req\.headers\.get\s*\(/, 'req.headers.get()'],
  [/new\s+URL\s*\(\s*req\.url/, 'new URL(req.url)'],
  [/new\s+Response\s*\(/, 'new Response()'],
];
let mismatched = 0;
for (const f of apiFiles) {
  const base = path.basename(f);
  if (base.startsWith('_') || f.includes('/_lib/')) continue; // libs, pas des handlers
  const src = readAll(f);
  const cfg = src.match(/export\s+const\s+config\s*=\s*\{[\s\S]*?\}\s*;/);
  const isEdge = cfg && /runtime\s*:\s*['"]edge['"]/.test(cfg[0]);
  if (isEdge) continue; // style Web attendu, rien à signaler
  const used = WEB_API.filter(([re]) => re.test(src)).map(([, label]) => label);
  if (used.length) {
    fail(
      `${f} tourne en runtime Node mais utilise ${used.join(', ')} — ` +
      `ajouter export const config = { runtime: 'edge', regions: ['cdg1'] }, ` +
      `ou convertir le handler au style Node (req.headers['x-…'], res.status().json())`
    );
    mismatched++;
  }
}
if (!mismatched) ok("aucun handler Node n'utilise l'API Web");

// ── 9. tout canonical pointe sur une URL réellement servie ─────────────────
// `cleanUrls` est absent de vercel.json : Vercel ne sert un fichier statique
// qu'à son chemin réel, extension comprise. Chaque URL propre du site vient
// donc d'un rewrite explicite — c'est la raison des ~223 entrées.
//
// Conséquence : déclarer `canonical` vers `/page` alors que seul `/page.html`
// existe désigne un 404 comme version faisant autorité. Google suit le
// canonical, ne trouve rien, et cesse d'indexer la page réelle.
//
// C'est la panne trouvée sur score.html le 2026-10-11 : canonical vers
// `/score`, quand seul `/score/:token` est servi. Un seul lien cassé sur
// 7086 vérifiés par le Link Check nocturne, mais il suffit à le faire échouer
// toutes les nuits — et un échec permanent est un échec qu'on cesse de lire.
console.log('\n[9] chaque canonical désigne une URL servie');
try {
  const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const sources = (v.rewrites || []).map((r) => r.source).filter(Boolean);
  const exact = new Set(sources.filter((s) => !s.includes(':') && !s.includes('(')));
  // `/score/:token` et `/blog/(.*)` servent un chemin sans le nommer : il faut
  // les comparer en motif, sinon chaque page paramétrée serait un faux positif.
  const patterns = sources
    .filter((s) => s.includes(':') || s.includes('('))
    .map((s) => new RegExp('^' + s.replace(/:[a-zA-Z]+/g, '[^/]+').replace(/\(\.\*\)/g, '.*') + '$'));

  let checked = 0, broken = 0;
  for (const f of walk('.').filter((p) => p.endsWith('.html') && !p.includes('node_modules'))) {
    const m = readAll(f).match(/rel="canonical"\s+href="([^"]+)"/);
    if (!m) continue;
    checked++;
    let p;
    try { p = new URL(m[1]).pathname; } catch { fail(`${f} : canonical « ${m[1]} » n'est pas une URL`); broken++; continue; }
    if (p === '/') continue;
    const clean = p.replace(/\/$/, '');
    const isRealFile = /\.[a-z0-9]+$/i.test(clean) && exists('.' + clean);
    if (exact.has(p) || exact.has(clean) || isRealFile || patterns.some((re) => re.test(clean))) continue;
    fail(`${f} : canonical vers ${p} — aucun rewrite ne sert ce chemin, Google y trouverait un 404`);
    broken++;
  }
  if (!broken) ok(`les ${checked} canonical désignent une URL servie`);
} catch (e) { fail('contrôle des canonical impossible : ' + e.message); }

// ── 10. titre, description et h1 : présents et uniques ─────────────────────
// Le défaut emblématique du SEO programmatique : 48 pages villes nées du même
// gabarit qui partagent leur <title>. Google en garde une et ignore les 47
// autres — on ne perd pas un peu de trafic, on en perd la quasi-totalité, et
// Search Console le signale en « balises title en double ».
//
// Le dépôt est sain sur ce point au 2026-10-11 : 173 pages indexables, zéro
// doublon de title, de description ou de h1. Ce garde existe pour que la
// prochaine famille de pages générées ne puisse pas casser cet état en
// silence — c'est le genre d'erreur qu'on ne voit qu'au trimestre suivant,
// dans une courbe d'impressions qui ne décolle pas.
//
// Un h1 absent est aussi un défaut d'accessibilité : un lecteur d'écran s'en
// sert pour annoncer la page. C'est ce qui manquait à offre.html, où le titre
// du poste vivait dans une div.
console.log('\n[10] title, description et h1 — présents et uniques');
try {
  const pages = walk('.').filter((f) =>
    f.endsWith('.html') &&
    !f.includes('node_modules') &&
    // L'extension Chrome n'est pas une page web : elle n'est ni servie ni
    // indexable, et n'a aucun besoin de description.
    !f.includes('chrome-extension'));

  const seen = { title: new Map(), description: new Map(), h1: new Map() };
  let indexable = 0, missing = 0;

  for (const f of pages) {
    const src = readAll(f);
    // Une page en noindex est hors sujet : on ne lui demande ni unicité ni
    // description, puisqu'elle ne paraîtra jamais dans un résultat.
    if (/name="robots"[^>]*noindex/i.test(src)) continue;
    indexable++;

    const grab = (re) => { const m = src.match(re); return m ? m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : ''; };
    const found = {
      title: grab(/<title>([^<]*)<\/title>/i),
      description: grab(/<meta\s+name="description"\s+content="([^"]*)"/i),
      h1: grab(/<h1[^>]*>([\s\S]*?)<\/h1>/i),
    };

    for (const [field, value] of Object.entries(found)) {
      if (!value) { fail(`${f} : ${field} absent — page indexable sans ${field}`); missing++; continue; }
      const prev = seen[field].get(value);
      if (prev) fail(`${f} : ${field} identique à ${prev} — « ${value.slice(0, 60)}${value.length > 60 ? '…' : ''} »`);
      else seen[field].set(value, f);
    }
  }
  if (!missing && seen.title.size === indexable && seen.h1.size === indexable)
    ok(`${indexable} pages indexables`, 'title, description et h1 tous présents et uniques');
} catch (e) { fail('contrôle des métadonnées impossible : ' + e.message); }

// ── 11. quota gratuit : garde remboursant, et crédit rendu sur échec ───────
// Deux fonctions existent pour décompter une génération gratuite, et une seule
// est correcte. Les deux incrémentent atomiquement, mais seule
// claimFreeGeneration REND le crédit quand la limite est dépassée : avec
// incrementGenerations, chaque tentative refusée gonflait le compteur à vie, et
// c'est ce compteur que /app et /dashboard affichent à l'utilisateur.
//
// Second contrôle : un endpoint qui réclame un crédit doit pouvoir le rendre.
// Trois d'entre eux renvoyaient une erreur 500 sur une réponse d'IA malformée
// sans rembourser — l'utilisateur perdait un de ses 5 crédits pour une panne
// qui n'était pas la sienne. C'est précisément ce que refundGeneration existe
// pour éviter, d'après son propre commentaire.
console.log('\n[11] quota gratuit — garde remboursant et crédit rendu');
try {
  const metered = apiFiles.filter((f) => {
    if (f.includes('/_lib/') || path.basename(f).startsWith('_')) return false;
    return /claimFreeGeneration|incrementGenerations/.test(readAll(f));
  });

  let bad = 0;
  for (const f of metered) {
    const src = readAll(f);
    // On cherche l'APPEL, pas la mention : un commentaire qui nomme l'ancienne
    // fonction pour expliquer pourquoi on ne l'emploie plus est légitime.
    if (/await\s+incrementGenerations\s*\(/.test(src)) {
      fail(`${f} : décompte via incrementGenerations — utiliser claimFreeGeneration, qui rend le crédit quand la limite est dépassée`);
      bad++;
      continue;
    }
    if (/await\s+claimFreeGeneration\s*\(/.test(src) && !/await\s+refundGeneration\s*\(/.test(src)) {
      fail(`${f} : réclame un crédit sans jamais le rendre — une panne de l'IA brûlerait une des 5 générations gratuites`);
      bad++;
    }
  }
  if (!bad) ok(`${metered.length} endpoints décomptent un crédit`, 'tous via claimFreeGeneration, tous capables de le rendre');
} catch (e) { fail('contrôle du quota gratuit impossible : ' + e.message); }

// ── 12. aucun email n'annonce un prix qui n'existe plus ────────────────────
// Trouvé le 2026-10-13 : la relance d'essai annonçait « Emploia Pro — 19 € /
// mois » avec un bouton d'inscription, treize jours après la bascule à 24 €.
// L'utilisateur cliquait sur une promesse et découvrait un autre prix.
//
// Rien ne pouvait l'attraper. smoke/prod.mjs vérifie l'absence des anciens
// montants, mais seulement sur la page d'accueil servie : un prix enterré dans
// un gabarit d'email n'apparaît sur aucune page, et ne se voit que dans la
// boîte de réception d'un prospect — c'est-à-dire trop tard.
//
// Liste blanche plutôt que liste noire : un montant inconnu doit être ajouté
// ici consciemment. Une liste des anciens prix, elle, ne dirait rien du
// prochain changement de grille.
console.log('\n[12] prix des emails — conformes à la grille');
try {
  // Montants légitimes, avec leur raison. Toute autre valeur est suspecte.
  const ALLOWED = new Map([
    ['0', "« 0€ aujourd'hui » — essai Pro, rien n'est débité"],
    ['6', 'palier écoles au-delà de 1000 étudiants'],
    ['9', 'écoles, par étudiant et par an'],
    ['12', 'commission créateur par vente'],
    ['24', 'Pro, par mois'],
    ['39', 'outplacement, par candidat'],
    ['49', 'Pack Campagne avec un code créateur'],
    ['59', 'Pack Campagne'],
  ]);

  // Seuls les fichiers qui composent un email : ailleurs, un montant est une
  // constante de calcul, pas une promesse faite à quelqu'un.
  const senders = apiFiles.filter((f) => /sendEmail|emailWrapper/.test(readAll(f)));

  let checked = 0, bad = 0;
  for (const f of senders) {
    for (const m of readAll(f).matchAll(/(\d+(?:[,.]\d+)?)(?:&nbsp;|\s)?€/g)) {
      checked++;
      const amount = m[1];
      if (ALLOWED.has(amount)) continue;
      fail(`${f} : annonce « ${amount} € » — absent de la grille. Soit le prix a changé et l'email n'a pas suivi, soit le montant est légitime et doit rejoindre ALLOWED dans ce garde`);
      bad++;
    }
  }
  if (!bad) ok(`${checked} montant(s) cité(s) dans ${senders.length} gabarits d'email`, 'tous conformes à la grille');
} catch (e) { fail('contrôle des prix des emails impossible : ' + e.message); }

console.log('');
if (fails) { console.error(`CI GUARDS: ${fails} problème(s) ✗`); process.exit(1); }
console.log('CI GUARDS: tout vert ✓');
