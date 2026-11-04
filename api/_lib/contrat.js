// ── LECTURE DU CONTRAT DE TRAVAIL ─────────────────────────────────────────────
// Source unique pour tout ce qui transforme une donnée amont en type de
// contrat affichable. Partagée par `api/jobs.js` (l'agrégateur) et
// `api/cron/send-alerts.js` (les alertes email), qui lisaient la même notion
// de deux façons incompatibles — l'un en devinant depuis le titre, l'autre en
// comparant à un vocabulaire qui n'existe pas chez la source.
//
// LA RÈGLE, et elle est la raison d'être de ce fichier : ce qu'on reconnaît,
// on le cartographie ; tout le reste vaut `null`. Jamais une supposition.
// Un contrat inconnu est une information manquante, pas un CDI.
//
// Ce que ce fichier retire : `detectType()` finissait par `return 'CDI'` et
// recevait le filtre de recherche en argument, qu'il renvoyait tel quel. Une
// offre dont le contrat était inconnu était donc publiée comme un CDI, et
// sous filtre « CDD » toutes les offres rendues étaient étiquetées « CDD »
// quel que soit leur contrat réel. L'étiquette était une fonction de la
// requête, pas de la donnée.

// Le vocabulaire fermé. Cinq valeurs, celles que l'interface sait colorer et
// qu'une alerte sait demander. Ce qui n'y est pas ne sort pas d'ici.
export const CONTRATS = new Set(['CDI', 'CDD', 'Stage', 'Alternance', 'Freelance']);

// Le filtre d'URL (`?type=cdd`) vers le libellé correspondant. Sert à FILTRER
// des offres — jamais à en étiqueter une.
export const FILTRE_VERS_CONTRAT = {
  stage: 'Stage', alternance: 'Alternance', cdi: 'CDI', cdd: 'CDD', freelance: 'Freelance',
};

// Dernier verrou avant qu'une étiquette entre dans une offre : ce qui n'est
// pas du vocabulaire fermé devient `null`. Même rôle que `causePublique` pour
// les causes d'échec — la garantie est appliquée en un point, pas confiée à la
// discipline des neuf collecteurs ni à celle du prochain qu'on ajoutera.
export function contratPublic(v) {
  return CONTRATS.has(v) ? v : null;
}

