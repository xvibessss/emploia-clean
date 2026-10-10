// Sonde de surface : sonde TOUTE la production, pas sept pages choisies.
//
//   node scripts/smoke/surface.mjs                  # emploia.eu
//   node scripts/smoke/surface.mjs https://autre    # autre base
//
// Pourquoi ce script existe. Deux pannes ont vécu quatre mois en production
// sans que rien ne les voie : `/legal` répondait 200 en servant une page
// vide, et `/api/jobs` renvoyait 500 depuis le 23 mai 2026. Aucune n'était
// détectable par `smoke/prod.mjs`, qui vérifie sept pages nommées à la main.
//
// La leçon : un code 200 ne prouve rien. On mesure donc le contenu réellement
// servi, et on parcourt la surface entière — 75 handlers d'API et ~190 routes
// de page — pour qu'une régression nouvelle ressorte seule.
//
// Lecture seule, GET non authentifié. Les endpoints cron contrôlent tous
// CRON_SECRET avant d'agir (vérifié) : aucun envoi d'email n'est déclenché.
//
// Trois niveaux d'exigence, du plus faible au plus fort :
//   [1] l'API répond        — attrape un handler qui lève (c'était /api/jobs)
//   [2] la page est remplie — attrape une coquille vide (c'était /legal)
//   [3] l'API répond QUELQUE CHOSE — attrape un endpoint qui renvoie 200 avec
//       une liste vide. Un 200 creux est invisible aux deux premiers niveaux :
//       le handler vit, la page qu'il alimente se charge, et l'utilisateur voit
//       « Aucune offre trouvée ». C'est la panne la plus coûteuse du lot parce
//       que c'est la seule qui ne ressemble pas à une panne.

import fs from 'node:fs';
import { execSync } from 'node:child_process';

const BASE = (process.argv.find((a) => a.startsWith('http')) || 'https://emploia.eu').replace(/\/$/, '');
const TIMEOUT = 20000;
const CONCURRENCY = 8;

// Un corps de page sous ce seuil est vide en pratique, quel que soit le code
// HTTP. C'est la mesure qui aurait attrapé /legal.
const MIN_WORDS = 80;

// Exemptions, chacune avec sa raison. Une sonde qui signale douze faux
// positifs est une sonde qu'on cesse de lire : la liste est donc explicite,
// et toute route absente d'ici doit être saine.
const EXEMPT = {
  // Protégées par un secret : un 401/403 est le comportement correct.
  '/admin': 'console admin, rendue après authentification côté client',
  '/admin/stats': 'protégée par ADMIN_SECRET — 403 attendu',
  // Pas du HTML : ni <title> ni <h1> n'ont de sens.
  '/robots.txt': 'fichier texte',
  '/sitemap.xml': 'flux XML',
  '/rss.xml': 'flux RSS',
  // Pages applicatives : la coquille est légère, le contenu vient du JS après
  // authentification. Leur panne se verrait sur /api/*, pas ici.
  '/nps': 'formulaire court, rendu au clic depuis un email',
  '/reset-password': 'formulaire minimal, atteint par lien signé',
  '/recherche': 'résultats chargés en JS',
};

let failed = 0;
const ko = (m, d) => { failed++; console.error(`  ✗ ${m}${d ? ` — ${d}` : ''}`); };
const ok = (m, d) => console.log(`  ✓ ${m}${d ? ` — ${d}` : ''}`);

async function mapLimit(items, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) {
      const item = items[i++];
      try { out.push(await fn(item)); }
      catch (e) { out.push({ item, status: e.name === 'TimeoutError' ? 'TIMEOUT' : 'ERR', error: e.message }); }
    }
  }));
  return out;
}

