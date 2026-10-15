// Sonde du type de contrat et du salaire exposés par /api/jobs.
//
// Le défaut qu'elle verrouille : `detectType()` finissait par `return 'CDI'`
// et recevait le filtre de recherche en second argument, qu'il renvoyait tel
// quel pour TOUTES les offres. Donc (A) une offre dont le contrat était inconnu
// était publiée comme un CDI — 217 sur 311 d'un relevé venaient de cette seule
// ligne — et (B) sous filtre « CDD », chaque offre rendue était étiquetée
// « CDD » quel que soit son contrat réel. L'étiquette était une fonction de la
// requête, pas de la donnée.
//
// Et (D) le garde du salaire testait la véracité de la borne basse, pas son
// ordre de grandeur : 400 € passait et s'arrondissait à `0`, d'où le
// « 0k–0k€/an » affiché sur /jobs.
//
// Cette sonde est HORS LIGNE, comme `causes.test.mjs` dont elle reprend le
// gabarit : elle importe le vrai module de lecture et extrait les fonctions du
// vrai handler pour les exécuter dans un `vm`, sans réseau. Une copie de la
// logique resterait verte en divergeant du handler — c'est exactement le
// défaut qu'on vient de retirer ailleurs.
import fs from 'node:fs';
import vm from 'node:vm';
import {
  CONTRATS, FILTRE_VERS_CONTRAT, contratPublic, detectType,
  contratAdzuna, tempsAdzuna, contratArbeitnow, tempsArbeitnow,
  contratJSearch, tempsJSearch, contratFrenchMarket, contratFranceTravail,
  formaterSalaireAnnuel, estSalaireEstime,
} from '../../api/_lib/contrat.js';

