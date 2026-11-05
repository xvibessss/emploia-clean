// Sonde du collecteur Ashby.
//
// HORS LIGNE, comme les trois sondes d'ATS qui la précèdent : le réseau est
// injecté (`fetchImpl`), donc elle teste le collecteur et non la disponibilité
// d'Ashby. Une sonde qui échoue parce qu'un board a été retiré par son
// employeur n'apprend rien sur le code.
//
// Ce qu'elle verrouille, dans l'ordre d'importance :
//   1. `isRemote` n'est JAMAIS lu comme du distanciel. 2 253 offres hybrides
//      le portent à `true`, et dans api/jobs.js une offre distancielle matche
//      TOUS les filtres de lieu : les confondre inonderait chaque page ville.
//   2. Un salaire que l'employeur a refusé d'afficher n'est jamais publié, et
//      l'equity n'est jamais présentée comme de la paie.
//   3. Le pays et le texte du lieu se complètent au lieu de s'exclure.
//   4. Une offre dépubliée (`isListed: false`) n'est pas servie.
//   5. Un board en échec ne fait pas tomber les trente-deux autres.
import fs from 'node:fs';
import vm from 'node:vm';
import {
  collecterBoard, collecterAshby, normaliserOffre, paysAshby, segmentsDeLieu,
  texteDeContenu, estDistanciel, lieuAffiche, lieuxDeLOffre, offrePubliee,
  offreExploitable,
} from '../../api/_lib/ashby.js';
import { FOURNISSEURS, TTL_SECONDES, MAX_OFFRES, collecterFournisseur } from '../../api/_lib/ats.js';
import { causeDepuisBalise } from '../../api/_lib/ats-balise.js';
import { BOARDS, RELEVE } from '../../api/_lib/ashby-boards.js';
import { CONTRATS, contratAshby, tempsAshby, salaireAshby } from '../../api/_lib/contrat.js';

let passed = 0, failed = 0;
function check(label, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const reponse = (corps, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => corps });
const entree = { board: 'acme', company: 'Acme' };
const salaireComp = (type, interval, devise, min, max) => ({
  shouldDisplayCompensationOnJobPostings: true,
  compensation: { summaryComponents: [{ compensationType: type, interval, currencyCode: devise, minValue: min, maxValue: max }] },
});
const job = (p = {}) => ({
  id: 'f00-ba4',
  title: 'Ingénieur Backend',
  employmentType: 'FullTime',
  location: 'Paris, France',
  secondaryLocations: [],
  publishedAt: '2026-10-01T08:00:00.000+00:00',
  isListed: true,
  isRemote: null,
  workplaceType: 'OnSite',
  address: { postalAddress: { addressCountry: 'France' } },
  jobUrl: 'https://jobs.ashbyhq.com/acme/f00-ba4',
  applyUrl: 'https://jobs.ashbyhq.com/acme/f00-ba4/application',
  descriptionPlain: "Rejoignez l'équipe",
  descriptionHtml: "<p>Rejoignez l'équipe</p>",
  ...p,
});

console.log('\n── Forme de sortie ──────────────────────────────────');
const o = normaliserOffre(job(), entree);
for (const champ of ['id', 'title', 'company', 'location', 'type', 'salary', 'description', 'url', 'date', 'remote', 'source', 'logo', 'country']) {
  check(`le champ « ${champ} » existe`, champ in o);
}
check('l’identifiant est préfixé par la source et le board', o.id === 'ab_acme_f00-ba4', o.id);
check('la source est nommée', o.source === 'Ashby');
check('la date est déjà ISO, servie telle quelle', o.date === '2026-10-01T08:00:00.000+00:00', o.date);
check('le contrat sort du vocabulaire fermé ou vaut null',
  o.type === null || CONTRATS.has(o.type), String(o.type));