// ── Les routes, lues depuis le dépôt plutôt qu'écrites à la main ────────────
// Une liste tapée à la main se périme dès la prochaine page ajoutée, et c'est
// précisément la page non listée qui tombe en panne sans témoin.
const apiRoutes = execSync("find api -name '*.js' -not -path '*/_lib/*' -not -name '_*'")
  .toString().trim().split('\n')
  .map((f) => f.replace(/^api\//, '').replace(/\.js$/, ''))
  .sort();

const pageRoutes = [...new Set((JSON.parse(fs.readFileSync('vercel.json', 'utf8')).rewrites || [])
  .map((r) => r.source)
  .filter((s) => s && !s.startsWith('/api/') && !s.includes(':') && !s.includes('*')))].sort();

console.log(`\nSonde de surface — ${BASE}`);
console.log(`${apiRoutes.length} handlers d'API · ${pageRoutes.length} routes de page\n`);

// ── 1. API : un 500 est un bug, un 404 est un rewrite cassé ─────────────────
// 401, 403, 405 et 400 sont au contraire la preuve que le handler vit et
// refuse correctement un appel non authentifié ou de mauvaise méthode.
console.log("[1] API — aucun handler ne doit répondre 500 ni 404");
const apiResults = await mapLimit(apiRoutes, async (r) => {
  const res = await fetch(`${BASE}/api/${r}`, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT) });
  return { item: r, status: res.status };
});
const apiBad = apiResults.filter((x) => x.status === 500 || x.status === 404 || typeof x.status === 'string');
for (const x of apiBad.sort((a, b) => a.item.localeCompare(b.item))) {
  ko(`/api/${x.item}`, x.status === 500 ? 'HTTP 500 — le handler lève' : x.status === 404 ? 'HTTP 404 — rewrite cassé' : String(x.status));
}
if (!apiBad.length) ok(`les ${apiRoutes.length} handlers répondent`, 'aucun 500, aucun 404');

// ── 2. Pages : servies, et non vides ───────────────────────────────────────
console.log(`\n[2] Pages — 200, un <title>, un <h1>, et au moins ${MIN_WORDS} mots`);
const pageResults = await mapLimit(pageRoutes, async (p) => {
  const res = await fetch(BASE + p, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
  const body = await res.text();
  // On retire scripts et styles avant de compter : sinon une coquille vide
  // portant 40 Ko de JavaScript passerait pour une page remplie.
  const words = body
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/).filter(Boolean).length;
  return { item: p, status: res.status, words, hasH1: /<h1[\s>]/i.test(body), hasTitle: /<title>\s*\S/i.test(body) };
});

let exempted = 0;
const pageBad = [];
for (const x of pageResults) {
  const why = [
    x.status !== 200 && `HTTP ${x.status}`,
    x.words < MIN_WORDS && `${x.words} mots seulement`,
    !x.hasH1 && 'pas de <h1>',
    !x.hasTitle && 'pas de <title>',
  ].filter(Boolean);
  if (!why.length) continue;
  if (EXEMPT[x.item]) { exempted++; continue; }
  pageBad.push({ ...x, why });
}
for (const x of pageBad.sort((a, b) => a.words - b.words)) ko(x.item, x.why.join(' · '));
if (!pageBad.length) ok(`les ${pageResults.length - exempted} pages contrôlées sont servies et remplies`, `${exempted} exemptées`);

// Une exemption devenue inutile cache une page redevenue saine : la signaler
// garde la liste honnête plutôt que de la laisser grossir.
const stale = Object.keys(EXEMPT).filter((p) => {
  const r = pageResults.find((x) => x.item === p);
  return r && r.status === 200 && r.words >= MIN_WORDS && r.hasH1 && r.hasTitle;
});
if (stale.length) console.log(`  ! ${stale.length} exemption(s) devenue(s) inutile(s) — à retirer d'EXEMPT : ${stale.join(', ')}`);