const src = fs.readFileSync(new URL('../../api/jobs.js', import.meta.url), 'utf8');
const libSrc = fs.readFileSync(new URL('../../api/_lib/contrat.js', import.meta.url), 'utf8');
const alertSrc = fs.readFileSync(new URL('../../api/cron/send-alerts.js', import.meta.url), 'utf8');
const frontSrc = fs.readFileSync(new URL('../../jobs.html', import.meta.url), 'utf8');
// Le front, commentaires retirés. La feuille de style cite les libellés
// interdits pour dire qu'ils le sont : les tester sur le fichier entier ferait
// échouer la sonde sur sa propre documentation.
const frontCode = frontSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let passed = 0, failed = 0;
function check(label, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

// Extraction d'une fonction du VRAI handler, pour l'exécuter dans un `vm` :
// une copie de la logique resterait verte en divergeant du fichier servi.
// Déclarée ici parce que deux sections s'en servent, et qu'une `const` utilisée
// avant sa déclaration lève une ReferenceError au chargement du module.
function extraire(nom) {
  const i = src.indexOf(`function ${nom}(`);
  if (i < 0) return null;
  let profondeur = 0;
  const debut = src.indexOf('{', i);
  for (let j = debut; j < src.length; j++) {
    if (src[j] === '{') profondeur++;
    else if (src[j] === '}' && --profondeur === 0) return src.slice(i, j + 1);
  }
  return null;
}
const blocFiltre = extraire('filtrerContrat');

// ── A. Le défaut par défaut : un contrat inconnu vaut null, jamais CDI ───────
console.log('\n[A] Un contrat inconnu porte null, il n’est plus publié comme CDI');
// Des titres réels, pris dans les relevés : aucun ne dit son contrat.
for (const titre of [
  'Développeur Full Stack React/Node.js',
  'Growth Marketing Manager',
  'Senior Consultant (m/w/d)',
  'Inside Sales Contractor H/F',  // « contractor », pas « contract »
  'Responsable Métrologie — Saint Ouen',
  'Chargé de Ressources Humaines',
  '',
]) {
  const t = detectType(titre);
  check(`« ${titre || '(titre vide)'} » → null`, t === null, String(t));
}
check('detectType ne peut plus rendre CDI sans que le titre le dise',
  detectType('Ingénieur backend') === null);
check('un titre qui DIT son contrat est toujours lu',
  detectType('Stage Marketing Digital — 6 mois') === 'Stage' &&
  detectType('Alternance Business Developer') === 'Alternance' &&
  detectType('Data Analyst — CDD 12 mois') === 'CDD' &&
  detectType('Mission freelance React') === 'Freelance' &&
  detectType('Développeur CDI Paris') === 'CDI');
// Et la source : `detectType` doit FINIR par `return null`. On vise sa
// dernière instruction, pas toute occurrence de 'CDI' — la fonction lit
// légitimement « CDI » dans un titre qui l'écrit.
const blocDetect = libSrc.slice(libSrc.indexOf('export function detectType('));
const corpsDetect = blocDetect.slice(0, blocDetect.indexOf('\n}'));
check('detectType finit par `return null`, pas par un contrat',
  /return null;\s*$/.test(corpsDetect.trim()),
  corpsDetect.trim().split('\n').pop().trim());
check('aucune branche inconditionnelle ne rend un contrat',
  !/^\s*return\s+'(CDI|CDD|Stage|Alternance|Freelance)';/m.test(corpsDetect));

// ── B. L'indépendance au filtre, vérifiée sur la SIGNATURE ──────────────────
// Le point qui compte : rendre le défaut inexprimable, pas seulement absent.
// Une fonction à un seul paramètre ne PEUT PAS recevoir le filtre.
console.log('\n[B] L’étiquette ne dépend plus jamais de la requête');
check('detectType n’a qu’un paramètre', detectType.length === 1, `length=${detectType.length}`);
// Et si un appelant distrait lui en passait un second, il doit être ignoré.
for (const filtre of ['cdd', 'cdi', 'stage', 'alternance', 'freelance', 'tous']) {
  const avec = detectType('Développeur Full Stack', filtre);
  check(`un second argument « ${filtre} » est sans effet`, avec === null, String(avec));
}
// Aucun site d'appel du handler ne passe deux arguments.
const appels = [...src.matchAll(/detectType\(([^)]*)\)/g)].map(m => m[1]);
check('tous les appels de detectType du handler sont à un argument',
  appels.length > 0 && appels.every(a => !a.includes(',')),
  `${appels.length} appel(s) : ${appels.join(' | ')}`);
// Le vocabulaire du filtre et celui de l'étiquette restent deux choses, mais
// le premier ne sert plus qu'à filtrer.
check('FILTRE_VERS_CONTRAT n’est utilisé que dans des filtres',
  [...src.matchAll(/FILTRE_VERS_CONTRAT\[[^\]]+\]/g)].length > 0 &&
  !/type:\s*FILTRE_VERS_CONTRAT/.test(src));

// ── C. Les champs amont sont lus et cartographiés ───────────────────────────
console.log('\n[C] Les champs de contrat des sources sont lus, pas devinés');
check('api/jobs.js lit contract_type (Adzuna)', /contract_type/.test(libSrc));
check('api/jobs.js lit contract_time (Adzuna)', /contract_time/.test(libSrc));
check('api/jobs.js lit job_types (Arbeitnow)', /job_types/.test(libSrc));

// Adzuna — les deux valeurs attestées, et rien de plus.
check('contract_type permanent → CDI',
  contratAdzuna({ contract_type: 'permanent', title: 'X' }) === 'CDI');
check('contract_type contract → CDD',
  contratAdzuna({ contract_type: 'contract', title: 'X' }) === 'CDD');
check('contract_type absent → null (le titre ne dit rien)',
  contratAdzuna({ title: 'Développeur backend' }) === null);
for (const inconnu of ['part_time', 'full_time', 'seasonal', 'unknown', 'PERMANENT_FULL', '1', 'true']) {
  check(`contract_type « ${inconnu} » non reconnu → null`,
    contratAdzuna({ contract_type: inconnu, title: 'Développeur' }) === null);
}
// Le champ structuré a priorité sur le titre : la donnée bat l'indice.
check('contract_type permanent bat un titre trompeur',
  contratAdzuna({ contract_type: 'permanent', title: 'Mission freelance' }) === 'CDI');

