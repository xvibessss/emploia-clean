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

console.log(`\n${failed ? '❌' : '✅'} ${failed} problème(s) sur ${apiRoutes.length + pageRoutes.length} routes\n`);
process.exit(failed ? 1 : 0);
