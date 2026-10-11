// Sonde de localisation des données.
//
// Les formulations de cette page sont opposables par un DPO d'établissement :
// c'est la première chose qu'il contrôle, et une promesse fausse découverte au
// service juridique tue un dossier plus sûrement qu'un prix élevé. Cette sonde
// verrouille les deux pièges symétriques :
//
//   1. réaffirmer un hébergement « 100% français » que le recours à Anthropic
//      rend faux ;
//   2. promettre qu'« aucune donnée ne quitte la France », ce que le routage et
//      la terminaison TLS du réseau edge de Vercel rendent faux même après
//      épinglage des fonctions sur cdg1.
//
// L'épinglage lui-même est vérifié par scripts/ci-guards.mjs, qui échoue sur
// tout handler Edge sans regions: ['cdg1'].
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

let passed = 0, failed = 0;
function check(label, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

console.log('\nSonde de localisation des données\n');

// ── 1. Aucune page ne réaffirme les formulations retirées ───────────────────
// Balayage de tout le site : la formule « 100% français » était répétée 94 fois
// dans 75 fichiers, dont 76 occurrences du même pied de page d'article de blog.
// Un seul fichier oublié suffit à redonner tort à la page écoles.
console.log('[A] Le site entier ne réaffirme plus les formules invérifiables');
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(new URL(`../../${dir}`, import.meta.url), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const rel = `${dir}/${e.name}`.replace(/^\.\//, '');
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(html|js|css|json)$/.test(e.name)) out.push(rel);
  }
  return out;
};
const allFiles = walk('.');
const offenders = { '100% français': [], 'hébergé en France': [], 'données restent ici': [] };
for (const f of allFiles) {
  const src = read(f);
  if (/100% fran[çc]ais/i.test(src)) offenders['100% français'].push(f);
  if (/héberg\w*\s+(?:en|100%?)\s*fran/i.test(src)) offenders['hébergé en France'].push(f);
  // Les formules négatives sont cherchées comme *affirmations*. La page
  // /sous-traitants les mentionne volontairement pour les démentir (« nous
  // disons X, et non “aucune donnée ne quitte la France”, qui serait faux ») :
  // le démenti doit rester lisible sans faire échouer la sonde. On regarde
  // donc ce qui précède immédiatement chaque occurrence.
  const DISAVOWAL = /(?:non|pas|jamais|signifie pas|serait faux|plutôt que)\s*(?:qu)?\s*[«"'’]?\s*$/i;
  for (const re of [/vos données restent ici/gi, /aucune donnée ne quitte/gi, /aucun octet ne quitte/gi]) {
    for (const m of src.matchAll(re)) {
      const before = src.slice(Math.max(0, m.index - 40), m.index);
      if (!DISAVOWAL.test(before)) { offenders['données restent ici'].push(`${f} (« …${before.slice(-30)}${m[0]} »)`); }
    }
  }
}
for (const [claim, files] of Object.entries(offenders)) {
  check(`aucun « ${claim} » dans les ${allFiles.length} fichiers du site`, files.length === 0,
    files.length ? files.slice(0, 5).join(', ') : undefined);
}

// ── 2. La page écoles répond vraiment à la question du DPO ───────────────────
console.log('\n[B] ecoles.html dit la vérité sur les données');
const ecoles = read('ecoles.html');
check('la question « Où vont les données » est toujours posée', /Où vont les données/.test(ecoles));
check('Anthropic est nommé', /Anthropic/.test(ecoles));
check('les États-Unis sont nommés', /États-Unis/.test(ecoles));
check('le non-réentraînement est affirmé', /ne réentraîne pas ses modèles/.test(ecoles));
check('les clauses contractuelles types sont citées', /clauses contractuelles types/.test(ecoles));
check('la page /sous-traitants est liée', ecoles.includes('href="/sous-traitants"'));

// ── 3. La page /sous-traitants est complète et routable ─────────────────────
console.log('\n[C] /sous-traitants : contenu et routage');
const subs = read('sous-traitants.html');
const PROCESSORS = ['Anthropic', 'Vercel', 'Upstash', 'Resend', 'Stripe',
  'Plausible', 'France Travail', 'Adzuna', 'RapidAPI', 'Google'];
for (const p of PROCESSORS) check(`${p} figure dans la liste`, subs.includes(p));
check('la base de données est située à Francfort', /Francfort/.test(subs));
check('les colonnes exigées par un DPO sont présentes',
  ['Rôle', 'Données transmises', 'Pays', 'Base du transfert'].every((h) => subs.includes(h)));

// La nuance qui fait la différence entre crédible et pris en défaut.
check("la distinction épinglage / transit est explicite",
  /ne signifie pas qu'aucun octet ne quitte la France/.test(subs));

const vercelCfg = JSON.parse(read('vercel.json'));
check('/sous-traitants est routée dans vercel.json',
  (vercelCfg.rewrites || []).some((r) => r.source === '/sous-traitants' && r.destination === '/sous-traitants.html'));
check('/sous-traitants est dans le sitemap', /\/sous-traitants/.test(read('api/sitemap.js')));
check('la politique de confidentialité lie /sous-traitants',
  read('legal.html').includes('href="/sous-traitants"'));

if (failed) { console.error(`\n❌ sonde de localisation : ${failed} échec(s)\n`); process.exit(1); }
console.log(`\n✅ sonde de localisation : ${passed} vérifications OK\n`);