// contract_time ne doit JAMAIS devenir un contrat. C'est la faute de catégorie
// que commet la table JOB_TYPES du front en posant full_time → CDI.
console.log('\n[C bis] La durée de travail n’entre pas dans le champ contrat');
check('contract_time full_time ne donne aucun contrat',
  contratAdzuna({ contract_time: 'full_time', title: 'Développeur' }) === null);
check('contract_time full_time → « Temps plein », dans son champ',
  tempsAdzuna({ contract_time: 'full_time' }) === 'Temps plein');
check('contract_time part_time → « Temps partiel »',
  tempsAdzuna({ contract_time: 'part_time' }) === 'Temps partiel');
check('contract_time absent → null', tempsAdzuna({}) === null);
check('aucune durée de travail n’est dans le vocabulaire des contrats',
  !CONTRATS.has('Temps plein') && !CONTRATS.has('Temps partiel'));

// Arbeitnow — mesuré : texte libre, multilingue, absent de 177 offres sur 300.
console.log('\n[C ter] Arbeitnow : job_types est du texte libre, lu comme tel');
check('« Unbefristeter arbeitsvertrag » → CDI',
  contratArbeitnow({ job_types: ['Unbefristeter arbeitsvertrag'], title: 'X' }) === 'CDI');
// LE PIÈGE : « unbefristeter » (indéterminée) CONTIENT « befristeter »
// (déterminée). Un test par sous-chaîne dans le mauvais ordre inverse le sens
// pour les 28 offres les plus clairement CDI du relevé.
check('« Befristeter arbeitsvertrag » → CDD, sans confusion avec le précédent',
  contratArbeitnow({ job_types: ['Befristeter arbeitsvertrag'], title: 'X' }) === 'CDD');
check('« Permanent employment (unbefristeter arbeitsvertrag) » → CDI',
  contratArbeitnow({ job_types: ['Permanent employment (unbefristeter arbeitsvertrag)'], title: 'X' }) === 'CDI');
check('« Contract » → CDD', contratArbeitnow({ job_types: ['Contract'], title: 'X' }) === 'CDD');
check('« internship » → Stage', contratArbeitnow({ job_types: ['internship'], title: 'X' }) === 'Stage');
check('« Praktikum » → Stage', contratArbeitnow({ job_types: ['Praktikum'], title: 'X' }) === 'Stage');
check('« freelance » → Freelance', contratArbeitnow({ job_types: ['freelance'], title: 'X' }) === 'Freelance');
check('« Freiberufler / selbstständiger » → Freelance',
  contratArbeitnow({ job_types: ['Freiberufler / selbstständiger'], title: 'X' }) === 'Freelance');
// Les valeurs qui ne portent pas de contrat n'en inventent pas un.
for (const bruit of ['Full Time', 'Full-time', 'Part Time', 'berufserfahren', 'Manager',
                     'mid-senior', 'executive', 'Entry', 'Werkstudent', 'working student']) {
  check(`« ${bruit} » ne donne aucun contrat`,
    contratArbeitnow({ job_types: [bruit], title: 'Développeur' }) === null);
}
check('job_types absent → null (le cas de 177 offres sur 300)',
  contratArbeitnow({ title: 'Développeur backend' }) === null);
check('job_types vide → null', contratArbeitnow({ job_types: [], title: 'Développeur' }) === null);
// Mélange réel : contrat + durée + séniorité dans le même tableau.
const melange = { job_types: ['Full Time', 'berufserfahren', 'Unbefristeter arbeitsvertrag'], title: 'X' };
check('dans un mélange, le contrat est extrait', contratArbeitnow(melange) === 'CDI');
check('et la durée aussi, séparément', tempsArbeitnow(melange) === 'Temps plein');