console.log('\n── LE PIÈGE isRemote : il inonderait toutes les pages ');
// Mesuré : 3 590 offres portent `isRemote: true`, dont 2 253 dont le
// `workplaceType` n'est PAS « Remote » — des postes hybrides à Paris ou
// Madrid. Dans api/jobs.js, `j.remote` fait matcher une offre avec TOUS les
// filtres de lieu.
check('isRemote=true avec workplaceType "Hybrid" n’est PAS du distanciel',
  !estDistanciel({ isRemote: true, workplaceType: 'Hybrid', location: 'Paris, France' }));
check('… et l’offre normalisée sort remote=false',
  normaliserOffre(job({ isRemote: true, workplaceType: 'Hybrid' }), entree).remote === false);
check('workplaceType "Remote" est du distanciel',
  estDistanciel({ isRemote: true, workplaceType: 'Remote', location: 'Anywhere' }));
check('workplaceType "OnSite" ne l’est pas',
  !estDistanciel({ isRemote: false, workplaceType: 'OnSite', location: 'Paris' }));
check('isRemote=true seul, sans workplaceType, ne suffit pas non plus',
  !estDistanciel({ isRemote: true, workplaceType: null, location: 'Paris, France' }));
check('sans workplaceType, c’est le TEXTE du lieu qui décide',
  estDistanciel({ isRemote: null, workplaceType: null, location: 'Anywhere in France' }));

console.log('\n── LE SALAIRE : un choix de l’employeur, et de l’equity ');
check('un salaire consenti, annuel et en euros est publié',
  salaireAshby(salaireComp('Salary', '1 YEAR', 'EUR', 46000, 53000)) === '46k–53k€/an',
  String(salaireAshby(salaireComp('Salary', '1 YEAR', 'EUR', 46000, 53000))));
// LE GARDE QUI RESPECTE UNE DÉCISION HUMAINE. Ashby caviarde lui-même quand le
// drapeau est à false — mesuré : 0 fuite sur 3 114 offres — mais s'en remettre
// à l'API pour respecter le choix d'un employeur serait s'en remettre à un
// détail d'implémentation.
check('un salaire que l’employeur a refusé d’afficher n’est PAS publié',
  salaireAshby({ ...salaireComp('Salary', '1 YEAR', 'EUR', 46000, 53000), shouldDisplayCompensationOnJobPostings: false }) === null);
// LA FAUTE DE CATÉGORIE : `compensationTierSummary` mélange salaire et equity
// dans une seule chaîne. On descend dans les composants typés.
check('de l’EQUITY n’est pas présentée comme un salaire',
  salaireAshby(salaireComp('EquityCashValue', '1 YEAR', 'EUR', 18000, 27000)) === null);
check('un bonus non plus',
  salaireAshby(salaireComp('Bonus', '1 YEAR', 'EUR', 5000, 9000)) === null);
check('une commission non plus',
  salaireAshby(salaireComp('Commission', '1 YEAR', 'EUR', 10000, 20000)) === null);
// L'intervalle : relevé « 1 HOUR », « 1 WEEK », « 1 MONTH », « 1 YEAR » et
// « NONE ». Seul l'annuel s'affiche en « k€/an ».
for (const i of ['1 HOUR', '1 WEEK', '1 MONTH', 'NONE']) {
  check(`un salaire « ${i} » n’est pas publié comme annuel`,
    salaireAshby(salaireComp('Salary', i, 'EUR', 3000, 4000)) === null);
}
check('une devise étrangère n’est pas affichée en euros',
  salaireAshby(salaireComp('Salary', '1 YEAR', 'USD', 140000, 160000)) === null);
check('une devise absente vaut null, pas « euros par défaut »',
  salaireAshby(salaireComp('Salary', '1 YEAR', null, 50000, 60000)) === null);
check('aucune rémunération → null, pas une fourchette inventée',
  normaliserOffre(job(), entree).salary === null);
