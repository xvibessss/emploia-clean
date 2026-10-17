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

    // Un <h1> écrit dans un gabarit JavaScript n'est pas le titre de la page :
    // il ne devient du HTML qu'après exécution, et dans un conteneur qui n'est
    // pas le document. cv-builder.html n'avait que ceux-là — quatre `<h1>
    // ${esc(cv.name)}</h1>` dans les gabarits d'aperçu du CV — et ce contrôle,
    // qui lisait le fichier brut, les comptait comme un h1 présent et unique.
    // La page était donc certifiée conforme sans aucun titre, ni pour Google
    // ni pour un lecteur d'écran. On retire donc le code avant de chercher.
    const rendu = src
      .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');

    const grab = (re, from = src) => { const m = from.match(re); return m ? m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : ''; };
    const found = {
      title: grab(/<title>([^<]*)<\/title>/i),
      description: grab(/<meta\s+name="description"\s+content="([^"]*)"/i),
      h1: grab(/<h1[^>]*>([\s\S]*?)<\/h1>/i, rendu),
    };
    // Un titre qui porte encore `${...}` ou `{{...}}` est une interpolation non
    // résolue servie telle quelle au visiteur, pas un titre.
    if (/\$\{|\{\{/.test(found.h1)) {
      fail(`${f} : h1 « ${found.h1.slice(0, 40)} » contient une interpolation non résolue`);
      missing++;
      continue;
    }

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
    ['12', 'commission créateur par vente'],
    ['24', 'Pro, par mois'],
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
// ── 13. sitemap ↔ pages indexables : la liste ne dérive pas ────────────────
// `api/sitemap.js` est une liste de 171 URLs tenue à la main. Rien n'oblige
// une page nouvelle à y entrer, ni une page passée en noindex à en sortir :
// les deux dérives sont silencieuses et coûtent chacune du trafic d'un côté
// différent.
//
// Une page indexable absente du sitemap n'est pas invisible — Google la
// trouve en suivant les liens — mais elle attend d'être découverte au lieu
// d'être déclarée. `/recherche` montrait le cas extrême : indexable, son
// propre canonical, zéro lien entrant dans tout le dépôt et absente de la
// liste. Aucun chemin n'y menait, ni par le crawl ni par la déclaration.
//
// Une page noindex *présente* dans le sitemap est l'erreur inverse, et elle
// est plus coûteuse : on demande explicitement l'exploration d'une URL dont
// l'en-tête dit de ne pas l'indexer. Search Console la remonte en
// « Envoyée par le sitemap, mais bloquée », et le budget d'exploration part
// dans le vide. Les quatorze pages noindex du dépôt sont hors de la liste
// aujourd'hui ; ce garde vérifie que la quinzième le sera aussi.
console.log('\n[13] sitemap ↔ pages indexables — dans les deux sens');
try {
  const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  // Seuls les rewrites exacts comptent : les deux motifs du dépôt
  // (`/offre/:id`, `/score/:token`) servent des pages noindex, qui n'ont par
  // définition rien à faire dans un sitemap.
  const byDest = new Map();
  for (const r of v.rewrites || []) {
    if (!r.source || !r.destination?.endsWith('.html')) continue;
    if (r.source.includes(':') || r.source.includes('(')) continue;
    const d = r.destination.replace(/^\//, '');
    if (!byDest.has(d)) byDest.set(d, []);
    byDest.get(d).push(r.source);
  }

  const smSrc = readAll('api/sitemap.js');
  const declared = new Set([...smSrc.matchAll(/\$\{base\}(\/[^`]*)`/g)].map((m) => m[1]));
  declared.add('/');

  // robots.txt est l'autre moitié de la déclaration, et la première version de
  // ce garde l'ignorait : elle ne regardait que la balise meta. C'est comme ça
  // que j'ai moi-même ajouté /app au sitemap alors que « Disallow: /app »
  // interdisait son exploration — l'erreur exacte que ce garde devait
  // empêcher, passée sous son nez. Un Disallow est plus fort qu'un noindex :
  // Googlebot ne télécharge pas la page, donc ne lit même pas sa balise.
  const robots = readAll('robots.txt')
    .split('\n')
    .filter((l) => /^disallow:/i.test(l.trim()))
    .map((l) => l.split(':').slice(1).join(':').trim())
    .filter((v) => v && v !== '/');
  const interdite = (p) => robots.find((d) => p.startsWith(d));

  for (const p of declared) {
    const d = interdite(p);
    if (d) fail(`sitemap : ${p} est déclarée mais « Disallow: ${d} » en interdit l'exploration — « Envoyée par le sitemap, mais bloquée » dans Search Console`);
  }

  const pages = walk('.').filter(
    (p) => p.endsWith('.html') && !p.includes('node_modules') && !p.includes('chrome-extension'),
  );
  let absentes = 0, bloquees = 0;
  for (const f of pages) {
    const rel = f.replace(/^\.\//, '');
    const noindex = /name="robots"[^>]*noindex/.test(readAll(f));
    // Une page servie sur plusieurs chemins propres — /legal l'est sur cinq —
    // n'a besoin d'être déclarée qu'une fois, sur celui que son canonical
    // désigne. Il suffit donc qu'un de ses chemins soit dans la liste.
    const paths = byDest.get(rel) || (rel === 'index.html' ? ['/'] : []);
    const dansLeSitemap = paths.filter((p) => declared.has(p));
    if (noindex) {
      if (dansLeSitemap.length) {
        fail(`${rel} : noindex mais déclarée dans le sitemap (${dansLeSitemap.join(', ')}) — exploration demandée pour une page qu'on refuse d'indexer`);
        bloquees++;
      }
      continue;
    }
    if (!paths.length) {
      fail(`${rel} : page indexable qu'aucun rewrite ne sert — inatteignable`);
      absentes++;
      continue;
    }
    if (!dansLeSitemap.length) {
      fail(`${rel} : indexable, servie sur ${paths.join(' ')}, absente du sitemap — à ajouter dans api/sitemap.js ou à passer en noindex`);
      absentes++;
    }
  }
  if (!absentes && !bloquees) {
    const indexables = pages.filter((f) => !/name="robots"[^>]*noindex/.test(readAll(f))).length;
    ok(`${indexables} pages indexables toutes déclarées, ${pages.length - indexables} noindex toutes absentes de la liste`);
  }
} catch (e) { fail('contrôle du sitemap impossible : ' + e.message); }

// ── 14. preuves sociales inventées : le mécanisme et les chaînes retirées ──
// Deux balayages ont déjà nettoyé ce dépôt — la PR #28 sur la landing et la
// page À propos, puis le commit 9b214e0 sur employeurs.html et un article.
// Les deux portaient sur des pages HTML. Tout ce qui a survécu vivait donc
// ailleurs : dans shared.js, dans des gabarits d'email, dans un bloc <script>,
// et dans une seconde occurrence plus bas dans une page déjà nettoyée.
//
// Ce qui restait au 2026-10-14, et que ce garde empêche de revenir :
//
//   shared.js        six notifications d'activité attribuées à des personnes
//                    nommées inventées, dont « Sophie M. vient de décrocher un
//                    entretien chez Qonto » — chargées par TOUTES les pages,
//                    18 s après l'affichage, trois fois de suite ;
//   index.html       « 847 candidats actifs en ce moment » avec une pastille
//                    verte pulsante, tiré d'un Math.random entre 820 et 879
//                    puis dérivé de ±1 toutes les 3,8 s ;
//   employeurs.html  « 2 847 candidats actifs », « 89% ont un CV ATS-optimisé »
//                    et « 3× taux de réponse vs LinkedIn » ;
//   5 gabarits       « 2× / 2,4× plus d'entretiens », « 1 200+ offres analysées
//                    aujourd'hui », « 10 offres personnalisées par jour ».
//
// Le premier contrôle vise le MÉCANISME, pas la formulation : un nombre montré
// à un visiteur ne doit jamais sortir de Math.random. C'est ce qui distingue
// une métrique périmée — qu'on corrige — d'une métrique fabriquée, qu'on
// retire. Les particules décoratives de 404.html emploient Math.random sans
// jamais alimenter de texte : elles ne déclenchent rien.
//
// Le second vise les chaînes déjà jugées, pour qu'un copier-coller ne les
// réintroduise pas. Elles sont liées à EmploiA ou à sa base d'utilisateurs,
// jamais à une statistique de marché : « 3× plus de réponses pour une offre
// publiée depuis moins de 2 jours » dans un article reste un énoncé éditorial,
// hors périmètre de ce garde.
console.log('\n[14] preuves sociales inventées — mécanisme et chaînes retirées');
try {
  const visibles = walk('.').filter(
    (p) => /\.(html|js)$/.test(p) && !p.includes('node_modules') && !p.startsWith('./scripts/'),
  );

  let simules = 0;
  for (const f of visibles) {
    const src = readAll(f);
    for (const m of src.matchAll(/Math\.random/g)) {
      const autour = src.slice(Math.max(0, m.index - 320), m.index + 320);
      if (/textContent|innerHTML|innerText/.test(autour)) {
        fail(`${f} : un nombre affiché au visiteur sort de Math.random — métrique fabriquée, pas périmée`);
        simules++;
      }
    }
  }

  // Chaque entrée porte ce qu'elle affirmait et pourquoi elle est partie.
  const RETIREES = [
    [/2\s?847/, 'nombre d\'utilisateurs inventé — retiré d\'employeurs.html par 9b214e0, puis de sa rangée STATS et d\'un email'],
    // Lié à un nombre, à « en ce moment » ou à « sur Emploia » : c'est un
    // décompte de notre base. « les candidats actifs qui postulent à 20+
    // offres/semaine » dans un article décrit un type de candidat, pas notre
    // audience — ce n'est pas une preuve sociale, et ce n'est pas visé.
    [/(?:\d[\d\s]*candidats actifs|candidats actifs (?:en ce moment|sur Emploia))/i, 'décompte de notre base d\'utilisateurs, qu\'aucune mesure ne soutient'],
    [/taux de réponse vs LinkedIn/i, 'comparaison chiffrée contre un concurrent nommé, sans mesure — publicité comparative illicite'],
    [/offres analys[ée]es aujourd'hui/i, 'volume quotidien inventé, présenté comme une donnée du jour'],
    [/Emploia[^.<]{0,140}(?:×|x)\s*plus d'entretiens/i, 'effet d\'Emploia sur les entretiens, jamais mesuré'],
    [/(?:×|x)\s*plus d'entretiens[^.<]{0,60}Emploia/i, 'même affirmation, formulée dans l\'autre sens'],
    [/\d+\s*offres personnalis[ée]es par jour/i, 'plafond quotidien inventé — le palier payant est illimité (auth.js)'],
  ];
  let revenues = 0;
  for (const f of visibles) {
    const src = readAll(f);
    for (const [re, motif] of RETIREES) {
      const m = src.match(re);
      if (m) { fail(`${f} : « ${m[0].slice(0, 60)} » — ${motif}`); revenues++; }
    }
  }

  if (!simules && !revenues) ok(`${visibles.length} fichiers servis — aucun nombre affiché issu du hasard, aucune affirmation retirée revenue`);
} catch (e) { fail('contrôle des preuves sociales impossible : ' + e.message); }
// ── 15. tout test du dépôt est effectivement lancé par un workflow ─────────
// Un *.test.mjs que rien ne lance est un garde-fou qui ne garde rien : il
// passe au vert sur le poste de qui l'écrit, puis plus personne ne le rejoue.
// C'est l'état dans lequel scripts/billing/email.test.mjs est resté — déclaré
// deux fois dans package.json, lancé par aucun workflow — alors qu'il couvre
// deux régressions nommées dans son en-tête : le reply_to absent, qui invite
// le client à répondre depuis une boîte inexistante, et le `.catch(() => {})`
// qui avalait les refus de Resend.
//
// Même famille que la garde des assertions de la sonde : un contrôle qui
// existe sans tourner là où il attraperait quelque chose ne coûte rien à
// laisser dériver, et ne se remarque qu'au moment où il aurait servi.
console.log('\n[15] chaque *.test.mjs est lancé par un workflow');
try {
  const tests = fs.existsSync('scripts') ? walk('scripts').filter(f => f.endsWith('.test.mjs')) : [];
  const pkgScripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts || {};

  // Un workflow peut appeler un test directement (node scripts/…) ou passer
  // par un script npm qui en chaîne plusieurs — `test:billing` en lance cinq.
  // Les deux formes comptent, sinon la garde réclamerait un câblage en double.
  const invoked = new Set();
  const seen = new Set();
  const scan = (cmd) => {
    for (const m of cmd.matchAll(/node\s+(scripts\/[\w./-]+\.mjs)/g)) invoked.add(m[1]);
    for (const m of cmd.matchAll(/npm\s+run\s+([\w:-]+)/g)) {
      if (seen.has(m[1])) continue; // un script qui s'appelle lui-même ne boucle pas
      seen.add(m[1]);
      if (pkgScripts[m[1]]) scan(pkgScripts[m[1]]);
    }
  };

  const wfDir = '.github/workflows';
  const workflows = fs.existsSync(wfDir)
    ? fs.readdirSync(wfDir).filter(n => /\.ya?ml$/.test(n))
    : [];
  if (!workflows.length) fail('aucun workflow dans .github/workflows — motif à revoir');
  for (const w of workflows) scan(fs.readFileSync(`${wfDir}/${w}`, 'utf8'));

  const dormants = tests.filter(t => !invoked.has(t));
  for (const t of dormants) {
    fail(`${t} n'est lancé par aucun workflow — l'ajouter au job guards de .github/workflows/ci.yml, sinon ce test ne garde rien`);
  }
  if (!tests.length) fail('aucun *.test.mjs trouvé sous scripts/ — motif à revoir');
  else if (!dormants.length) ok(`${tests.length} tests, tous lancés par ${workflows.length} workflows`);
} catch (e) { fail('contrôle des tests dormants impossible : ' + e.message); }

// ── 15. le type de contrat est lu, jamais fabriqué ─────────────────────────
// Dans l'esprit du garde [3] : des régressions dont on ne veut plus.
//
// `detectType()` finissait par `return 'CDI'` et recevait le filtre de
// recherche en second argument, qu'il renvoyait tel quel pour TOUTES les
// offres. Deux conséquences, chacune mesurée : une offre au contrat inconnu
// était publiée comme un CDI (217 sur 311 d'un relevé venaient de cette seule
// ligne), et sous filtre « CDD » chaque offre rendue portait l'étiquette
// « CDD » quel que soit son contrat réel. L'étiquette était une fonction de la
// requête, pas de la donnée.
//
// Les deux défauts sont de la même famille : une affirmation sans lecture. Le
// garde est structurel pour qu'ils ne puissent pas revenir par inadvertance —
// la sonde `npm run test:causes` / `test:contrat` vérifie le comportement, ce
// garde vérifie la forme, qui est ce qui se dégrade en silence sous une
// correction pressée.
console.log('\n[16] type de contrat : lu depuis la donnée, jamais depuis la requête');
try {
  const jobsSrc = readAll('api/jobs.js');
  const libContrat = readAll('api/_lib/contrat.js');
  const sansCommentaires = (t) => t.replace(/^\s*\/\/.*$/gm, '');
  let bad14 = 0;

  if (!libContrat) {
    fail('api/_lib/contrat.js absent — la lecture du contrat doit rester partagée entre api/jobs.js et les alertes');
    bad14++;
  }

  // (1) Le point qui compte : `detectType` ne PEUT PLUS recevoir le filtre.
  // Une signature à un paramètre rend le défaut inexprimable, au lieu de
  // compter sur la relecture des cinq sites d'appel.
  const sig = /function detectType\(([^)]*)\)/.exec(libContrat || '');
  if (!sig) { fail('detectType introuvable dans api/_lib/contrat.js'); bad14++; }
  else if (sig[1].includes(',')) {
    fail(`detectType prend plus d'un paramètre (${sig[1].trim()}) — le filtre de recherche ne doit pas pouvoir l'atteindre`);
    bad14++;
  }

  // (2) Aucun site d'appel ne lui passe deux arguments, dans tout api/. Les
  // commentaires sont retirés d'abord : ils citent l'ancienne signature pour
  // expliquer ce qui a été retiré, et un garde qui se déclenche sur sa propre
  // documentation finit par être désarmé.
  for (const f of apiFiles) {
    for (const m of sansCommentaires(readAll(f)).matchAll(/detectType\(([^)]*)\)/g)) {
      if (m[1].includes(',')) {
        fail(`${f} : detectType appelé avec un second argument (${m[1].trim()}) — l'étiquette redeviendrait fonction de la requête`);
        bad14++;
      }
    }
  }

  // (3) `detectType` finit par `return null`. Un contrat inconnu est une
  // information manquante, pas un CDI.
  const i = (libContrat || '').indexOf('function detectType(');
  if (i >= 0) {
    const corps = libContrat.slice(i, libContrat.indexOf('\n}', i));
    if (!/return null;\s*$/.test(corps.trim())) {
      fail("detectType ne finit plus par `return null` — un contrat inconnu redeviendrait un contrat affirmé");
      bad14++;
    }
    if (/^\s*return\s+'(CDI|CDD|Stage|Alternance|Freelance)';/m.test(corps)) {
      fail('detectType a une branche inconditionnelle qui rend un contrat');
      bad14++;
    }
  }

  // (4) Le filtre de contrat doit être APPLIQUÉ, pas seulement propagé. C'était
  // le vrai point B : le filtre n'existait nulle part et l'étiquette était
  // réécrite pour faire croire qu'il avait agi.
  if (!/function filtrerContrat\(/.test(jobsSrc)) {
    fail('api/jobs.js n\'a plus de filtrerContrat — un filtre de contrat doit être appliqué sur la donnée reçue');
    bad14++;
  } else {
    const pose = jobsSrc.indexOf('filtrerContrat(pertinence.jobs, type)');
    const cache = jobsSrc.indexOf('kvSet(cacheKey');
    if (pose < 0) { fail('filtrerContrat n\'est pas appelé dans le handler'); bad14++; }
    else if (cache >= 0 && pose > cache) {
      fail('filtrerContrat est appelé après la mise en cache — l\'entrée de cache porterait des offres non filtrées');
      bad14++;
    }
  }

  // (5) Une durée de travail n'est pas un contrat. `full_time → CDI` est la
  // faute de catégorie que commet la table JOB_TYPES du front ; `type:
  // 'Remote'` en était une autre. Ni l'une ni l'autre ne doit entrer dans le
  // champ contrat côté API.
  const codeJobs = sansCommentaires(jobsSrc) + sansCommentaires(libContrat || '');
  if (/(full_?time|part_?time|FULLTIME|PARTTIME)\s*:\s*'(CDI|CDD|Stage|Alternance|Freelance)'/i.test(codeJobs)) {
    fail('une durée de travail est cartographiée vers un contrat (full_time → CDI) — deux dimensions distinctes');
    bad14++;
  }
  if (/type:\s*'Remote'/.test(codeJobs)) {
    fail("type: 'Remote' — un mode de travail dans le champ contrat ; le champ `remote` le porte déjà");
    bad14++;
  }

  // (6) Le salaire : l'ancien garde testait la véracité de la borne basse, pas
  // son ordre de grandeur, et `0k–0k€/an` s'affichait sur /jobs. La
  // vérification doit porter sur la sortie.
  if (/Math\.round\(j\.salary_min\s*\/\s*1000\)/.test(jobsSrc)) {
    fail('api/jobs.js arrondit le salaire en ligne — passer par formaterSalaireAnnuel, qui vérifie la sortie');
    bad14++;
  }
  if (!/function formaterSalaireAnnuel\(/.test(libContrat || '')) {
    fail('formaterSalaireAnnuel absent — le garde du 0k–0k doit porter sur la sortie, en un seul endroit');
    bad14++;
  }

  // (7) `salary_is_predicted` se compare, il ne se teste pas : les réponses
  // publiées le donnent comme la chaîne "0" chez certains clients, et
  // `Boolean("0") === true` marquerait toutes les offres comme estimées.
  if (/if\s*\(\s*j?\.?salary_is_predicted\s*\)/.test(codeJobs)) {
    fail('salary_is_predicted est lu par véracité — Boolean("0") est true, toutes les offres seraient marquées estimées');
    bad14++;
  }
  // (7 bis) Une fourchette estimée est AFFICHÉE, et marquée comme estimée. Les
  // deux moitiés de la décision sont vérifiées ensemble, parce que chacune
  // seule est une faute : l'émettre sans la marquer attribue à un employeur un
  // chiffre qu'il n'a pas publié ; ne pas l'émettre prive le candidat d'un
  // ordre de grandeur réel.
  if (/salary:\s*estime\s*\?\s*null/.test(codeJobs)) {
    fail('un salaire estimé est supprimé au lieu d\'être marqué — le candidat perd un ordre de grandeur réel');
    bad14++;
  }
  if (!/salaryEstimated/.test(codeJobs)) {
    fail('salaryEstimated absent — rien ne distinguerait plus un montant publié d\'une estimation d\'Adzuna');
    bad14++;
  }

  // (8) La pastille de type du front est conditionnelle, et son repli de
  // couleur n'est pas celui du CDI. `esc(null)` rend '' : une pastille
  // inconditionnelle donnait une puce bleue vide, et le bleu est la couleur du
  // CDI — le défaut avait une seconde incarnation, visuelle.
  const front = readAll('jobs.html');
  // Commentaires retirés une fois pour toutes : CSS et JS citent les libellés
  // interdits pour dire qu'ils le sont, et un garde qui se déclenche sur sa
  // propre documentation finit par être désarmé.
  const frontCode = front.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  if (front) {
    if (/<span class="jb-badge \$\{typeBadgeClass\(job\.type\)\}">\$\{esc\(job\.type\)\}<\/span>/.test(front) &&
        !/\$\{job\.type \? `<span class="jb-badge/.test(front)) {
      fail('jobs.html affiche la pastille de type sans condition — un type absent donnerait une pastille vide');
      bad14++;
    }
    if (/\}\[type\]\s*\|\|\s*'jb-type-blue'/.test(front)) {
      fail("jobs.html : typeBadgeClass retombe sur 'jb-type-blue', la couleur du CDI — un type inconnu s'afficherait en CDI");
      bad14++;
    }
    // Un salaire estimé doit être visuellement distinct du badge gris des
    // montants annoncés, et porter la mention. Le même badge pour les deux
    // rendrait la distinction invisible, donc inutile.
    // On vise le site d'ÉMISSION du badge, pas la feuille de style : une règle
    // CSS orpheline laisserait le garde vert pendant que la carte rend du gris.
    if (!/salaryEstimated[\s\S]{0,80}?jb-badge-estime/.test(frontCode)) {
      fail('jobs.html : le badge estimé n\'est pas branché sur salaryEstimated — une estimation d\'Adzuna se lirait comme le salaire de l\'employeur');
      bad14++;
    }
    if (!/estimation Adzuna/.test(frontCode)) {
      fail('jobs.html : la mention « estimation Adzuna » est absente du rendu');
      bad14++;
    }
    if (/salaire propos/i.test(frontCode)) {
      fail('jobs.html : le libellé « salaire proposé » apparaît — une estimation d\'un tiers n\'est pas une proposition de l\'employeur');
      bad14++;
    }
    // La couverture du contrat doit venir de la réponse HTTP, pas d'un
    // recomptage client sur une liste que `limit` peut avoir tronquée.
    if (!/data\.couvertureContrat/.test(front)) {
      fail('jobs.html n\'affiche pas la couverture du contrat — le chiffre resterait dans les journaux Vercel, retenus une heure');
      bad14++;
    }
    if (!/contrat confirmé/.test(front)) {
      fail('jobs.html : la ligne « n offres au contrat confirmé sur m » est absente');
      bad14++;
    }
  }

  // (8 bis) `sansContrat` sort du journal et entre dans la réponse. Un
  // `console.error` ne vit qu'une heure sur le plan Hobby : c'est le défaut que
  // `causesEnEchec` vient de corriger, et le laisser revenir pour la couverture
  // du contrat serait reculer sur le même point.
  // Le test porte sur le PAYLOAD de la réponse, pas sur la présence du mot
  // dans le fichier : une variable calculée puis jamais rendue laisserait le
  // chiffre exactement là où il était, dans les journaux.
  if (!/JSON\.stringify\(\{[^}]*couvertureContrat/.test(jobsSrc)) {
    fail('couvertureContrat n\'est pas dans la réponse HTTP — la couverture ne serait lisible que dans les journaux Vercel, retenus une heure');
    bad14++;
  } else {
    // Les DEUX réponses, pas une : le handler rend soit l'agrégat frais, soit
    // l'entrée de cache, et une couverture présente d'un seul côté
    // disparaîtrait une requête sur deux sans que rien ne le signale.
    const payloads = [...jobsSrc.matchAll(/JSON\.stringify\(\{[^}]*\}\)/g)].map(m => m[0]);
    const avecJobs = payloads.filter(p => /jobs: final/.test(p));
    const sansCouverture = avecJobs.filter(p => !/couvertureContrat/.test(p));
    if (sansCouverture.length) {
      fail(`${sansCouverture.length} réponse(s) sur ${avecJobs.length} ne portent pas couvertureContrat — la couverture disparaîtrait selon le chemin pris (frais ou cache)`);
      bad14++;
    }
    // Les trois endroits, et c'est la leçon de causesEnEchec : la réponse
    // fraîche, l'entrée de cache, et la relecture du cache. Oublier le cache
    // ferait disparaître le chiffre pendant cinq minutes sur deux.
    if (!/kvSet\(cacheKey, \{[^}]*couvertureContrat/.test(jobsSrc)) {
      fail('couvertureContrat n\'entre pas en cache — la couverture disparaîtrait de la réponse pendant la fenêtre de cinq minutes');
      bad14++;
    }
    if (!/cached\.couvertureContrat/.test(jobsSrc)) {
      fail('la lecture du cache ne rend pas couvertureContrat');
      bad14++;
    }
    // Et une entrée ancienne vaut `null`, pas un objet à zéros : « 0 offre au
    // contrat inconnu » est l'affirmation la plus trompeuse possible ici.
    if (!/cached\.couvertureContrat \|\| null/.test(jobsSrc)) {
      fail('une entrée de cache sans couverture doit valoir null, jamais des zéros qui se liraient comme une mesure');
      bad14++;
    }
  }

  // (9) Les alertes email lisent la même notion que l'agrégateur. Elles
  // comparaient `job_types` à `full_time` / `temporary` / `apprenticeship`,
  // valeurs qui n'existent pas chez Arbeitnow : toute alerte typée filtrait à
  // zéro.
  const alertes = sansCommentaires(readAll('api/cron/send-alerts.js'));
  if (alertes && !/_lib\/contrat\.js/.test(alertes)) {
    fail('api/cron/send-alerts.js ne partage pas _lib/contrat.js — deux lectures divergentes du même champ');
    bad14++;
  }

  if (!bad14) {
    const appels = [...jobsSrc.matchAll(/detectType\(/g)].length;
    ok(`detectType à un seul paramètre, ${appels} appel(s) sans filtre, filtre de contrat appliqué avant le cache`,
       'salaire vérifié sur la sortie, pastille conditionnelle, alertes alignées');
  }
} catch (e) { fail('contrôle du type de contrat impossible : ' + e.message); }

// ── 15. image de partage : servie, raster, et à jour ──────────────────────
// Un lien d'EmploiA partagé sur TikTok, LinkedIn ou WhatsApp n'affichait
// aucune image, et de deux façons à la fois. 165 pages désignaient
// `opengraph.svg` : aucune plateforme n'accepte `image/svg+xml`. Les 4 autres,
// dont la page d'accueil, désignaient `og-image.svg` — un fichier qui n'existe
// pas, et qui répondait 404 en production.
//
// Le SVG reste la source éditable ; le PNG servi en est dérivé par
// `npm run assets:og`. Rien ne lie mécaniquement les deux, et c'est cette
// dérive qui a laissé l'image annoncer « Gratuit / 9€ » longtemps après les
// passages à 19 € puis 24 €, afficher `emploia.fr` — un domaine qui n'a jamais
// appartenu au projet — et répéter « 100% français », la formule que la sonde
// RGPD a retirée de 75 fichiers mais qu'elle ne pouvait pas voir ici : elle ne
// balaie que .html, .js, .css et .json.
//
// Ce garde compare une empreinte, pas des pixels : la CI n'a pas besoin de
// Chrome pour l'exécuter.
console.log('\n[15] image de partage — servie, raster et à jour');
try {
  const RASTER = /\.(png|jpe?g|webp|gif)$/i;
  const pages = walk('.').filter(
    (p) => p.endsWith('.html') && !p.includes('node_modules') && !p.includes('chrome-extension'),
  );
  let mauvais = 0, sans = 0;
  for (const f of pages) {
    const src = readAll(f);
    if (/name="robots"[^>]*noindex/.test(src)) continue;
    const m = src.match(/property="og:image"\s+content="([^"]+)"/);
    if (!m) { fail(`${f} : page indexable sans og:image — carte de partage sans visuel`); sans++; continue; }
    let chemin;
    try { chemin = new URL(m[1]).pathname; } catch { fail(`${f} : og:image « ${m[1]} » n'est pas une URL absolue`); mauvais++; continue; }
    const local = '.' + chemin;
    if (!exists(local)) { fail(`${f} : og:image vers ${chemin} — ce fichier n'existe pas, la carte restera vide`); mauvais++; continue; }
    if (!RASTER.test(chemin)) { fail(`${f} : og:image en ${chemin.split('.').pop()} — aucune plateforme ne rend ce format, il faut du PNG, JPEG ou WebP`); mauvais++; continue; }
    // Sans dimensions déclarées, Facebook et LinkedIn montrent une première
    // carte sans image, le temps de télécharger le fichier pour les déduire.
    if (!/property="og:image:width"/.test(src) || !/property="og:image:height"/.test(src)) {
      fail(`${f} : og:image sans og:image:width/height — première carte affichée sans visuel`);
      mauvais++;
    }
  }

  // Le PNG servi correspond-il encore au SVG source ?
  const { empreinteSvg, SVG, HASH } = await import('./assets/og-image.mjs');
  const enregistree = exists(HASH) ? readAll(HASH).trim() : null;
  const courante = empreinteSvg();
  if (enregistree !== courante) {
    fail(`${SVG} a changé depuis la dernière rasterisation (${enregistree ?? 'aucune empreinte'} ≠ ${courante}) — régénérer avec : npm run assets:og`);
    mauvais++;
  }

  if (!mauvais && !sans) ok(`toutes les pages indexables pointent vers une image servie et rasterisée, à jour avec ${SVG}`);
} catch (e) { fail("contrôle de l'image de partage impossible : " + e.message); }
// ── 17. l'alerte de régression SEO reste exerçable, et pas affaiblie ──────
// Même famille que le garde [15] : un contrôle câblé mais jamais exécuté ne
// garde rien. L'étape « Ouvrir une issue en cas d'échec » de
// seo-regression.yml n'avait jamais tourné une seule fois — le workflow audite
// la production, donc il ne tourne pas sur les pull requests, et sa condition
// exige un `schedule` en échec. Elle a été rendue exerçable : corps sorti dans
// un module, sonde hors ligne à chaque PR, étape de répétition à la demande.
//
// Le danger de cette ouverture est qu'elle rende l'alerte muette le jour où
// elle sert. Il suffirait que la condition réelle accepte l'entrée de
// répétition, que l'étape réelle hérite du drapeau, ou que le module aille
// chercher ce drapeau dans l'environnement — où une chaîne `'false'` est
// vraie. Ce garde est structurel pour qu'aucune des trois ne passe par
// inadvertance : la forme est ce qui se dégrade en silence sous une
// correction pressée.
console.log('\n[17] alerte de régression SEO : exerçable sans être affaiblie');
try {
  const MODULE = 'scripts/seo/alerte-regression.cjs';
  const CONDITION_REELLE = "if: failure() && github.event_name == 'schedule'";
  const wf = readAll('.github/workflows/seo-regression.yml');
  const moduleSrc = readAll(MODULE);
  let bad17 = 0;

  if (!moduleSrc) {
    fail(`${MODULE} absent — le corps de l'alerte doit vivre dans un module exerçable, pas inline dans le YAML`);
    bad17++;
  } else if (/process\.env/.test(moduleSrc)) {
    fail(`${MODULE} lit l'environnement — le mode répétition doit rester un paramètre, sinon une variable mal posée fait taire l'alerte`);
    bad17++;
  }

  if (!wf) {
    fail('.github/workflows/seo-regression.yml introuvable — motif à revoir');
    bad17++;
  } else {
    // Chaque étape du fichier commence par six espaces, un tiret, une espace.
    const etapes = wf.split(/\n {6}- /).slice(1);
    const reelle = etapes.find(e => /Ouvrir une issue en cas d/.test(e));
    const repetition = etapes.find(e => /repetition: true/.test(e));

    if (!reelle) { fail("l'étape « Ouvrir une issue en cas d'échec » a disparu de seo-regression.yml"); bad17++; }
    else {
      if (!reelle.includes(CONDITION_REELLE)) {
        fail(`la condition de l'alerte réelle n'est plus « ${CONDITION_REELLE} » — l'élargir pour la tester la ferait se déclencher à tort, la rétrécir la rendrait muette`);
        bad17++;
      }
      if (/repetition/.test(reelle)) {
        fail("l'étape d'alerte réelle mentionne la répétition — elle ne doit porter aucun interrupteur, sinon une entrée de workflow peut la faire taire");
        bad17++;
      }
      if (!reelle.includes(MODULE)) { fail(`l'étape d'alerte réelle n'appelle pas ${MODULE}`); bad17++; }
    }

    if (!repetition) { fail("l'étape de répétition a disparu — l'alerte redeviendrait intestable autrement qu'en attendant une panne"); bad17++; }
    else {
      if (!/github\.event_name == 'workflow_dispatch'/.test(repetition)) {
        fail("l'étape de répétition ne se limite pas au workflow_dispatch — elle doit être hors d'atteinte d'un `schedule`");
        bad17++;
      }
      if (!repetition.includes(MODULE)) {
        fail(`l'étape de répétition n'appelle pas ${MODULE} — elle répéterait autre chose que l'alerte réelle`);
        bad17++;
      }
    }

    const armements = (wf.match(/repetition: true/g) || []).length;
    if (armements !== 1) {
      fail(`${armements} étape(s) arment le mode répétition, une seule est attendue`);
      bad17++;
    }
  }

  if (!bad17) ok("condition de l'alerte réelle intacte, répétition réservée au workflow_dispatch, drapeau passé en paramètre");
} catch (e) { fail("contrôle de l'alerte de régression SEO impossible : " + e.message); }

if (fails) { console.error(`CI GUARDS: ${fails} problème(s) ✗`); process.exit(1); }
console.log('CI GUARDS: tout vert ✓');