// Les autres sources.
console.log('\n[C quater] Les cinq autres collecteurs lisent leur champ');
check('JSearch INTERN → Stage', contratJSearch({ job_employment_type: 'INTERN', job_title: 'X' }) === 'Stage');
check('JSearch CONTRACTOR → CDD', contratJSearch({ job_employment_type: 'CONTRACTOR', job_title: 'X' }) === 'CDD');
check('JSearch FULLTIME n’est pas un contrat',
  contratJSearch({ job_employment_type: 'FULLTIME', job_title: 'Développeur' }) === null);
check('JSearch FULLTIME → « Temps plein », dans son champ',
  tempsJSearch({ job_employment_type: 'FULLTIME' }) === 'Temps plein');
check('French Job Market permanent → CDI',
  contratFrenchMarket({ employment_type: 'permanent', title: 'X' }) === 'CDI');
check('French Job Market temporary → CDD',
  contratFrenchMarket({ employment_type: 'temporary', title: 'X' }) === 'CDD');
check('French Job Market sans employment_type → null',
  contratFrenchMarket({ title: 'Développeur' }) === null);
check('France Travail code CDI → CDI', contratFranceTravail({ typeContrat: 'CDI', intitule: 'X' }) === 'CDI');
check('France Travail code CDD → CDD', contratFranceTravail({ typeContrat: 'CDD', intitule: 'X' }) === 'CDD');
check('France Travail code CA (apprentissage) → Alternance',
  contratFranceTravail({ typeContrat: 'CA', intitule: 'X' }) === 'Alternance');
// MIS (intérim) et SAI (saisonnier) ne sont aucun des cinq : null, pas un
// rapprochement commode.
check('France Travail code MIS (intérim) → null',
  contratFranceTravail({ typeContrat: 'MIS', intitule: 'Opérateur' }) === null);
check('France Travail code SAI (saisonnier) → null',
  contratFranceTravail({ typeContrat: 'SAI', intitule: 'Vendeur' }) === null);
// Le libellé n'est plus LU ; il n'est mentionné que dans les commentaires qui
// expliquent pourquoi. On teste donc le code, commentaires retirés.
const sansCommentaires = (t) => t.replace(/^\s*\/\/.*$/gm, '');
check('France Travail ne prend plus le libellé libre',
  !/typeContratLibelle/.test(sansCommentaires(src)) &&
  !/typeContratLibelle/.test(sansCommentaires(libSrc)));

// ── Le verrou : rien hors du vocabulaire ne sort ────────────────────────────
console.log('\n[C quinquies] contratPublic est le verrou, pas la discipline des appelants');
for (const v of [...CONTRATS]) check(`« ${v} » traverse`, contratPublic(v) === v);
for (const v of ['Remote', 'Temps plein', 'Contrat à durée indéterminée', 'cdi', 'CDI ',
                 'full_time', 'Intérim', '', null, undefined, 0, {}, []]) {
  check(`« ${String(v)} » est arrêté → null`, contratPublic(v) === null);
}

// ── 'Remote' sort du champ contrat ──────────────────────────────────────────
console.log('\n[E] « Remote » n’est plus un contrat');
check('le collecteur Remotive n’écrit plus type: \'Remote\'', !/type:\s*'Remote'/.test(src));
check('« Remote » n’est pas dans le vocabulaire', !CONTRATS.has('Remote'));
check('aucun filtre d’URL ne mène à « Remote »',
  !Object.values(FILTRE_VERS_CONTRAT).includes('Remote'));