check('le collecteur publie le salaire quand les trois filtres passent',
  normaliserOffre(job(salaireComp('Salary', '1 YEAR', 'EUR', 40000, 50000)), entree).salary === '40k–50k€/an');

console.log('\n── Le contrat : l’énumération propre d’Ashby ────────');
check('Contract est un CDD', contratAshby({ employmentType: 'Contract' }) === 'CDD');
check('Temporary est un CDD', contratAshby({ employmentType: 'Temporary' }) === 'CDD');
check('Intern est un Stage', contratAshby({ employmentType: 'Intern' }) === 'Stage');
check('FullTime n’est PAS un contrat', contratAshby({ employmentType: 'FullTime' }) === null);
check('FullTime est une durée de travail, dans son propre champ',
  tempsAshby({ employmentType: 'FullTime' }) === 'Temps plein');
check('PartTime sort en temps partiel sans toucher le contrat',
  tempsAshby({ employmentType: 'PartTime' }) === 'Temps partiel' &&
  contratAshby({ employmentType: 'PartTime' }) === null);
check('sans employmentType, le contrat retombe sur le titre',
  contratAshby({ title: 'Stage Marketing — 6 mois' }) === 'Stage');
check('un titre muet ne devient pas un CDI',
  contratAshby({ title: 'Account Executive' }) === null);

console.log('\n── Localisation : deux champs faux dans deux sens ───');
const P = (pays, lieu) => ({ location: lieu, address: { postalAddress: { addressCountry: pays } } });
check('un lieu français est français', paysAshby(P('France', 'Paris, France')) === 'FR');
// Mesuré : 87 offres portent « France » sur un texte qui ne la nomme pas.
check('le PAYS rattrape une commune hors liste',
  paysAshby(P('France', 'Bourg en Bresse')) === 'FR');
// Mesuré : 41 offres font l'inverse — texte français, pays « European Union ».
check('le TEXTE rattrape un pays régional',
  paysAshby(P('European Union', 'Paris, France; Bordeaux, France')) === 'FR');
check('le TEXTE suffit quand aucun pays n’est déclaré',
  paysAshby(P('', 'Paris, France; Lyon, France')) === 'FR');
check('la France nommée parmi trois pays reste la France',
  paysAshby(P('European Union', 'Anywhere in France, Belgium, Spain')) === 'FR');
// LE GARDE QUI COMPTE LE PLUS ICI : « European Union » est écrit dans le champ
// PAYS. Le traiter comme un pays français rendrait française toute offre
// européenne.
check('« European Union » n’est PAS la France',
  paysAshby(P('European Union', 'Brussels, Belgium')) === 'EU');
check('un pays de l’Union donne EU', paysAshby(P('Belgium', 'Anywhere in Belgium')) === 'EU');
check('un pays hors Union donne INTL', paysAshby(P('United States', 'Austin, TX')) === 'INTL');
check('« Paris, Texas, United States » n’est pas en France',
  paysAshby(P('', 'Paris, Texas, United States')) === 'INTL');
check('un lieu inconnu ne devient pas la France', paysAshby(P('', 'Žilina')) === null);
check('les lieux multiples sont découpés sur le point-virgule',
  segmentsDeLieu('Paris, France; Lyon, France; Nantes, France').length === 3);
// Mesuré : une offre « Anywhere in Belgium » ouverte aussi « Anywhere in
// France ». Le champ nomme de vrais lieux supplémentaires, pas des bureaux
// comme l'allLocations de Lever.
check('la France en lieu SECONDAIRE compte',
  paysAshby({ ...P('Belgium', 'Anywhere in Belgium'), secondaryLocations: [P('France', 'Anywhere in France')] }) === 'FR');
check('les lieux principal et secondaires sont réunis',
  lieuxDeLOffre({ ...P('France', 'Paris'), secondaryLocations: [P('Belgium', 'Brussels')] }).length === 2);