// ── 3. Contenu des API de lecture : 200 ne suffit pas ───────────────────────
// Un endpoint de liste qui répond 200 avec zéro élément a toutes les
// apparences de la santé : le contrôle [1] le voit répondre, la page qu'il
// alimente se charge sans erreur. L'utilisateur, lui, voit une page vide.
//
// Chaque sonde dit donc ce que la réponse doit CONTENIR, et nomme ce qui casse
// à l'écran quand elle est vide — pour qu'un échec se lise sans ouvrir le code.
const CONTENT_PROBES = [
  {
    path: '/api/jobs?q=developpeur',
    expect: (d) => Array.isArray(d.jobs) && d.jobs.length > 0,
    describe: (d) => `${(d.jobs || []).length} offre(s)` + (d.demo ? ' — MAIS demo:true, ce sont les offres de secours' : ''),
    // Un repli sur les 15 offres codées en dur masquerait la panne des sources.
    alsoFail: (d) => (d.demo === true ? 'demo:true — les sources réelles ont toutes échoué, la page sert le jeu de secours' : null),
    breaks: '/jobs — la recherche d’emploi, le cœur du produit',
  },
  {
    // Les 86 pages SEO appellent désormais /api/jobs. Cette sonde reproduit
    // leur appel au caractère près — DEFAULT_QUERY d'une page métier, plus le
    // `&limit=18` que le gabarit envoie — parce que la sonde ci-dessus
    // (`q=developpeur`, sans limit) n'emprunte pas le même chemin de code et
    // ne verrait pas une régression du paramètre `limit`.
    path: '/api/jobs?q=' + encodeURIComponent('aide-soignant santé EHPAD hôpital') + '&limit=18',
    expect: (d) => Array.isArray(d.jobs) && d.jobs.length > 0 && d.jobs.length <= 18,
    describe: (d) => `${(d.jobs || []).length} offre(s) pour limit=18`,
    // Un repli sur les offres de secours rendrait les 86 pages identiques
    // entre elles : quinze annonces parisiennes sur /emploi/limoges.
    alsoFail: (d) => (d.demo === true ? 'demo:true — les sources réelles ont toutes échoué, les 86 pages servent le même jeu de secours' : null),
    breaks: 'les 86 pages indexées — 48 /emploi/<ville>, 37 /metier/<métier> et /recherche affichent « Aucune offre trouvée »',
  },
  {
    // Le contrat de `limit` : la borne est exacte, pas approchée. La requête
    // sans `limit` est déjà couverte par la première sonde ; celle-ci ne
    // vérifie que la troncature, qui est le seul comportement ajouté.
    path: '/api/jobs?q=developpeur&limit=3',
    expect: (d) => Array.isArray(d.jobs) && d.jobs.length === 3,
    describe: (d) => `${(d.jobs || []).length} offre(s) — borne respectée`,
    breaks: 'la mise en page des 86 pages SEO — elles dessinent 18 cartes, pas 87',
  },
  {
    // Le filtre de pertinence, vu de l'extérieur. Deux collecteurs (Remotive,
    // Arbeitnow) ignorent le terme de recherche et servaient le même bloc de
    // 11 offres sur les 86 pages. La sonde vérifie que ce bloc a disparu d'une
    // requête métier précise, et que la page n'est pas vide pour autant.
    path: '/api/jobs?q=' + encodeURIComponent('coiffeur coiffure salon') + '&limit=18',
    expect: (d) => Array.isArray(d.jobs) && d.jobs.length > 0
      && !d.jobs.some((j) => /Inside Sales Contractor|Service Desk Engineer|Senior Consultant \(m\/w\/d\)/i.test(j.title || '')),
    describe: (d) => `${(d.jobs || []).length} offre(s), filtre=${d.filtre}`,
    // `abandonne` signifie qu'aucune offre ne correspondait et que l'agrégat
    // brut a été servi : la page n'est pas vide, mais le bruit est de retour.
    // Ce n'est pas une panne — c'est le repli qui fait son travail — et c'est
    // la mesure qui dira si le filtre est trop strict pour cette requête.
    alsoFail: (d) => (d.filtre === 'abandonne'
      ? 'filtre abandonné — aucune offre ne correspondait, l’agrégat brut est servi : bruit de retour sur cette page'
      : null),
    breaks: 'la pertinence des 86 pages — un bloc d’offres identique sur toute la surface indexée est du quasi-dupliqué aux yeux de Google',
  },
  {
    // Une page de ville, qui est le cas que le filtre aurait pu casser.
    // Mesuré en production avant d'être écrit ici (annexe 3 de
    // AUDIT-flux-offres-2026-10-10.md) : six villes gardent entre 47,6 % et
    // 63,3 % de leurs offres, soit 10 à 19 annonces mentionnant réellement la
    // ville. Le repli `abandonne` ne se déclenche sur aucune.
    //
    // Le seuil est volontairement bas — 5 offres, là où la mesure la plus
    // faible en donne 10. Une sonde calée au ras de la mesure du jour rougit
    // à la première variation normale des sources et finit par être ignorée ;
    // celle-ci ne rougit que si la page devient réellement maigre.
    path: '/api/jobs?q=Perpignan&location=Perpignan&limit=18',
    expect: (d) => Array.isArray(d.jobs) && d.jobs.length >= 5,
    describe: (d) => `${(d.jobs || []).length} offre(s), filtre=${d.filtre}`,
    // Si `abandonne` apparaît ici, c'est que plus aucune offre ne mentionne la
    // ville — typiquement France Travail et Adzuna tombés en même temps, les
    // deux seules sources qui honorent `location`. La page n'est pas vide,
    // mais elle rend le bloc fixe commun aux 48 villes.
    alsoFail: (d) => (d.filtre === 'abandonne'
      ? 'filtre abandonné sur une requête de ville — les sources qui honorent `location` sont tombées, les 48 pages de villes servent à nouveau le même bloc'
      : null),
    breaks: 'les 48 pages /emploi/<ville> — leur contenu propre est ce qui les distingue aux yeux de Google',
  },
  {
    path: '/api/rss',
    expect: (_d, body) => (body.match(/<item>/g) || []).length > 0,
    describe: (_d, body) => `${(body.match(/<item>/g) || []).length} article(s)`,
    breaks: '/rss.xml — le flux que les agrégateurs lisent',
  },
  {
    path: '/api/sitemap',
    expect: (_d, body) => (body.match(/<url>/g) || []).length > 50,
    describe: (_d, body) => `${(body.match(/<url>/g) || []).length} URL`,
    breaks: '/sitemap.xml — ce que Google explore',
  },
];