// ── D. Le salaire : 0k–0k est inexprimable ──────────────────────────────────
console.log('\n[D] Aucune valeur de salaire ne peut s’afficher 0k–0k');
// La borne basse du relevé : 400 € passait le garde `j.salary_min ?` et
// s'arrondissait à 0.
for (const [min, max] of [[400, 400], [400, null], [1, 1], [499, 499], [0, 0],
                          [100, 400], [null, null], [0, 499], [499, 0]]) {
  const s = formaterSalaireAnnuel(min, max);
  check(`(${min}, ${max}) → rien plutôt que 0k`, s === null, String(s));
}
// Et la propriété générale, sur la SORTIE : aucune entrée ne produit une borne
// arrondie à zéro, sous aucune forme. Le balayage est ce qui a fait apparaître
// le cas mitoyen (0 → 999 €, « 0k–1k ») que le seul critère `0k–0k` laissait
// passer.
let zero = 0;
for (let min = 0; min <= 2000; min += 7) {
  for (const max of [null, 0, min, min + 300, min * 2, 999, 1499]) {
    const s = formaterSalaireAnnuel(min, max);
    if (s !== null && /\b0k/.test(s)) { zero++; console.error(`    fuite : (${min}, ${max}) → ${s}`); }
  }
}
check('aucune des combinaisons balayées ne rend une borne à 0k', zero === 0, `${zero} fuite(s)`);
// Le cas mitoyen, nommé : une borne basse sans information ne s'affiche pas
// comme un plancher de zéro.
check('(0, 999) ne s’affiche pas « 0k–1k »',
  formaterSalaireAnnuel(0, 999) === "jusqu'à 1k€/an", String(formaterSalaireAnnuel(0, 999)));
check('(100, 30000) garde sa borne haute et perd la basse, qui ne dit rien',
  formaterSalaireAnnuel(100, 30000) === "jusqu'à 30k€/an");
// Les vrais salaires passent, eux : un garde qui bloque tout ne sert à rien.
check('45000–55000 → 45k–55k€/an', formaterSalaireAnnuel(45000, 55000) === '45k–55k€/an');
check('une borne unique ne se répète pas', formaterSalaireAnnuel(45000, 45000) === '45k€/an');
check('max absent reprend min', formaterSalaireAnnuel(45000, null) === '45k€/an');
check('bornes inversées sont remises dans l’ordre',
  formaterSalaireAnnuel(55000, 45000) === '45k–55k€/an');
check('500 arrondit à 1k, et s’affiche', formaterSalaireAnnuel(500, 500) === '1k€/an');
check('le handler n’arrondit plus en ligne',
  !/Math\.round\(j\.salary_min\/1000\)/.test(src));

// ── salary_is_predicted : la comparaison, pas la véracité ───────────────────
console.log('\n[F] salary_is_predicted est comparé explicitement');
check('la chaîne "1" → estimé', estSalaireEstime('1') === true);
check('l’entier 1 → estimé', estSalaireEstime(1) === true);
// LE PIÈGE : Boolean("0") === true. Un `if (j.salary_is_predicted)` marquerait
// TOUTES les offres Adzuna comme estimées.
check('la chaîne "0" → PAS estimé (Boolean("0") est true)', estSalaireEstime('0') === false);
check('l’entier 0 → PAS estimé', estSalaireEstime(0) === false);
check('absent → PAS estimé', estSalaireEstime(undefined) === false);
check('null → PAS estimé', estSalaireEstime(null) === false);
check('la comparaison est explicite dans le source',
  /String\(v\)\s*===\s*'1'/.test(libSrc));
check('aucune lecture par véracité du drapeau',
  !/if\s*\(\s*j\.salary_is_predicted\s*\)/.test(src));
// DÉCISION : un salaire estimé est affiché, et marqué.
check('le handler émet la fourchette même estimée',
  /salary:\s*formaterSalaireAnnuel\(j\.salary_min, j\.salary_max\)/.test(src));