check('le lieu affiché reprend le texte de l’employeur',
  lieuAffiche(P('France', 'Paris, France')) === 'Paris, France');
check('un lieu absent s’affiche « Non précisé »', lieuAffiche({}) === 'Non précisé');
check('le lieu affiché est borné', lieuAffiche(P('France', 'x'.repeat(300))).length <= 120);

console.log('\n── Une offre dépubliée n’est pas servie ─────────────');
check('isListed=false est écartée', !offrePubliee({ isListed: false }));
check('isListed=true est gardée', offrePubliee({ isListed: true }));
check('isListed absent est gardé — l’absence n’est pas un retrait', offrePubliee({}));
const journalListe = [];
const avecDepubliee = await collecterBoard(entree, {
  journal: journalListe,
  fetchImpl: async () => reponse({ jobs: [job(), job({ id: 'retiree', isListed: false })] }),
});
check('le collecteur ne rend que les offres publiées',
  avecDepubliee.length === 1 && avecDepubliee[0].id === 'ab_acme_f00-ba4', `${avecDepubliee.length} offre(s)`);

console.log('\n── Description ──────────────────────────────────────');
check('le texte dépouillé est pris tel quel', o.description === "Rejoignez l'équipe", JSON.stringify(o.description));
check('à défaut, le HTML est dépouillé',
  texteDeContenu({ descriptionHtml: '<p>Bonjour   <b>toi</b></p>' }) === 'Bonjour toi');
check('la description est bornée à 300 caractères',
  texteDeContenu({ descriptionPlain: 'a'.repeat(500) }).length === 300);
check('un contenu absent ne casse rien', texteDeContenu({}) === '');

console.log('\n── Un board en échec n’en emporte pas trente-deux ───');
const journal = [];
const introuvable = await collecterBoard(entree, { journal, fetchImpl: async () => reponse(null, { ok: false, status: 404 }) });
check('un board disparu rend une liste vide', Array.isArray(introuvable) && introuvable.length === 0);
check('et le dit au journal avec un code HTTP', journal.at(-1)?.cause === 'http_404', journal.at(-1)?.cause);

const malforme = await collecterBoard(entree, { journal, fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }) });
check('un JSON illisible rend une liste vide', malforme.length === 0);
check('et le dit', journal.at(-1)?.cause === 'reponse_illisible');

// LA DISTINCTION QUE CE RELEVÉ A RAMENÉE : un 200 sans tableau `jobs` est
// ILLISIBLE, alors qu'un 200 avec `{"jobs":[]}` est un board réel et vide.
const sansJobs = await collecterBoard(entree, { journal, fetchImpl: async () => reponse({ apiVersion: '1' }) });
check('un 200 sans tableau « jobs » est illisible, pas vide',
  sansJobs.length === 0 && journal.at(-1)?.cause === 'reponse_illisible');
const journalVide = [];
const boardVide = await collecterBoard(entree, { journal: journalVide, fetchImpl: async () => reponse({ jobs: [], apiVersion: '1' }) });
check('un board réel mais VIDE rend une liste vide SANS déclarer d’échec',
  boardVide.length === 0 && journalVide.length === 0);

