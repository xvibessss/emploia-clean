// Sonde du repli du filtre de pertinence.
//
// Ce que ce repli fait, et pourquoi il n'était pas un défaut en soi. Quand
// AUCUNE offre de l'agrégat ne correspond à la requête, `filtrerPertinence`
// rend la liste ENTIÈRE plutôt qu'une page blanche, étiquetée
// `filtre: 'abandonne'`. C'est une décision assumée, écrite dans `api/jobs.js` :
// « mieux vaut du bruit visible qu'un trou ».
//
// Elle tient à UNE condition, et c'est le mot « visible ». Il ne l'était pas.
// La seule trace du repli était un `console.error` dans les journaux Vercel,
// dont la rétention est d'une heure sur le plan Hobby, et un champ `filtre` que
// AUCUNE page ne lisait. Pendant ce temps :
//
//   jobs.html          annonçait « 14 offres pour "secrétaire" »
//   les 85 pages SEO   annonçaient « 14 offres trouvées »
//
// Les deux sont des affirmations que la donnée ne soutient pas — zéro de ces
// offres ne correspondait — et c'est exactement ce que `couvertureContrat` est
// venu retirer juste à côté, pour le type de contrat.
//
// MESURÉ le 2026-10-22 sur les 20 métiers que le site publie en SEO : le repli
// se déclenche sur UN d'entre eux (« secrétaire » — 14 offres servies, zéro
// pertinente), les 19 autres rendent `filtre: 'actif'` avec une pertinence
// pleine. Le repli est donc RARE, et c'est pourquoi il n'a pas été retiré : le
// catalogue est vide pour ce terme, pas le filtre fautif. Ce qui était fautif
// est le silence.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const racine = new URL('../../', import.meta.url);
const src = fs.readFileSync(new URL('api/jobs.js', racine), 'utf8');
const jobsHtml = fs.readFileSync(new URL('jobs.html', racine), 'utf8');

let passed = 0, failed = 0;
function check(label, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

function extraire(source, nom) {
  const i = source.indexOf(`function ${nom}(`);
  if (i < 0) return null;
  let p = 0;
  for (let j = source.indexOf('{', i); j < source.length; j++) {
    if (source[j] === '{') p++;
    else if (source[j] === '}' && --p === 0) return source.slice(i, j + 1);
  }
  return null;
}

// ── 1. LE REPLI, EXÉCUTÉ DEPUIS LE VRAI HANDLER ─────────────────────────────
// Les trois branches sont lues dans `api/jobs.js` et exécutées telles quelles :
// une copie de leur logique resterait verte en divergeant du handler.
console.log('\n── Les trois états du filtre ──');

const blocs = ['normaliser', 'motsDeRecherche', 'estPertinente', 'filtrerPertinence']
  .map(n => extraire(src, n));
check('les quatre fonctions du filtre sont extractibles', blocs.every(Boolean));

const motsVides = /const MOTS_VIDES = new Set\([^)]*\);/s.exec(src)?.[0];
check('MOTS_VIDES est lisible', Boolean(motsVides));

const bac = { console };
vm.createContext(bac);
vm.runInContext(`${motsVides}\n${blocs.join('\n')}\nthis.filtrerPertinence = filtrerPertinence; this.motsDeRecherche = motsDeRecherche; this.estPertinente = estPertinente;`, bac);
const { filtrerPertinence, motsDeRecherche } = bac;

const offre = (p = {}) => ({ title: 'Développeur Backend', company: 'Acme', location: 'Paris', description: 'Node.js', ...p });

const sansRequete = filtrerPertinence([offre(), offre()], '', '');
check('sans mot de recherche → inactif, rien n’est écarté',
  sansRequete.filtre === 'inactif' && sansRequete.jobs.length === 2);

const avecMatch = filtrerPertinence(
  [offre({ title: 'Boulanger Industriel' }), offre()], 'boulanger', '');
check('une offre correspond → actif, les autres sont écartées',
  avecMatch.filtre === 'actif' && avecMatch.jobs.length === 1,
  `${avecMatch.filtrees} écartée(s)`);

// LE cas de cette PR. Le repli ne doit pas changer : c'est son silence qui
// était le défaut, pas son existence.
const aucunMatch = filtrerPertinence([offre(), offre(), offre()], 'secretaire', '');
check('aucune offre ne correspond → abandonne, et la liste ENTIÈRE est rendue',
  aucunMatch.filtre === 'abandonne' && aucunMatch.jobs.length === 3,
  'une page SEO vide est la panne que ce repli évite');
check('sous repli, `filtrees` reste à zéro — rien n’a été écarté',
  aucunMatch.filtrees === 0);

// Une sous-chaîne suffit, et c'est voulu : « boulangerie » contient
// « boulanger ». Si ça cessait d'être vrai, le repli se déclencherait beaucoup
// plus souvent et cette PR aurait traité le symptôme.
check('la correspondance est une sous-chaîne — « boulangerie » retient « boulanger »',
  filtrerPertinence([offre({ title: 'Commis de boulangerie' })], 'boulanger', '').filtre === 'actif');
check('les mots de moins de quatre lettres sont ignorés',
  !motsDeRecherche('cdi', '').length);

