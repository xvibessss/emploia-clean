// Garde hors ligne des assertions de la sonde de production.
//
// scripts/smoke/prod.mjs interroge un site déployé : il ne tourne donc pas
// dans la CI d'une PR, et c'est un choix assumé. Conséquence, quand un prix
// change dans un .html, rien ne signale que la sonde réclame encore l'ancien
// montant. La panne se révèle au prochain `npm run smoke:prod`, sous la forme
// d'un échec qui ressemble à une régression de prod alors que c'est la sonde
// qui est fausse — c'est exactement ce qui est arrivé au « 9 € » de /ecoles,
// resté dans la sonde trois jours après le passage au barème par tranches.
//
// Cette garde relit les mêmes couples (route, must, mustNot) — la table
// PAGE_ASSERTIONS elle-même, pas une copie — et les confronte aux fichiers du
// dépôt. Aucun accès réseau : elle tourne en CI sur chaque PR, et échoue au
// moment où le HTML et la sonde se contredisent, pas après la bascule.
//
// Elle ne remplace pas la sonde : elle atteste que la sonde dit la même chose
// que les pages sources. Que la prod serve bien ces pages reste le travail de
// `smoke:prod`.
//
// Hors périmètre : les sections [C] à [F] de la sonde (codes HTTP, sitemap,
// API admin, Stripe) ne portent pas d'aiguilles de contenu.
import fs from 'node:fs';
import { norm, PAGE_ASSERTIONS } from './assertions.mjs';

const ROOT = new URL('../../', import.meta.url);

let passed = 0, failed = 0;
const ok = (label, detail) => { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); };
const ko = (label, detail) => { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); };

const isFile = (rel) => { try { return fs.statSync(new URL(rel, ROOT)).isFile(); } catch { return false; } };

// Les rewrites à paramètre (/offre/:id) ne désignent pas une page unique.
// Aucune assertion n'en vise, et les écarter évite de résoudre un faux fichier.
const REWRITES = new Map(
  (JSON.parse(fs.readFileSync(new URL('vercel.json', ROOT), 'utf8')).rewrites || [])
    .filter((r) => !r.source.includes(':'))
    .map((r) => [r.source, r.destination]),
);

// Résout une route servie vers le fichier du dépôt qui la rend : le rewrite
// déclaré dans vercel.json s'il existe, puis les conventions de Vercel pour un
// site statique (/x → x.html, à défaut x/index.html, / → index.html).
function resolveRoute(route) {
  const dest = (REWRITES.get(route) ?? route).split('?')[0];
  const rel = dest.replace(/^\//, '');
  const candidates = rel === '' ? ['index.html'] : [rel, `${rel}.html`, `${rel}/index.html`];
  return candidates.find(isFile) ?? null;
}

console.log('\nGarde des assertions de scripts/smoke/prod.mjs (hors ligne)');

for (const { title, route, must = [], mustNot = [] } of PAGE_ASSERTIONS) {
  console.log(`\n${title}`);

  const file = resolveRoute(route);
  if (!file) {
    // Une route qu'aucun fichier ne rend : soit le rewrite manque dans
    // vercel.json, soit la page a été renommée sans toucher à la sonde.
    ko(`${route} → fichier du dépôt`, 'aucun fichier ne rend cette route, rewrites de vercel.json compris');
    continue;
  }
  ok(`${route} est rendue par ${file}`);

  const body = norm(fs.readFileSync(new URL(file, ROOT), 'utf8'));

  for (const needle of must) {
    if (body.includes(norm(needle))) ok(`${route} contient « ${needle} »`, file);
    else ko(`${route} doit contenir « ${needle} »`,
      `absent de ${file} — la sonde réclame une valeur que la page ne porte plus`);
  }
  for (const needle of mustNot) {
    if (!body.includes(norm(needle))) ok(`${route} ne contient plus « ${needle} »`, file);
    else ko(`${route} ne doit plus contenir « ${needle} »`,
      `toujours présent dans ${file} — la page a gardé une valeur que la sonde bannit`);
  }
}

if (failed) {
  console.error(`\n❌ garde des assertions : ${failed} échec(s) — ` +
    'mettre scripts/smoke/assertions.mjs et les pages concernées d’accord avant de merger\n');
  process.exit(1);
}
console.log(`\n✅ garde des assertions : ${passed} vérifications OK\n`);