export function normaliserValeur(v) {
  return String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

// ── Le titre, en dernier recours ─────────────────────────────────────────────
// Ce qui reste d'une lecture du titre est un indice faible mais réel : « Stage
// marketing — 6 mois » dit son contrat, parce que l'employeur l'a écrit. Il
// n'est consulté qu'après les champs structurés de la source, et il ne comble
// plus les trous par un défaut : un titre muet rend `null`.
export function detectType(title) {
  const t = normaliserValeur(title);
  if (/\b(stage|stagiaire|intern|internship)\b/.test(t)) return 'Stage';
  if (/\b(alternance|alternant|apprenti|apprentissage|apprenticeship)\b/.test(t)) return 'Alternance';
  if (/\b(freelance|independant|freiberufler)\b/.test(t)) return 'Freelance';
  if (/\b(cdd|temporary|interim)\b/.test(t)) return 'CDD';
  if (/\bcdi\b/.test(t)) return 'CDI';
  return null;
}

// ── DURÉE DE TRAVAIL — un autre champ, délibérément ──────────────────────────
// `full_time` / `part_time` ne disent rien du contrat : un CDD peut être à
// temps plein, un CDI à temps partiel. Les confondre est la faute de catégorie
// que commet la table `JOB_TYPES` du front en posant `full_time → CDI`, et
// c'est la même que le `'Remote'` qu'écrivait le collecteur Remotive dans le
// champ contrat. On lit donc la durée, mais dans son propre champ, qui ne
// touche jamais `type`.
function lireTemps(t) {
  if (/\b(full ?time|fulltime|vollzeit|temps plein)\b/.test(t)) return 'Temps plein';
  if (/\b(part ?time|parttime|teilzeit|temps partiel)\b/.test(t)) return 'Temps partiel';
  return null;
}

// ── ADZUNA ───────────────────────────────────────────────────────────────────
// `contract_type` et `contract_time` sont documentés sur chaque résultat de
// l'endpoint `search`, et le dépôt n'en lisait aucun des deux : zéro
// occurrence dans `api/jobs.js`. On devinait ce qu'on nous avait dit.
//
// L'énumération complète de `contract_type` n'est pas publiée par Adzuna. Les
// valeurs attestées sont `permanent` et `contract`. On ne cartographie que
// celles-là ; le reste vaut `null`, parce qu'inventer la troisième valeur
// serait refaire, en plus petit, le défaut qu'on retire.
const ADZUNA_CONTRAT = { permanent: 'CDI', contract: 'CDD' };

export function contratAdzuna(j) {
  return contratPublic(ADZUNA_CONTRAT[normaliserValeur(j?.contract_type)] || detectType(j?.title));
}
export function tempsAdzuna(j) {
  return lireTemps(normaliserValeur(j?.contract_time));
}

// ── ARBEITNOW ────────────────────────────────────────────────────────────────
// `job_types` est un tableau, et le dépôt le lisait déjà — mais ailleurs, dans
// `api/cron/send-alerts.js`, et contre un vocabulaire qui n'est pas celui de
// la source.
//
// MESURÉ sur les 300 offres de la page 1 de l'API publique : le champ est du
// TEXTE LIBRE ET MULTILINGUE, pas une énumération. 177 offres sur 300 n'ont
// aucune valeur. Celles qui en ont mélangent trois dimensions sans les
// distinguer : le contrat (« Unbefristeter arbeitsvertrag », « Contract »,
// « freelance »), la durée de travail (« Full Time », « Full-time »,
// « Part Time ») et le niveau d'expérience (« berufserfahren », « Manager »,
// « mid-senior »). Aucune occurrence de `full_time`, `temporary`,
// `apprenticeship` : les valeurs que `send-alerts.js` cherchait n'existent
// pas, donc toute alerte typée filtrait 300 offres à zéro.
//
// D'où une reconnaissance par motif plutôt que par clé exacte, justifiée par
// la mesure et non par le confort.
//
// LE PIÈGE, et il inverse le sens : « unbefristeter » (à durée INdéterminée)
// CONTIENT « befristeter » (à durée déterminée). Un test par sous-chaîne dans
// le mauvais ordre rend CDD pour les 28 offres les plus clairement CDI du lot.
// Le préfixe est donc testé d'abord, et il sort immédiatement.
export function contratDepuisTexte(t) {
  if (/\bunbefristet/.test(t)) return 'CDI';            // à tester AVANT befristet
  if (/\bbefristet/.test(t)) return 'CDD';
  if (/\bpermanent\b/.test(t)) return 'CDI';
  // LE MÊME PIÈGE, dans l'autre langue, et il est arrivé par Greenhouse :
  // « Unlimited Contract » (contrat à durée ILLIMITÉE, donc un CDI) CONTIENT
  // « contract ». Mesuré sur huit boards Greenhouse, 747 offres : c'est la
  // valeur la PLUS fréquente du champ `Employment Type` — 108 des 145 offres
  // qui le portent. Sans ce garde, le collecteur le plus riche en CDI
  // déclarés les publierait tous en CDD, et ce serait une inversion de sens,
  // pas une imprécision. Testé AVANT `contract`, comme `unbefristet` l'est
  // avant `befristet`, et pour exactement la même raison.
  if (/\bunlimited\b/.test(t)) return 'CDI';
  // LE MÊME PIÈGE UNE TROISIÈME FOIS, EN FRANÇAIS, et il arrive par Lever :
  // « contrat à durée INdéterminée » (un CDI) contient « déterminée » (un CDD).
  // Le mot long porte le mot court, et un test par sous-chaîne dans le mauvais
  // ordre inverse le sens de l'offre. Les bornes `\b` suffiraient ici —
  // « indeterminee » n'offre pas de frontière de mot devant « determinee » —
  // mais l'ordre est posé EXPLICITEMENT, comme pour `unbefristet` et pour
  // `unlimited`, parce que c'est l'ordre qui protège et non la chance.
  //
  // MESURÉ sur les 31 boards Lever vivants, 2 044 offres :
  // `categories.commitment` porte 38 valeurs distinctes de texte libre, dont
  // « CDI », « CDD », « CDI / Permanent position », « Permanent contract »,
  // « Fixed-term contract » et « Freelancer ». Sans ce bloc, « CDI » et
  // « CDD » valaient tous les deux `null` : le vocabulaire français n'était
  // écrit nulle part, sur un site d'emploi français.
  if (/\bcdi\b/.test(t) || /\bindetermine(e|es|s)?\b/.test(t)) return 'CDI';  // avant determine
  if (/\bcdd\b/.test(t) || /\bdetermine(e|es|s)?\b/.test(t)) return 'CDD';
  // « Fixed term » et « Fixed-Term » sans le mot « contract » : la
  // normalisation rend « fixed term », que le motif `contract` ne voit pas.
  if (/\bfixed term\b/.test(t)) return 'CDD';
  // « Contractor » n'est pas « contract » pour une borne de mot, et Lever
  // écrit les deux. Le dépôt a déjà tranché ce sens pour JSearch
  // (`contractor: 'CDD'`) ; on ne le tranche pas une seconde fois ailleurs.
  if (/\bcontractors?\b/.test(t)) return 'CDD';
  if (/\b(contract|temporary|zeitarbeit)\b/.test(t)) return 'CDD';
  if (/\b(internship|intern|praktikum|stage)\b/.test(t)) return 'Stage';
  if (/\b(apprenticeship|ausbildung|alternance|apprenti)\b/.test(t)) return 'Alternance';
  if (/\b(freelancer?|freiberufler|selbststandiger)\b/.test(t)) return 'Freelance';
  // « Werkstudent » / « working student » est un statut étudiant allemand qui
  // n'est ni un stage ni une alternance au sens français. Il reste `null` :
  // le rapprocher serait commode et faux.
  return null;
}

export function contratArbeitnow(j) {
  const valeurs = (Array.isArray(j?.job_types) ? j.job_types : []).map(normaliserValeur);
  for (const v of valeurs) {
    const c = contratDepuisTexte(v);
    if (c) return contratPublic(c);
  }
  return contratPublic(detectType(j?.title));
}
export function tempsArbeitnow(j) {
  for (const v of (Array.isArray(j?.job_types) ? j.job_types : []).map(normaliserValeur)) {
    const t = lireTemps(v);
    if (t) return t;
  }
  return null;
}

// ── JSEARCH ──────────────────────────────────────────────────────────────────
// `job_employment_type` mélange contrat et durée de travail dans un seul
// champ. `INTERN` et `CONTRACTOR` portent un contrat ; `FULLTIME` et
// `PARTTIME` n'en portent pas et ne doivent pas en tenir lieu — c'est cette
// confusion qui faisait d'un temps plein un CDI.
const JSEARCH_CONTRAT = { intern: 'Stage', contractor: 'CDD' };

export function contratJSearch(j) {
  const v = normaliserValeur(j?.job_employment_type);
  return contratPublic(JSEARCH_CONTRAT[v] || detectType(j?.job_title));
}
export function tempsJSearch(j) {
  return lireTemps(normaliserValeur(j?.job_employment_type));
}

// ── FRENCH JOB MARKET ────────────────────────────────────────────────────────
// Celui-ci démonte l'explication facile. Le collecteur propage DÉJÀ
// correctement `employment_type` en amont, pour les cinq valeurs — et son
// mappeur écrasait quand même l'étiquette par `detectType(j.title, type)`.
// Propager le filtre ne suffit donc pas : il faut cesser d'écrire l'étiquette
// depuis la requête. Ce sont deux corrections indépendantes, et la seconde est
// la seule qui protège.
const FM_CONTRAT = {
  permanent: 'CDI', temporary: 'CDD', contract: 'CDD',
  internship: 'Stage', apprenticeship: 'Alternance', freelance: 'Freelance',
};

export function contratFrenchMarket(j) {
  return contratPublic(FM_CONTRAT[normaliserValeur(j?.employment_type)] || detectType(j?.title));
}

// ── FRANCE TRAVAIL ───────────────────────────────────────────────────────────
// Le contrat est déclaré par un code (`typeContrat`) doublé d'un libellé libre
// (`typeContratLibelle`, « Contrat à durée indéterminée »). L'ancien mappeur
// prenait le libellé : exact, mais hors du vocabulaire des cinq badges, donc
// illisible pour un filtre comme pour `typeBadgeClass`. On lit le code.
//
// Et seulement les codes dont la correspondance est certaine : `MIS` (mission
// intérimaire) et `SAI` (saisonnier) ne sont aucun de nos cinq contrats et
// valent `null` plutôt qu'un rapprochement commode.
const FT_CONTRAT = {
  CDI: 'CDI', DIN: 'CDI',               // DIN = CDI intérimaire
  CDD: 'CDD', CDS: 'CDD', DDI: 'CDD',   // CDD senior, CDD insertion
  CA: 'Alternance', CP: 'Alternance',   // apprentissage, professionnalisation
  LIB: 'Freelance',
};

export function contratFranceTravail(j) {
  const code = String(j?.typeContrat ?? '').trim().toUpperCase();
  return contratPublic(FT_CONTRAT[code] || detectType(j?.intitule));
}

// ── GREENHOUSE ───────────────────────────────────────────────────────────────
// Greenhouse ne publie AUCUN champ de contrat dans son API de boards. Ce qui
// s'en approche est `metadata`, un tableau de champs que l'employeur configure
// lui-même : la plupart des boards n'en posent aucun, certains en posent
// d'étrangers au sujet (« Headcount # »), et une minorité y met un
// « Employment Type ».
//
// MESURÉ sur huit boards et 747 offres : 145 offres le portent, soit 19,4 %,
// et elles viennent toutes d'UN SEUL board. Les sept autres n'en ont pas une.
// Le champ est donc un signal réel mais rare, et c'est pour cela qu'il vaut
// `null` partout ailleurs plutôt qu'un repli : quatre offres Greenhouse sur
// cinq n'ont pas de contrat lisible, et le dire est l'information.
//
// La valeur est du texte libre tapé par l'employeur, pas une énumération — les
// quatre valeurs relevées sont « Unlimited Contract » (108), « Intern » (33),
// « Unbefristeter Vertrag » (2) et « Working Student » (2). Elle passe donc par
// `contratDepuisTexte`, le même lecteur que les valeurs libres d'Arbeitnow, au
// lieu d'une table de correspondance qui serait fausse à la cinquième valeur.
// « Working Student » y reste `null`, comme « Werkstudent » : le statut
// étudiant allemand n'est ni un stage ni une alternance au sens français.
export function contratGreenhouse(j) {
  const champ = champMetadata(j, 'employment type');
  const parMetadata = champ ? contratDepuisTexte(normaliserValeur(champ)) : null;
  return contratPublic(parMetadata || detectType(j?.title));
}

export function tempsGreenhouse(j) {
  const champ = champMetadata(j, 'employment type');
  return champ ? lireTemps(normaliserValeur(champ)) : null;
}

// ── LEVER ────────────────────────────────────────────────────────────────────
// Lever est plus structuré que Greenhouse : `categories.commitment` porte un
// type d'engagement sur PRESQUE TOUTES les offres, là où le `metadata` de
// Greenhouse n'était rempli que par une offre sur cinq. Mais c'est du TEXTE
// LIBRE choisi par l'employeur, pas une énumération — 38 valeurs distinctes
// relevées sur 31 boards — donc il passe par `contratDepuisTexte`, le même
// lecteur que les valeurs libres d'Arbeitnow et de Greenhouse, et non par une
// table de correspondance qui serait fausse à la trente-neuvième valeur.
//
// CE QUI RESTE `null` À DESSEIN, et ce n'est pas une lacune :
//   · « Remote » — relevé DANS le champ commitment. Ce n'est pas un contrat,
//     c'est un lieu de travail, et il sort par `remote` depuis
//     `workplaceType`. C'est exactement la faute que le collecteur Remotive
//     commettait en écrivant « Remote » dans le champ contrat.
//   · « Full Time », « Part-Time » — une durée de travail, pas un contrat.
//     Elles sortent par `tempsLever`, dans leur propre champ.
//   · « Interim » — une mission d'intérim n'est aucun de nos cinq contrats.
//     Le dépôt l'a déjà tranché pour France Travail, dont les codes `MIS` et
//     `SAI` valent `null` ; on ne décide pas l'inverse ici.
//   · « Working Student », « CLT », « GE Employee », « FR Executive/Cadre »,
//     « Short term » — un statut étudiant allemand, un régime brésilien, deux
//     catégories internes et une durée vague. Les rapprocher de nos cinq
//     libellés serait commode et faux.
export function contratLever(p) {
  const engagement = p?.categories?.commitment;
  const parEngagement = engagement ? contratDepuisTexte(normaliserValeur(engagement)) : null;
  // Le titre d'une offre Lever est dans `text`, pas dans `title`.
  return contratPublic(parEngagement || detectType(p?.text));
}

export function tempsLever(p) {
  const engagement = p?.categories?.commitment;
  return engagement ? lireTemps(normaliserValeur(engagement)) : null;
}

// Un champ `metadata` par son nom. `value` n'est une chaîne que pour un champ
// rempli : un champ non rempli vaut `null`, et un multi-select non rempli vaut
// le tableau vide. Toute forme qui n'est pas une chaîne est traitée comme
// absente — il n'y a rien à y lire, et en tirer quelque chose serait inventer.
export function champMetadata(j, nom) {
  const champs = Array.isArray(j?.metadata) ? j.metadata : [];
  const trouve = champs.find(c => String(c?.name ?? '').trim().toLowerCase() === nom);
  return typeof trouve?.value === 'string' && trouve.value.trim() ? trouve.value : null;
}

// ── SALAIRE ──────────────────────────────────────────────────────────────────
// L'ancienne ligne testait la véracité de la borne basse, pas son ordre de
// grandeur : `j.salary_min ? …` laisse passer 400, qui s'arrondit à `0`, et la
// page affichait « 0k–0k€/an ».
//
// La vérification porte donc sur la SORTIE : les deux bornes sont arrondies
// d'abord, et rien n'est émis si elles valent toutes les deux zéro. Un seuil
// arbitraire sur l'entrée aurait laissé passer la combinaison suivante ; ici
// `0k–0k` est inexprimable par construction.
//
// Reste le cas mitoyen que la sonde a fait apparaître : une borne basse qui
// s'arrondit à zéro quand la haute ne le fait pas (0 → 999 €). « 0k–1k€/an »
// n'est pas `0k–0k`, donc le critère est tenu — mais la borne basse n'y porte
// aucune information, et l'afficher inviterait à lire « ce poste peut payer
// zéro ». On n'émet alors que la borne qui dit quelque chose, comme une limite
// haute. C'est plus pauvre et c'est exact ; inventer une borne basse
// plausible serait la faute que cette mission retire.
export function formaterSalaireAnnuel(min, max) {
  const brutBas = Number(min) || 0;
  const brutHaut = Number(max) || brutBas;
  const bas = Math.round(Math.min(brutBas, brutHaut) / 1000);
  const haut = Math.round(Math.max(brutBas, brutHaut) / 1000);
  if (haut === 0) return null;                 // rien à dire, 0k–0k inclus
  if (bas === 0) return `jusqu'à ${haut}k€/an`; // la borne basse ne dit rien
  return bas === haut ? `${bas}k€/an` : `${bas}k–${haut}k€/an`;
}

// ── SALAIRE SCHEMA.ORG (JSON-LD `baseSalary`) ────────────────────────────────
// Posé ICI, à côté de `formaterSalaireAnnuel`, et pas dans le collecteur
// Teamtailor qui l'a fait apparaître — pour la même raison que les pièges de
// contrat : `schema.org/JobPosting` est un format STANDARD, le prochain
// collecteur qui lira du JSON-LD rencontrera exactement la même forme, et un
// garde recopié est un garde qui diverge.
//
// LE PIÈGE, et il est d'unité, donc du même genre que `unbefristet` /
// `befristet` : il ne rend pas la valeur imprécise, il la rend FAUSSE d'un
// facteur douze. `baseSalary.value.unitText` vaut `YEAR` ou `MONTH`, et
// `formaterSalaireAnnuel` affiche des « k€/an ». Mesuré sur les cinq boards
// Teamtailor qui publient un salaire, 50 offres : 17 sont mensuelles, et ce
// sont des gratifications de stage ou des temps partiels — 640 €, 1 250 €,
// 1 327 €, 1 618,50 €. Passées telles quelles, elles s'afficheraient
// « 1k€/an », « 1k€/an », « 1k€/an », « 2k€/an ». Un candidat lirait qu'un
// poste paie mille euros PAR AN.
//
// On ne les annualise pas pour autant. Multiplier par douze serait de
// l'arithmétique, pas une lecture : la source ne dit ni treize mois, ni brut,
// ni la durée du contrat, et le dépôt n'a aucun affichage mensuel. Une valeur
// mensuelle vaut donc `null` — ce qu'on ne sait pas publier, on ne le publie
// pas.
//
// La devise aussi : l'affichage est en euros, en dur. Sur les mêmes 50
// offres, 6 sont en USD ou GBP et 2 n'ont aucune devise. Les publier
// attribuerait des euros à un montant qui n'en est pas. Elles valent `null`.
//
// Restent 25 offres sur 50 — et c'est la PREMIÈRE fois qu'un collecteur de la
// famille ATS publie un salaire : ni Greenhouse ni Lever n'ont de champ de
// salaire du tout.
export function salaireSchemaOrg(base) {
  if (base?.currency !== 'EUR') return null;
  const v = base?.value;
  if (v?.unitText !== 'YEAR') return null;
  // `minValue` / `maxValue` pour une fourchette, `value` seul pour un montant
  // unique — les deux formes sont servies, et les nombres arrivent en CHAÎNES.
  const bas = Number(v.minValue ?? v.value);
  const haut = Number(v.maxValue ?? v.value);
  if (!Number.isFinite(bas) || !Number.isFinite(haut)) return null;
  return formaterSalaireAnnuel(bas, haut);
}

// ── TEAMTAILOR ───────────────────────────────────────────────────────────────
// Teamtailor sert un JSON Feed dont chaque entrée porte un `_jobposting` en
// `schema.org/JobPosting`. Le standard DÉFINIT `employmentType`, avec une
// énumération fermée (`FULL_TIME`, `PART_TIME`, `CONTRACTOR`, `TEMPORARY`,
// `INTERN`…), et c'est tentant de s'y fier.
//
// MESURÉ : le champ est absent de 602 offres sur 602, sur les 40 boards
// vivants. ZÉRO. Qu'un standard définisse un champ ne veut pas dire que
// l'implémentation le remplit, et c'est le genre de supposition que ce fichier
// existe pour refuser. Le contrat d'une offre Teamtailor retombe donc sur le
// titre, et vaut `null` quand le titre est muet.
//
// Le lecteur est quand même branché, et il ne coûte rien : `contratDepuisTexte`
// couvre déjà tout le vocabulaire de l'énumération — `contractor` et
// `temporary` rendent CDD, `intern` rend Stage, et `full time` / `part time`
// ne rendent AUCUN contrat mais une durée de travail, dans son propre champ.
// Si Teamtailor se met à remplir le champ, il sera lu ; tant qu'il ne le
// remplit pas, le relevé ci-dessus dit pourquoi ce n'est pas une lacune.
export function contratTeamtailor(j) {
  const declare = j?._jobposting?.employmentType;
  const parChamp = declare ? contratDepuisTexte(normaliserValeur(declare)) : null;
  return contratPublic(parChamp || detectType(j?.title));
}

export function tempsTeamtailor(j) {
  const declare = j?._jobposting?.employmentType;
  return declare ? lireTemps(normaliserValeur(declare)) : null;
}

// `salary_is_predicted` d'Adzuna : une fourchette estimée statistiquement par
// Adzuna, pas un montant publié par l'employeur. Le drapeau est posé quand
// l'annonce ne publie aucune fourchette et qu'Adzuna l'estime depuis des
// annonces voisines.
//
// DÉCISION : la fourchette est affichée, et marquée « estimation Adzuna ». Ne
// rien afficher privait le candidat d'un ordre de grandeur réel ; l'afficher
// comme les autres lui attribuerait un employeur qui ne l'a jamais publiée. La
// troisième voie est la seule qui ne mente ni par omission ni par attribution
// — à condition que la mention soit portée par l'interface, et jamais le
// libellé « salaire proposé ». C'est `salaryEstimated` qui la déclenche, et le
// garde n°15 vérifie que le badge correspondant reste distinct du badge gris
// des salaires annoncés.
//
// La comparaison est explicite, et c'est nécessaire : les réponses publiées
// donnent le champ comme la CHAÎNE `"0"` chez certains clients et l'entier `0`
// chez d'autres. Un `if (j.salary_is_predicted)` marquerait donc TOUTES les
// offres comme estimées, puisque `Boolean("0") === true`. On compare la valeur,
// pas sa véracité.
export function estSalaireEstime(v) {
  return String(v) === '1';
}