check('il ne la supprime plus', !/salary:\s*estime\s*\?\s*null/.test(src));
check('et conserve le drapeau qui la distingue', /salaryEstimated:\s*estime/.test(src));
check('jobs.html marque « estimation Adzuna » dans le rendu', /estimation Adzuna/.test(frontCode));
check('sur un badge distinct du gris des montants annoncés',
  /jb-badge-estime/.test(frontSrc) &&
  /salaryEstimated\s*\n?\s*\?\s*`<span class="jb-badge jb-badge-estime"/.test(frontSrc));
check('le badge estimé est visuellement distinct en CSS',
  /\.jb-badge-estime \{[^}]*dashed/.test(frontSrc));
check('jamais le libellé « salaire proposé »', !/salaire propos/i.test(frontCode));

// ── Couverture du contrat : dans la réponse, pas dans les journaux ──────────
console.log('\n[J] La couverture du contrat sort des journaux Vercel');
check('couvertureContrat est publié dans la réponse fraîche',
  /filtre: pertinence\.filtre, couvertureContrat/.test(src));
check('elle entre en cache', /kvSet\(cacheKey, \{[^}]*couvertureContrat/.test(src));
check('la relecture du cache la rend', /couvertureContrat, cached: true/.test(src));
// Une entrée écrite par le déploiement précédent n'en porte pas. Des zéros se
// liraient comme « aucune offre au contrat inconnu » — l'affirmation la plus
// trompeuse possible, puisque c'est le chiffre qu'on vient de rendre visible.
check('une entrée de cache sans couverture vaut null, pas des zéros',
  /cached\.couvertureContrat \|\| null/.test(src));
check('le journal subsiste pour qui lit à chaud, mais n’est plus le seul endroit',
  /console\.error\(`jobs: \$\{contrat\.ecartees\}/.test(src) && /couvertureContrat/.test(src));

// Le comportement de `filtrerContrat`, sur la couverture.
if (blocFiltre) {
  const sandbox2 = { console, FILTRE_VERS_CONTRAT };
  vm.createContext(sandbox2);
  vm.runInContext(`${blocFiltre}\nthis.filtrerContrat = filtrerContrat;`, sandbox2);
  const { filtrerContrat } = sandbox2;
  const lot = [
    { id: 1, type: 'CDI' }, { id: 2, type: 'CDD' }, { id: 3, type: null },
    { id: 4, type: 'Stage' }, { id: 5, type: 'CDD' }, { id: 6, type: null },
  ];
  // Hors filtre, la couverture est quand même mesurée : c'est le chiffre qui
  // dira si la lecture des champs amont progresse, et il n'existerait pas s'il
  // n'était compté que sous filtre.
  const hors = filtrerContrat(lot, '');
  check('hors filtre, sansContrat est compté malgré tout',
    hors.sansContrat === 2 && hors.ecartees === 0, `sansContrat=${hors.sansContrat}`);
  check('hors filtre, vise est null', hors.vise === null);
  const sous = filtrerContrat(lot, 'cdd');
  check('sous filtre, vise nomme le contrat demandé', sous.vise === 'CDD');
  check('sous filtre, sansContrat reste le compte d’avant filtrage',
    sous.sansContrat === 2, `sansContrat=${sous.sansContrat}`);
  check('et ecartees compte tout ce qui est parti', sous.ecartees === 4);
  // Le rendu annoncé à l'utilisateur doit être cohérent : « n sur m » avec
  // n ≤ m, et n compté sur la liste servie.
  const confirmees = sous.jobs.filter(j => j.type).length;
  check('« n offres au contrat confirmé sur m » est cohérent',
    confirmees === 2 && confirmees <= lot.length, `${confirmees} sur ${lot.length}`);
  check('aucune offre au contrat inconnu n’entre dans les confirmées',
    !sous.jobs.some(j => !j.type));
}

