// Sonde du décompte par collecteur exposé par /api/jobs.
//
// Le trou que ce décompte vient fermer, relevé le 2026-10-21. La réponse
// portait deux listes, et elles ne sont pas dans le même vocabulaire :
//
//   sourcesEnEchec   les noms des COLLECTEURS  — 'JSearch', 'French Job Market'
//   sources          les étiquettes de PUBLISHER des offres survivantes, car
//                    elle est bâtie sur `final.map(j => j.source)` — et les
//                    offres de JSearch sortent sous « Indeed » ou « LinkedIn »
//
// On ne peut donc pas soustraire l'une de l'autre pour savoir quel collecteur
// n'a rien rendu. Un collecteur qui rend `[]` sans appeler `muet` n'apparaît ni
// dans l'une (il n'a pas échoué) ni dans l'autre de façon exploitable : il est
// invisible, et `smoke:sources` le déclarait vert.
//
// C'est la forme exacte de la panne que ce dépôt a déjà payée — /api/jobs-search
// a répondu 200 avec zéro offre pendant cinq mois.
//
// Le relevé l'a rencontrée sur Adzuna, absente des deux listes. La mesure a
// montré qu'Adzuna était SAINE : présente sur 6 requêtes sur 6, 4 à 10 offres
// chacune. C'est précisément ce qui rend le trou grave — rien ne permettait de
// le savoir sans mesurer à la main, et la même absence aurait eu l'air
// identique sur une source morte.
//
// Cette sonde est hors ligne : elle lit le vrai handler et exécute les
// fonctions extraites, sans réseau.
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../../api/jobs.js', import.meta.url), 'utf8');

let passed = 0, failed = 0;
function check(label, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

// ── 1. LES DEUX LISTES DE NOMS NE PEUVENT PAS DIVERGER ──────────────────────
// `COLLECTEURS` existe parce que le nom des collecteurs sert des deux côtés
// d'un retour anticipé : la liste d'appels, et le filtrage du décompte à la
// lecture du cache, qui se produit avant. Deux listes qu'on espère
// synchronisées finissent par diverger — ce fichier a déjà documenté ce que ça
// coûte (`?type=cdd` propagé par trois collecteurs sur huit).
console.log('\n── Les noms des collecteurs, déclarés une fois ──');

// La tranche va de la déclaration des noms à la fin du verrou, délimitée par
// équilibrage d'accolades : `contributionPublique` est définie APRÈS
// `borner_cause` et `causePublique`, donc une borne posée sur un nom de
// fonction intermédiaire la laisserait dehors.
function finDe(nom) {
  const i = src.indexOf(`function ${nom}(`);
  if (i < 0) return -1;
  let p = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') p++;
    else if (src[j] === '}' && --p === 0) return j + 1;
  }
  return -1;
}

const finVerrou = finDe('contributionPublique');
const bloc = src.slice(src.indexOf('const COLLECTEURS'), finVerrou);
const bac = { console };
vm.createContext(bac);
vm.runInContext(`${bloc}\nthis.COLLECTEURS = COLLECTEURS; this.contributionPublique = contributionPublique;`, bac);
const { COLLECTEURS, contributionPublique } = bac;

check('le verrou est délimitable dans le handler', finVerrou > 0);

check('COLLECTEURS est extractible du handler', Array.isArray(COLLECTEURS), `${COLLECTEURS?.length} noms`);