// ── 2. LE HANDLER LE DIT ENCORE AUX JOURNAUX ────────────────────────────────
// La correction AJOUTE une visibilité, elle n'en retire pas.
console.log('\n── Le handler journalise toujours le repli ──');
check('le repli est journalisé côté serveur',
  /filtre abandonné pour q=/.test(src));
check('le champ `filtre` part dans la réponse fraîche',
  /filtre: pertinence\.filtre/.test(src));
check('et dans la réponse depuis le cache',
  /filtre: cached\.filtre \|\| 'inconnu'/.test(src));

// ── 3. jobs.html NE MENT PLUS ───────────────────────────────────────────────
console.log('\n── La page de recherche ──');

const avis = extraire(jobsHtml, 'avisPertinente') || extraire(jobsHtml, 'avisPertinence');
check('jobs.html porte une fonction d’avis sur le repli', Boolean(avis));
check('l’avis est piloté par le drapeau, pas deviné',
  /data\?\.filtre !== 'abandonne'/.test(avis || ''));
check('l’avis est rendu AU-DESSUS de la liste',
  /avisPertinence\(data, q, loc\) \+ filteredJobs\.map\(renderJob\)/.test(jobsHtml));

// `motsDeRecherche` tire ses mots de la requête ET du lieu : une page de ville
// sans offre déclenche donc le repli sans qu'aucun `q` n'ait été saisi, et
// « 0 offre pour "" » serait une phrase cassée. Les deux vides ne peuvent pas
// abandonner — ce qui est vérifié juste en dessous sur le vrai filtre.
check('la cible nommée est la requête OU le lieu',
  /const cible = q \|\| loc \|\| '';/.test(jobsHtml) && /\$\{q \|\| loc\}/.test(jobsHtml));
const surLieuSeul = filtrerPertinence([offre({ location: 'Paris' })], '', 'Carcassonne');
check('le repli se déclenche bien sur le lieu seul',
  surLieuSeul.filtre === 'abandonne');
check('sans requête NI lieu, le filtre est inactif et ne peut pas abandonner',
  filtrerPertinence([offre()], '', '').filtre === 'inactif');
check('l’avis dit ce que la liste est vraiment',
  /Aucune offre ne correspond/.test(avis || '') && /tous métiers confondus/.test(avis || ''));

// Le compteur de la page de recherche était la forme la PLUS explicite de
// l'affirmation fausse : « 14 offres pour "secrétaire" ».
check('le compteur consulte le drapeau avant d’affirmer',
  /const abandonne = data\.filtre === 'abandonne';/.test(jobsHtml));
check('sous repli, la page annonce zéro offre POUR la requête',
  /<strong>0<\/strong> offre pour/.test(jobsHtml));
check('hors repli, le compteur est inchangé',
  /<strong>\$\{total\.toLocaleString\('fr-FR'\)\}<\/strong> offres \$\{label\}/.test(jobsHtml));

// ── 4. AUCUNE PAGE N'AFFIRME PLUS UN COMPTEUR EN AVEUGLE ────────────────────
// L'invariant porte sur les 85 pages, pas sur un échantillon : c'est la seule
// façon qu'une page ajoutée dans six mois ne rouvre pas le défaut en silence.
console.log('\n── Les 85 pages du site ──');

function pagesHtml(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) pagesHtml(p, acc);
    else if (e.name.endsWith('.html')) acc.push(p);
  }
  return acc;
}

const dossier = fs.realpathSync(new URL('.', racine).pathname);
const pages = pagesHtml(dossier);
const muettes = [];
let avecCompteur = 0;
for (const f of pages) {
  for (const ligne of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!/getElementById\('jobCount'\)\.textContent\s*=/.test(ligne)) continue;
    // Une affectation à '' ou à « Aucune offre » n'affirme rien : elle n'a pas
    // besoin de consulter le drapeau.
    if (/=\s*''|'Aucune offre/.test(ligne)) continue;
    avecCompteur++;
    if (!/filtre/.test(ligne)) muettes.push(path.relative(dossier, f));
  }
}
check('des compteurs affirmatifs existent bien dans les pages',
  avecCompteur >= 80, `${avecCompteur} compteurs sur ${pages.length} pages`);
check('AUCUN compteur n’affirme sans consulter `filtre`',
  muettes.length === 0,
  muettes.length ? `${muettes.length} page(s) : ${muettes.slice(0, 4).join(', ')}…` : 'les 85 consultent le drapeau');

// Les pages de ville annoncent « N offres à <Ville> » : même affirmation, même
// exigence, et leur libellé de ville est conservé hors repli.
const ville = pages.find(f => /emploi\/rouen\.html$/.test(f));
if (ville) {
  const s = fs.readFileSync(ville, 'utf8');
  check('une page de ville garde son libellé hors repli',
    /offres à Rouen/.test(s) && /filtre === 'abandonne'/.test(s));
}

if (failed) { console.error(`\n❌ sonde du repli de pertinence : ${failed} échec(s) sur ${passed + failed}\n`); process.exit(1); }
console.log(`\n✅ sonde du repli de pertinence : ${passed} vérifications OK\n`);