const reseau = await collecterBoard(entree, { journal, fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
check('une panne réseau rend une liste vide', reseau.length === 0);
check('et le dit', journal.at(-1)?.cause === 'erreur_reseau');

const coupure = await collecterBoard(entree, { journal, timeout: 5, fetchImpl: async () => { const e = new Error('abort'); e.name = 'AbortError'; throw e; } });
check('un délai dépassé est nommé « timeout »',
  coupure.length === 0 && journal.at(-1)?.cause === 'timeout');

const journalMixte = [];
const melange = await collecterAshby(
  [{ board: 'vivant', company: 'Vivant' }, { board: 'mort', company: 'Mort' }, { board: 'illisible', company: 'Illisible' }],
  {
    journal: journalMixte, concurrence: 2,
    fetchImpl: async (url) => {
      if (url.includes('/mort')) return reponse(null, { ok: false, status: 404 });
      if (url.includes('/illisible')) throw new Error('ECONNRESET');
      return reponse({ jobs: [job()] });
    },
  });
check('deux boards en échec sur trois n’empêchent pas le troisième de rendre',
  melange.length === 1 && melange[0].company === 'Vivant', `${melange.length} offre(s)`);
check('les deux échecs sont journalisés nommément',
  journalMixte.length === 2 && journalMixte.every(e => /^Ashby\//.test(e.source)),
  JSON.stringify(journalMixte.map(e => `${e.source}:${e.cause}`)));

console.log('\n── Hygiène ──────────────────────────────────────────');
const brut = job();
const avant = JSON.stringify(brut);
normaliserOffre(brut, entree);
check('l’offre amont n’est pas mutée', JSON.stringify(brut) === avant);
check('une offre sans titre est écartée', !offreExploitable(normaliserOffre({ id: 1, jobUrl: 'https://x' }, entree)));
check('une offre sans URL est écartée', !offreExploitable(normaliserOffre({ id: 1, title: 'T' }, entree)));

console.log('\n── Catalogue ────────────────────────────────────────');
check('le catalogue n’est pas vide', BOARDS.length > 0, `${BOARDS.length} boards`);
check('chaque entrée porte un board et une entreprise', BOARDS.every(b => b.board && b.company));
check('aucun board en double', new Set(BOARDS.map(b => b.board)).size === BOARDS.length);
check('chaque board porte un relevé chiffré', BOARDS.every(b => Number.isInteger(b.offresFR) && b.offresFR >= 0));
// LE CRITÈRE D'INSCRIPTION EST LE CONTENU, pas le code HTTP : 14 boards
// répondent 200 avec zéro offre et ne sont pas inscrits.
check('aucun board inscrit sans offre française au relevé', BOARDS.every(b => b.offresFR > 0));
check('la date du relevé est inscrite', /^\d{4}-\d{2}-\d{2}$/.test(RELEVE), RELEVE);
check('les board ids sont des slugs sûrs en URL', BOARDS.every(b => /^[a-z0-9-]+$/.test(b.board)));

console.log('\n── Le registre des ATS ──────────────────────────────');
const vercel = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const atsSrc = fs.readFileSync(new URL('../../api/_lib/ats.js', import.meta.url), 'utf8');
const cronSrc = fs.readFileSync(new URL('../../api/cron/collect-ats.js', import.meta.url), 'utf8');
const jobsSrc = fs.readFileSync(new URL('../../api/jobs.js', import.meta.url), 'utf8');

check('Ashby est inscrit au registre', FOURNISSEURS.some(f => f.nom === 'Ashby'));
check('chaque fournisseur porte une clé KV, un catalogue et un collecteur',
  FOURNISSEURS.every(f => f.cle && Array.isArray(f.boards) && typeof f.collecter === 'function'));
check('aucune clé KV partagée entre deux fournisseurs',
  new Set(FOURNISSEURS.map(f => f.cle)).size === FOURNISSEURS.length);
// La promesse du registre : un ATS de plus ne coûte pas un cron. Le garde ne
// compte pas les crons du dépôt — un autre peut légitimement en ajouter — il
// vérifie qu'aucun ne porte le nom d'un ATS.
const cronsAts = (vercel.crons || []).filter(c => /\/collect-ats$/.test(c.path));
check('le registre a son cron, et un seul', cronsAts.length === 1,
  `${FOURNISSEURS.length} fournisseurs → ${cronsAts.length} cron`);
const cronsParAts = (vercel.crons || []).filter(c =>
  FOURNISSEURS.some(f => new RegExp(`collect-${f.nom.toLowerCase()}$`).test(c.path)));
check('aucun cron ne porte le nom d’un ATS — le registre n’est pas contourné',
  cronsParAts.length === 0, cronsParAts.length ? cronsParAts.map(c => c.path).join(', ') : 'aucun');

const faux = { nom: 'Ashby', cle: 'ashby_jobs', concurrence: 2, boards: [{ board: 'acme', company: 'Acme' }], collecter: collecterAshby };
const vide = await collecterFournisseur(faux, { fetchImpl: async () => reponse({ jobs: [] }) });
check('une collecte vide ne demande PAS d’écriture', vide.ecrire === false);
const etrangere = await collecterFournisseur(faux, {
  fetchImpl: async () => reponse({ jobs: [job({ location: 'Berlin, Germany', address: { postalAddress: { addressCountry: 'Germany' } } })] }),
});
check('une collecte sans offre française ne demande pas d’écriture',
  etrangere.ecrire === false && etrangere.stats.offresFrance === 0);
const pleine = await collecterFournisseur(faux, { fetchImpl: async () => reponse({ jobs: [job()] }) });
check('une collecte française demande l’écriture', pleine.ecrire === true);
check('seules les offres françaises sont retenues', pleine.valeur.offres.every(x => x.country === 'FR'));
check('la borne de taille et le TTL sont communs à tous les fournisseurs',
  MAX_OFFRES > 0 && TTL_SECONDES > 24 * 3600, `${MAX_OFFRES} offres, TTL ${TTL_SECONDES / 3600} h`);

console.log('\n── Branchement dans api/jobs.js ─────────────────────');
check('api/jobs.js porte un collecteur Ashby', /async function fetchAshby\(/.test(jobsSrc));
check('et il lit la clé qu’écrit le cron',
  jobsSrc.includes("kvGet('ashby_jobs')") && FOURNISSEURS.find(f => f.nom === 'Ashby')?.cle === 'ashby_jobs');
check('un réservoir vide déclare la source en échec, via la balise',
  /muet\(journal, 'Ashby',[\s\S]{0,140}?causeDepuisBalise\(await lireBalise\(\), 'Ashby'\)\)/.test(jobsSrc));
check('… et le vide est traité comme l’absence, pas servi en silence',
  /!offres \|\| !offres\.length/.test(jobsSrc));

const ordre = [...jobsSrc.matchAll(/\['([^']+)',\s+\(\) =>/g)].map(m => m[1]);
check('Ashby est dans la liste des collecteurs', ordre.includes('Ashby'), ordre.join(' → '));
const iAB = ordre.indexOf('Ashby');
for (const tiers of ['France Travail', 'French Job Market', 'JSearch', 'Adzuna', 'Remotive', 'Arbeitnow']) {
  const i = ordre.indexOf(tiers);
  check(`Ashby passe avant ${tiers} (le dédoublonnage garde la 1re occurrence)`,
    iAB >= 0 && i >= 0 && iAB < i);
}

function extraire(src, nom) {
  const i = src.indexOf(`async function ${nom}(`);
  if (i < 0) return null;
  let p = 0;
  const debut = src.indexOf('{', i);
  for (let j = debut; j < src.length; j++) {
    if (src[j] === '{') p++;
    else if (src[j] === '}' && --p === 0) return src.slice(i, j + 1);
  }
  return null;
}
const blocFetch = extraire(jobsSrc, 'fetchAshby');
check('le collecteur du handler est extractible pour être exécuté', Boolean(blocFetch));

async function appeler(contenuKV, { q = '', type = '', location = '', page = 0, balise = null } = {}) {
  const j = [];
  const bac = {
    console,
    kvGet: async () => contenuKV,
    muet: (jj, source, raison, cause) => { jj?.push({ source, raison, cause: cause || 'inconnue' }); return []; },
    causeDepuisBalise,
    lireBalise: async () => balise,
    FILTRE_VERS_CONTRAT: { stage: 'Stage', alternance: 'Alternance', cdi: 'CDI', cdd: 'CDD', freelance: 'Freelance' },
    resultat: null, journal: j,
  };
  vm.createContext(bac);
  vm.runInContext(`${blocFetch}; resultat = fetchAshby(${JSON.stringify(q)}, ${JSON.stringify(type)}, ${JSON.stringify(location)}, ${page}, journal, lireBalise);`, bac);
  return { offres: await bac.resultat, journal: j };
}

const offreKV = (p = {}) => ({
  id: 'ab_acme_1', title: 'Développeur Backend', company: 'Acme', location: 'Paris, France',
  type: 'CDD', salary: null, description: 'Node.js', url: 'https://jobs.ashbyhq.com/acme/1',
  date: '2026-10-01T08:00:00Z', remote: false, source: 'Ashby', logo: null, country: 'FR', ...p,
});

const absente = await appeler(null);
check('une clé KV absente n’est PAS une liste vide — la source est déclarée en échec',
  absente.offres.length === 0 && Boolean(absente.journal.at(-1)?.cause), absente.journal.at(-1)?.cause);
const vidée = await appeler({ offres: [] });
check('un réservoir vide est déclaré en échec, pas servi',
  vidée.offres.length === 0 && Boolean(vidée.journal.at(-1)?.cause));
const normal = await appeler({ offres: [offreKV()] });
check('une clé valide rend ses offres', normal.offres.length === 1 && normal.journal.length === 0);

const avecInconnu = { offres: [offreKV(), offreKV({ id: 'ab_acme_2', title: 'Account Executive', type: null })] };
check('sous filtre CDD, seule l’offre au contrat LU est rendue',
  (await appeler(avecInconnu, { type: 'cdd' })).offres.length === 1);
check('sous filtre CDI, une offre au contrat inconnu n’est pas servie comme CDI',
  (await appeler(avecInconnu, { type: 'cdi' })).offres.length === 0);
check('hors filtre, l’offre au contrat inconnu est servie telle quelle',
  (await appeler(avecInconnu)).offres.length === 2);

const cent = { offres: Array.from({ length: 100 }, (_, i) => offreKV({ id: `ab_acme_${i}`, title: `Poste ${i}`, date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T08:00:00Z` })) };
const p0 = await appeler(cent);
const p1 = await appeler(cent, { page: 1 });
check('une page rend au plus dix offres', p0.offres.length === 10, `${p0.offres.length}`);
check('deux pages consécutives ne se recouvrent pas', !p0.offres.some(a => p1.offres.some(b => b.id === a.id)));
check('les plus récentes d’abord', new Date(p0.offres[0].date) >= new Date(p0.offres.at(-1).date));
check('le terme de recherche filtre vraiment',
  (await appeler(cent, { q: 'Poste 7' })).offres.every(x => /Poste 7/.test(x.title)));

console.log('\n── Le cron de collecte ──────────────────────────────');
check('le cron refuse un appel sans CRON_SECRET', /CRON_SECRET/.test(cronSrc) && /\b401\b/.test(cronSrc));
check('un fournisseur qui échoue n’emporte pas les autres',
  /catch \(e\)/.test(cronSrc) && /continue;/.test(cronSrc));
check('le registre ne stocke que ce dont le pays est établi comme la France',
  /country === 'FR'/.test(atsSrc));
check('le cron n’est pas en runtime Edge (trois ATS ≈ 40 s > 25 s)',
  !/runtime:\s*'edge'/.test(cronSrc));
const dureeAts = (vercel.functions || {})['api/cron/collect-ats.js']?.maxDuration;
check('la durée réservée couvre trois ATS avec de la marge',
  Number(dureeAts) >= 120, `maxDuration ${dureeAts} s`);

if (failed) { console.error(`\n❌ sonde Ashby : ${failed} échec(s)\n`); process.exit(1); }
console.log(`\n✅ sonde Ashby : ${passed} vérifications OK\n`);