// Les noms réellement appelés, lus dans la liste d'appels du handler.
const appeles = [...src.matchAll(/\['([^']+)',\s+\(\) =>/g)].map(m => m[1]);
check('la liste d’appels porte exactement les noms déclarés',
  appeles.length === COLLECTEURS.length && appeles.every((n, i) => n === COLLECTEURS[i]),
  appeles.join(' → '));
check('aucun nom n’est déclaré en double',
  new Set(COLLECTEURS).size === COLLECTEURS.length);
// Adzuna est le collecteur qui a révélé le trou : sa présence dans le décompte
// est ce qui rend son zéro lisible au lieu d'invisible.
check('Adzuna est du nombre', COLLECTEURS.includes('Adzuna'));

// ── 2. LE DÉCOMPTE EST PRIS AVANT LES FILTRES ───────────────────────────────
// La question à laquelle il répond est « ce collecteur a-t-il rendu quelque
// chose », pas « l'utilisateur en a-t-il vu ». Pris après le dédoublonnage et
// les filtres, il confondrait « n'a rien rendu » et « a rendu, tout a été
// écarté » — les deux lectures qu'il existe pour séparer.
console.log('\n── Le décompte est pris sur ce que les collecteurs ont rendu ──');

const iDecompte = src.indexOf('const offresParCollecteur = Object.fromEntries(');
const iDedup = src.indexOf('deduplicate(allJobs)');
// Le SITE D'APPEL, pas la définition : `indexOf('filtrerContrat(')` attrape
// d'abord `function filtrerContrat(...)`, déclarée en haut du fichier, donc
// avant le décompte — le contrôle passait au vert sur la mauvaise occurrence.
const iFiltreContrat = src.indexOf('filtrerContrat(pertinence.jobs');
check('le décompte est calculé AVANT le dédoublonnage',
  iDecompte > 0 && iDedup > 0 && iDecompte < iDedup);
check('le décompte est calculé AVANT le filtre de contrat',
  iDecompte > 0 && iFiltreContrat > 0 && iDecompte < iFiltreContrat);
check('le décompte est bâti sur les résultats des collecteurs, pas sur `final`',
  /collecteurs\.map\(\(\[nom\], i\) => \[nom, resultats\[i\]\.status === 'fulfilled' \? resultats\[i\]\.value\.length : 0\]\)/.test(src));
// Un collecteur rejeté compte zéro et non `undefined` : il est déjà journalisé
// comme échec par ailleurs, mais sa clé doit exister pour que les neuf noms
// soient toujours présents.
check('un collecteur rejeté compte zéro, sa clé ne disparaît pas',
  /status === 'fulfilled' \? resultats\[i\]\.value\.length : 0/.test(src));

// ── 3. LE VERROU DE SORTIE ──────────────────────────────────────────────────
// Même rôle que `causePublique` pour les causes : une entrée de cache revient
// de l'extérieur du processus, donc elle se filtre comme telle — en UN endroit,
// pas à la discrétion des deux chemins de réponse.
console.log('\n── Le verrou sur ce qui sort ──');

check('contributionPublique est extractible', typeof contributionPublique === 'function');
check('une entrée absente vaut null, pas un objet vide',
  contributionPublique(undefined) === null && contributionPublique(null) === null);
check('un objet sans aucune clé connue vaut null',
  contributionPublique({ Inconnu: 3 }) === null,
  '{} se lirait « les neuf collecteurs ont rendu zéro »');
check('une clé inconnue ne traverse pas',
  !Object.keys(contributionPublique({ Adzuna: 4, Inconnu: 9 }) || {}).includes('Inconnu'));
check('un nom de collecteur connu traverse avec son entier',
  contributionPublique({ Adzuna: 4 })?.Adzuna === 4);
check('un zéro légitime traverse — c’est tout l’objet du décompte',
  contributionPublique({ Adzuna: 0 })?.Adzuna === 0);

// La règle du dépôt : ce qu'on ne sait pas lire vaut `null`, jamais zéro. Une
// coercion aurait rendu `Number(null) === 0`, donc une affirmation.
check('une valeur null n’est PAS rendue comme zéro',
  contributionPublique({ Adzuna: null }) === null,
  'ce qu’on ne sait pas lire vaut null, pas 0');
check('une chaîne numérique n’est pas acceptée',
  contributionPublique({ Adzuna: '4' }) === null);
check('un flottant est tronqué, un négatif ramené à zéro',
  contributionPublique({ Adzuna: 4.9 })?.Adzuna === 4 &&
  contributionPublique({ Adzuna: -3 })?.Adzuna === 0);
check('NaN et Infinity ne traversent pas',
  contributionPublique({ Adzuna: NaN }) === null &&
  contributionPublique({ Adzuna: Infinity }) === null);

// LA propriété de sûreté, la même que pour les causes : aucun contenu amont ne
// peut atteindre la réponse par ce champ. Les clés sont des noms écrits dans le
// handler, les valeurs des entiers.
const empoisonne = contributionPublique({
  Adzuna: 4,
  'https://api.adzuna.com/?app_key=SECRET': 1,
  Emploia: 'ECONNREFUSED chez https://x?token=abc',
});
check('aucune chaîne ne peut traverser le verrou',
  Object.values(empoisonne || {}).every(v => typeof v === 'number'));
check('aucune clé fabriquée en amont ne peut traverser',
  Object.keys(empoisonne || {}).every(k => COLLECTEURS.includes(k)),
  Object.keys(empoisonne || {}).join(', '));

// ── 4. LE CHAMP EST BRANCHÉ DANS LES DEUX RÉPONSES ET DANS LE CACHE ─────────
// Un champ absent d'un seul des deux chemins serait pire qu'inutile : la moitié
// des réponses le porterait, et la sonde conclurait au hasard de la fenêtre de
// cache.
console.log('\n── Les deux chemins de réponse et le cache ──');

check('la réponse fraîche porte offresParCollecteur',
  /sources, sourcesEnEchec, causesEnEchec, offresParCollecteur, filtre: pertinence\.filtre/.test(src));
check('la réponse depuis le cache le porte aussi',
  /causesEnEchec, offresParCollecteur, filtre: cached\.filtre/.test(src));
check('le décompte entre dans le cache',
  /kvSet\(cacheKey, \{[^}]*offresParCollecteur/.test(src));
check('la lecture du cache repasse par le verrou',
  /contributionPublique\(cached\.offresParCollecteur\)/.test(src));

// ── 5. LA SONDE DES SOURCES RÉCONCILIE DÉSORMAIS ────────────────────────────
// Le décompte ne sert à rien si personne ne le lit. Avant, `sources` n'était
// agrégé que pour une ligne d'information en fin de sortie — jamais comparé à
// la liste des collecteurs.
console.log('\n── La sonde des sources lit le décompte ──');

const sonde = fs.readFileSync(new URL('./sources.mjs', import.meta.url), 'utf8');
check('la sonde lit offresParCollecteur', /rep\.offresParCollecteur/.test(sonde));
check('la sonde fait rougir un collecteur à zéro sans échec ni déclaration',
  /à zéro sans échouer ni être déclaré/.test(sonde));
check('la sonde signale un déploiement qui ne porte pas le champ',
  /ne porte pas .offresParCollecteur./.test(sonde));
// « au moins une fois » et non « à chaque requête » : une requête étroite peut
// légitimement ne rien rendre chez un agrégateur, et exiger une contribution
// partout ferait rougir la sonde sur une source saine — Adzuna, justement.
check('la règle est « au moins une contribution », pas « à chaque requête »',
  /ontContribue\.has\(s\)/.test(sonde) && /au moins une fois/.test(sonde));
check('une absence déclarée reste tolérée mais visible',
  /à zéro sans échouer — /.test(sonde));

if (failed) { console.error(`\n❌ sonde du décompte : ${failed} échec(s) sur ${passed + failed}\n`); process.exit(1); }
console.log(`\n✅ sonde du décompte : ${passed} vérifications OK\n`);