// ── Le filtre de contrat existe et porte sur la donnée ──────────────────────
console.log('\n[G] Le filtre de contrat est appliqué sur la donnée reçue');
check('filtrerContrat est extractible du handler', !!blocFiltre);
if (blocFiltre) {
  const sandbox = { console, FILTRE_VERS_CONTRAT };
  vm.createContext(sandbox);
  vm.runInContext(`${blocFiltre}\nthis.filtrerContrat = filtrerContrat;`, sandbox);
  const { filtrerContrat } = sandbox;
  const lot = [
    { id: 1, type: 'CDI' }, { id: 2, type: 'CDD' }, { id: 3, type: null },
    { id: 4, type: 'Stage' }, { id: 5, type: 'CDD' },
  ];
  const r = filtrerContrat(lot, 'cdd');
  check('sous filtre cdd, seules les offres LUES comme CDD restent',
    r.jobs.length === 2 && r.jobs.every(j => j.type === 'CDD'),
    `${r.jobs.length} gardée(s)`);
  check('une offre au contrat inconnu est écartée, pas renommée',
    !r.jobs.some(j => j.type === null) && r.sansContrat === 1);
  check('aucune offre n’a été réétiquetée par le filtre',
    lot.every(j => j.id !== 1 || j.type === 'CDI'));
  check('sans filtre, le lot entier passe',
    filtrerContrat(lot, '').jobs.length === 5 &&
    filtrerContrat(lot, 'tous').jobs.length === 5);
  check('un filtre inconnu ne filtre rien plutôt que tout',
    filtrerContrat(lot, 'interim').jobs.length === 5);
  check('l’écart est mesurable depuis l’extérieur', r.ecartees === 3);
}
check('le handler appelle filtrerContrat avant la mise en cache',
  src.indexOf('filtrerContrat(pertinence.jobs, type)') > 0 &&
  src.indexOf('filtrerContrat(pertinence.jobs, type)') < src.indexOf('kvSet(cacheKey'));

// ── L'interface n'affiche pas une pastille vide ─────────────────────────────
console.log('\n[H] jobs.html n’affiche aucune pastille quand le type est absent');
check('la pastille de type est conditionnelle',
  /\$\{job\.type \? `<span class="jb-badge \$\{typeBadgeClass\(job\.type\)\}">/.test(frontSrc));
// `esc(null)` rend '' : la pastille inconditionnelle donnait une puce bleue
// vide, et `typeBadgeClass` retombait sur `jb-type-blue`, la couleur du CDI.
check('typeBadgeClass ne retombe plus sur la couleur du CDI',
  !/\}\[type\]\|\|'jb-type-blue'/.test(frontSrc));
check('son repli est neutre', /\}\[type\]\|\|'jb-badge-gray'/.test(frontSrc));

// ── Les alertes email lisent la même notion ─────────────────────────────────
console.log('\n[I] Les alertes email lisent le contrat, elles ne le supposent plus');
check('send-alerts partage le module de lecture',
  /from '\.\.\/_lib\/contrat\.js'/.test(alertSrc));
check('l’ancienne table TYPE_MAP est retirée', !/TYPE_MAP/.test(alertSrc));
check('une alerte « all » ne filtre pas', /type !== 'all'/.test(alertSrc));
// La décision, vérifiée sur le comportement : un contrat inconnu n'est pas
// envoyé à un abonné « CDI ».
const offres = [
  { job_types: ['Unbefristeter arbeitsvertrag'], title: 'A' },
  { job_types: ['Full Time'], title: 'B' },
  { job_types: [], title: 'C' },
  { job_types: ['Contract'], title: 'D' },
];
const pourCDI = offres.filter(j => contratArbeitnow(j) === 'CDI');
check('une alerte CDI ne retient que le contrat lu comme CDI',
  pourCDI.length === 1 && pourCDI[0].title === 'A');
check('une offre au contrat inconnu n’est pas envoyée comme CDI',
  !offres.filter(j => contratArbeitnow(j) === 'CDI').some(j => j.title === 'B' || j.title === 'C'));
// Le vocabulaire des alertes et celui des contrats doivent rester compatibles.
check('les types d’alerte valides sont tous dans le vocabulaire',
  ['CDI', 'CDD', 'Stage', 'Alternance', 'Freelance'].every(t => CONTRATS.has(t)));

if (failed) { console.error(`\n❌ sonde du contrat : ${failed} échec(s)\n`); process.exit(1); }
console.log(`\n✅ sonde du contrat : ${passed} vérifications OK\n`);