console.log('\n[3] API de lecture — la réponse doit contenir quelque chose');
for (const probe of CONTENT_PROBES) {
  let res, body;
  try {
    res = await fetch(BASE + probe.path, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
    body = await res.text();
  } catch (e) {
    ko(probe.path, `${e.name === 'TimeoutError' ? `pas de réponse en ${TIMEOUT / 1000}s` : e.message} — casse ${probe.breaks}`);
    continue;
  }
  if (res.status !== 200) { ko(probe.path, `HTTP ${res.status} — casse ${probe.breaks}`); continue; }

  // Les flux XML n'ont pas de JSON : on passe un objet vide et on lit le corps.
  let data = {};
  try { data = JSON.parse(body); } catch {}

  if (!probe.expect(data, body)) {
    ko(probe.path, `200 mais réponse vide (${probe.describe(data, body)}) — casse ${probe.breaks}`);
    continue;
  }
  const extra = probe.alsoFail?.(data, body);
  if (extra) { ko(probe.path, `${extra} — dégrade ${probe.breaks}`); continue; }
  ok(probe.path, probe.describe(data, body));
}

console.log(`\n${failed ? '❌' : '✅'} ${failed} problème(s) sur ${apiRoutes.length + pageRoutes.length} routes et ${CONTENT_PROBES.length} sondes de contenu\n`);
process.exit(failed ? 1 : 0);
