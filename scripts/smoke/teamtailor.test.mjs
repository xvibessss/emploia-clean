// Sonde du collecteur Teamtailor.
//
// HORS LIGNE, comme `greenhouse.test.mjs` et `teamtailor`'s prédécesseur
// `lever.test.mjs` : le réseau est injecté (`fetchImpl`), donc la sonde teste
// le collecteur et non la disponibilité de Teamtailor. Une sonde qui échoue
// parce qu'un board a été retiré par son employeur n'apprend rien sur le code.
//
// Ce qu'elle verrouille, dans l'ordre d'importance :
//   1. Un salaire MENSUEL n'est jamais publié en « k€/an » — le piège d'unité,
//      qui ne rend pas la valeur imprécise mais fausse d'un facteur douze.
//   2. Un board en échec ne fait pas tomber les dix-huit autres.
//   3. Une offre ouverte à Paris ET Londres est française.
//   4. Ce que la source ne porte pas sort `null` : contrat, distanciel.
//   5. La forme de sortie est celle des autres collecteurs.
import fs from 'node:fs';
import vm from 'node:vm';
import {
  collecterBoard, collecterTeamtailor, normaliserOffre, paysTeamtailor,
  texteDeContenu, estDistanciel, lieuAffiche, lieuxDeLOffre, offreExploitable,
} from '../../api/_lib/teamtailor.js';
import { FOURNISSEURS, TTL_SECONDES, MAX_OFFRES, collecterFournisseur } from '../../api/_lib/ats.js';
import { causeDepuisBalise } from '../../api/_lib/ats-balise.js';
import { BOARDS, RELEVE } from '../../api/_lib/teamtailor-boards.js';
import {
  CONTRATS, contratTeamtailor, tempsTeamtailor, salaireSchemaOrg,
} from '../../api/_lib/contrat.js';

let passed = 0, failed = 0;
function check(label, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const reponse = (corps, { ok = true, status = 200 } = {}) => ({
  ok, status, json: async () => corps,
});
const entree = { board: 'acme', company: 'Acme' };
const place = (pays, ville) => ({ '@type': 'Place', address: { '@type': 'PostalAddress', addressCountry: pays, addressLocality: ville } });
const item = (p = {}) => ({
  id: 'f00-ba4',
  title: 'Ingénieur Backend',
  url: 'https://careers.acme.com/jobs/123-ingenieur-backend',
  date_published: '2026-10-01T08:00:00+02:00',
  content_html: '<p>Rejoignez l&#39;équipe</p>',
  _jobposting: {
    '@type': 'JobPosting',
    title: 'Ingénieur Backend',
    datePosted: '2026-10-01T08:00:00+02:00',
    jobLocation: [place('FR', 'Paris')],
    ...(p.jp || {}),
  },
  ...p.item,
});

console.log('\n── Forme de sortie ──────────────────────────────────');
const o = normaliserOffre(item(), entree);
for (const champ of ['id', 'title', 'company', 'location', 'type', 'salary', 'description', 'url', 'date', 'remote', 'source', 'logo', 'country']) {
  check(`le champ « ${champ} » existe`, champ in o);
}
check('l’identifiant est préfixé par la source et le board', o.id === 'tt_acme_f00-ba4', o.id);
check('la source est nommée', o.source === 'Teamtailor');
check('l’URL est celle de l’employeur', o.url.includes('careers.acme.com'), o.url);
check('la date est déjà une chaîne ISO, servie telle quelle',
  o.date === '2026-10-01T08:00:00+02:00', o.date);
check('le contrat sort du vocabulaire fermé ou vaut null',
  o.type === null || CONTRATS.has(o.type), String(o.type));

console.log('\n── LE PIÈGE DU SALAIRE : une unité, pas une imprécision ');
// Mesuré sur les cinq boards Teamtailor qui publient un salaire, 50 offres :
// 17 sont MENSUELLES, et ce sont des gratifications de stage — 640 €, 1 250 €,
// 1 327 €. `formaterSalaireAnnuel` affiche des « k€/an » : passées telles
// quelles, elles diraient à un candidat qu'un poste paie mille euros PAR AN.
const euroAn = (min, max) => ({ currency: 'EUR', value: { unitText: 'YEAR', minValue: String(min), maxValue: String(max) } });
check('une fourchette en euros annuels est publiée',
  salaireSchemaOrg(euroAn(35000, 45000)) === '35k–45k€/an', String(salaireSchemaOrg(euroAn(35000, 45000))));
check('un montant unique en euros annuels est publié',
  salaireSchemaOrg({ currency: 'EUR', value: { unitText: 'YEAR', value: '19422' } }) === '19k€/an');
check('un salaire MENSUEL n’est PAS publié — « 1k€/an » serait 12× trop bas',
  salaireSchemaOrg({ currency: 'EUR', value: { unitText: 'MONTH', value: '1327' } }) === null);
check('une fourchette mensuelle non plus',
  salaireSchemaOrg({ currency: 'EUR', value: { unitText: 'MONTH', minValue: '900', maxValue: '1500' } }) === null);
check('un salaire en USD n’est pas affiché comme des euros',
  salaireSchemaOrg({ currency: 'USD', value: { unitText: 'YEAR', minValue: '140000', maxValue: '160000' } }) === null);
check('un salaire en GBP non plus',
  salaireSchemaOrg({ currency: 'GBP', value: { unitText: 'YEAR', minValue: '65000', maxValue: '75000' } }) === null);
check('une devise absente vaut null, pas « euros par défaut »',
  salaireSchemaOrg({ currency: null, value: { unitText: 'YEAR', minValue: '50000', maxValue: '60000' } }) === null);
check('une unité absente vaut null',
  salaireSchemaOrg({ currency: 'EUR', value: { minValue: '50000' } }) === null);
check('un baseSalary absent vaut null', salaireSchemaOrg(undefined) === null);
check('une valeur illisible vaut null, pas NaN',
  salaireSchemaOrg({ currency: 'EUR', value: { unitText: 'YEAR', value: 'à négocier' } }) === null);
check('le collecteur publie le salaire quand il est sûr',
  normaliserOffre(item({ jp: { baseSalary: euroAn(40000, 50000) } }), entree).salary === '40k–50k€/an');
check('et laisse null quand il est mensuel',
  normaliserOffre(item({ jp: { baseSalary: { currency: 'EUR', value: { unitText: 'MONTH', value: '1327' } } } }), entree).salary === null);
check('aucun salaire déclaré → null, pas une fourchette inventée',
  normaliserOffre(item(), entree).salary === null);

console.log('\n── Le contrat : un standard qui ne remplit pas son champ ');
// `schema.org/JobPosting` DÉFINIT `employmentType` avec une énumération
// fermée. Mesuré : le champ est absent de 602 offres sur 602. Le lecteur est
// branché quand même — il ne coûte rien et réutilise le vocabulaire partagé —
// mais le contrat retombe sur le titre, et vaut null quand le titre est muet.
check('CONTRACTOR est un CDD',
  contratTeamtailor({ _jobposting: { employmentType: 'CONTRACTOR' } }) === 'CDD');
check('TEMPORARY est un CDD',
  contratTeamtailor({ _jobposting: { employmentType: 'TEMPORARY' } }) === 'CDD');
check('INTERN est un Stage',
  contratTeamtailor({ _jobposting: { employmentType: 'INTERN' } }) === 'Stage');
check('FULL_TIME n’est PAS un contrat',
  contratTeamtailor({ _jobposting: { employmentType: 'FULL_TIME' } }) === null);
check('FULL_TIME est une durée de travail, dans son propre champ',
  tempsTeamtailor({ _jobposting: { employmentType: 'FULL_TIME' } }) === 'Temps plein');
check('PART_TIME sort en temps partiel sans toucher le contrat',
  tempsTeamtailor({ _jobposting: { employmentType: 'PART_TIME' } }) === 'Temps partiel' &&
  contratTeamtailor({ _jobposting: { employmentType: 'PART_TIME' } }) === null);
check('VOLUNTEER reste inconnu — ce n’est aucun de nos cinq contrats',
  contratTeamtailor({ _jobposting: { employmentType: 'VOLUNTEER' } }) === null);
check('OTHER reste inconnu',
  contratTeamtailor({ _jobposting: { employmentType: 'OTHER' } }) === null);
check('sans employmentType, le contrat retombe sur le titre',
  contratTeamtailor({ title: 'Stage Marketing — 6 mois' }) === 'Stage');
check('un titre muet ne devient pas un CDI',
  contratTeamtailor({ title: 'Account Executive' }) === null);

console.log('\n── Localisation : un TABLEAU, et il est légitime ────');
check('un lieu français donne FR', paysTeamtailor(item()) === 'FR');
// LA DIFFÉRENCE AVEC LEVER, et elle décide du calcul. Chez Lever,
// `allLocations` DOUBLAIT un champ `location` principal, donc le tableau
// nommait des bureaux et non le lieu du poste : 6 offres non françaises y
// nommaient la France. Chez Teamtailor, `jobLocation` EST le champ de lieu, et
// schema.org le définit pluriel pour les postes réellement ouverts à plusieurs
// sites. Mesuré : 24 offres sur 602 mêlent la France à un autre pays, du type
// « FR/Paris + GB/London ». Un candidat qui cherche à Paris peut y postuler.
check('une offre ouverte à Paris ET Londres est française',
  paysTeamtailor(item({ jp: { jobLocation: [place('FR', 'Paris'), place('GB', 'London')] } })) === 'FR');
check('… quel que soit l’ordre des lieux',
  paysTeamtailor(item({ jp: { jobLocation: [place('GB', 'London'), place('FR', 'Paris')] } })) === 'FR');
check('une offre à Berlin et Vienne n’est pas française',
  paysTeamtailor(item({ jp: { jobLocation: [place('DE', 'Berlin'), place('AT', 'Wien')] } })) === 'EU');
check('un pays hors Union donne INTL',
  paysTeamtailor(item({ jp: { jobLocation: [place('US', 'Austin')] } })) === 'INTL');
// Mesuré : 18 offres portent FR sur une commune absente de la liste de villes
// — Clichy, Marignane, Wissous, Eaubonne. Le code ISO est le seul champ qui le
// dise, et zéro offre va dans l'autre sens.
check('une commune française hors liste est rattrapée par le code ISO',
  paysTeamtailor(item({ jp: { jobLocation: [place('FR', 'Wissous')] } })) === 'FR');
check('sans code ISO, une ville française reconnue suffit',
  paysTeamtailor(item({ jp: { jobLocation: [place('', 'Paris')] } })) === 'FR');
check('sans code ISO et sans ville reconnue, le pays reste inconnu',
  paysTeamtailor(item({ jp: { jobLocation: [place('', 'Žilina')] } })) === null);
check('sans aucun lieu, le pays reste inconnu',
  paysTeamtailor(item({ jp: { jobLocation: [] } })) === null);
check('un jobLocation unique, non enveloppé dans un tableau, est lu quand même',
  paysTeamtailor(item({ jp: { jobLocation: place('FR', 'Lyon') } })) === 'FR');
check('le lieu affiché nomme les villes, pas les codes pays',
  lieuAffiche(item({ jp: { jobLocation: [place('FR', 'Paris'), place('GB', 'London')] } })) === 'Paris, London');
check('un lieu absent s’affiche « Non précisé »',
  lieuAffiche(item({ jp: { jobLocation: [] } })) === 'Non précisé');
check('les lieux sont extraits du tableau', lieuxDeLOffre(item()).length === 1);

console.log('\n── Distanciel : aucun signal structuré ──────────────');
// `jobLocationType: TELECOMMUTE` est dans le standard, et servi ZÉRO fois sur
// 602 offres. Reste le texte du lieu, lu comme chez Greenhouse.
check('un lieu qui dit « Remote » est du distanciel',
  estDistanciel(item({ jp: { jobLocation: [place('FR', 'Remote')] } })));
check('« télétravail » aussi',
  estDistanciel(item({ jp: { jobLocation: [place('FR', 'Télétravail')] } })));
check('une ville ordinaire n’est pas du distanciel', !estDistanciel(item()));
check('aucun lieu n’est pas du distanciel',
  !estDistanciel(item({ jp: { jobLocation: [] } })));

console.log('\n── Description ──────────────────────────────────────');
check('le HTML est dépouillé et les entités décodées',
  o.description === "Rejoignez l'équipe", JSON.stringify(o.description));
check('à défaut de content_html, la description du JobPosting sert',
  texteDeContenu({ _jobposting: { description: '<p>Bonjour   <b>toi</b></p>' } }) === 'Bonjour toi');
check('la description est bornée à 300 caractères',
  texteDeContenu({ content_html: 'a'.repeat(500) }).length === 300);
check('un contenu absent ne casse rien', texteDeContenu({}) === '');

console.log('\n── Un board en échec n’en emporte pas dix-huit ──────');
const journal = [];
const introuvable = await collecterBoard(entree, { journal, fetchImpl: async () => reponse(null, { ok: false, status: 404 }) });
check('un board disparu rend une liste vide', Array.isArray(introuvable) && introuvable.length === 0);
check('et le dit au journal avec un code HTTP', journal.at(-1)?.cause === 'http_404', journal.at(-1)?.cause);

const malforme = await collecterBoard(entree, { journal, fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }) });
check('un JSON illisible rend une liste vide', malforme.length === 0);
check('et le dit', journal.at(-1)?.cause === 'reponse_illisible');

// Un JSON Feed porte ses entrées dans `items`. Un 200 sans ce tableau est
// illisible, pas vide.
const sansItems = await collecterBoard(entree, { journal, fetchImpl: async () => reponse({ version: 'https://jsonfeed.org/version/1.1' }) });
check('un 200 sans tableau « items » est illisible, pas vide',
  sansItems.length === 0 && journal.at(-1)?.cause === 'reponse_illisible');

// Chaque board est un SOUS-DOMAINE : un slug inexistant peut échouer en DNS
// plutôt qu'en 404. Mesuré une fois sur 383 candidats (`intercom`).
const dns = await collecterBoard(entree, { journal, fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND'); } });
check('un sous-domaine qui ne résout pas rend une liste vide',
  dns.length === 0 && journal.at(-1)?.cause === 'erreur_reseau');

const coupure = await collecterBoard(entree, { journal, timeout: 5, fetchImpl: async () => { const e = new Error('abort'); e.name = 'AbortError'; throw e; } });
check('un délai dépassé est nommé « timeout »',
  coupure.length === 0 && journal.at(-1)?.cause === 'timeout');

const journalMixte = [];
const melange = await collecterTeamtailor(
  [{ board: 'vivant', company: 'Vivant' }, { board: 'mort', company: 'Mort' }, { board: 'illisible', company: 'Illisible' }],
  {
    journal: journalMixte,
    concurrence: 2,
    fetchImpl: async (url) => {
      if (url.includes('mort.')) return reponse(null, { ok: false, status: 404 });
      if (url.includes('illisible.')) throw new Error('ECONNRESET');
      return reponse({ items: [item()] });
    },
  });
check('deux boards en échec sur trois n’empêchent pas le troisième de rendre',
  melange.length === 1 && melange[0].company === 'Vivant', `${melange.length} offre(s)`);
check('les deux échecs sont journalisés nommément',
  journalMixte.length === 2 && journalMixte.every(e => /^Teamtailor\//.test(e.source)),
  JSON.stringify(journalMixte.map(e => `${e.source}:${e.cause}`)));

console.log('\n── Hygiène ──────────────────────────────────────────');
const brut = item();
const avant = JSON.stringify(brut);
normaliserOffre(brut, entree);
check('l’offre amont n’est pas mutée', JSON.stringify(brut) === avant);
check('une offre sans titre est écartée',
  !offreExploitable(normaliserOffre({ id: 1, url: 'https://x' }, entree)));
check('une offre sans URL est écartée',
  !offreExploitable(normaliserOffre({ id: 1, title: 'T' }, entree)));

console.log('\n── Catalogue ────────────────────────────────────────');
check('le catalogue n’est pas vide', BOARDS.length > 0, `${BOARDS.length} boards`);
check('chaque entrée porte un board et une entreprise', BOARDS.every(b => b.board && b.company));
check('aucun board en double', new Set(BOARDS.map(b => b.board)).size === BOARDS.length);
check('chaque board porte un relevé chiffré d’offres françaises',
  BOARDS.every(b => Number.isInteger(b.offresFR) && b.offresFR >= 0));
check('aucun board inscrit sans offre française au relevé', BOARDS.every(b => b.offresFR > 0));
check('la date du relevé est inscrite', /^\d{4}-\d{2}-\d{2}$/.test(RELEVE), RELEVE);
// Le board est un SOUS-DOMAINE : un slug avec un point ou une barre sortirait
// de l'hôte prévu.
check('les board ids sont des étiquettes DNS sûres',
  BOARDS.every(b => /^[a-z0-9-]+$/.test(b.board)));

console.log('\n── Le registre des ATS ──────────────────────────────');
const vercel = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const atsSrc = fs.readFileSync(new URL('../../api/_lib/ats.js', import.meta.url), 'utf8');
const cronSrc = fs.readFileSync(new URL('../../api/cron/collect-ats.js', import.meta.url), 'utf8');
const jobsSrc = fs.readFileSync(new URL('../../api/jobs.js', import.meta.url), 'utf8');

check('Teamtailor est inscrit au registre', FOURNISSEURS.some(f => f.nom === 'Teamtailor'));
check('chaque fournisseur porte une clé KV, un catalogue et un collecteur',
  FOURNISSEURS.every(f => f.cle && Array.isArray(f.boards) && typeof f.collecter === 'function'));
check('aucune clé KV partagée entre deux fournisseurs',
  new Set(FOURNISSEURS.map(f => f.cle)).size === FOURNISSEURS.length);
// LE TROISIÈME ATS NE DOIT PAS AVOIR COÛTÉ UN CRON : c'est la promesse du
// registre, et c'est elle qui rendra le quatrième moins cher encore. Le garde
// ne compte donc pas les crons du dépôt — un autre peut légitimement en
// ajouter, et `collect-rapidapi` l'a fait — il vérifie qu'AUCUN cron ne porte
// le nom d'un ATS en particulier. Le jour où quelqu'un écrit
// `collect-teamtailor`, le registre a été contourné et ce test rougit.
const cronsAts = (vercel.crons || []).filter(c => /\/collect-ats$/.test(c.path));
check('le registre a son cron, et un seul', cronsAts.length === 1,
  `${FOURNISSEURS.length} fournisseurs → ${cronsAts.length} cron`);
const cronsParAts = (vercel.crons || []).filter(c =>
  FOURNISSEURS.some(f => new RegExp(`collect-${f.nom.toLowerCase()}$`).test(c.path)));
check('aucun cron ne porte le nom d’un ATS — le registre n’est pas contourné',
  cronsParAts.length === 0,
  cronsParAts.length ? cronsParAts.map(c => c.path).join(', ') : 'aucun');

const faux = {
  nom: 'Teamtailor', cle: 'teamtailor_jobs', concurrence: 2,
  boards: [{ board: 'acme', company: 'Acme' }],
  collecter: collecterTeamtailor,
};
const vide = await collecterFournisseur(faux, { fetchImpl: async () => reponse({ items: [] }) });
check('une collecte vide ne demande PAS d’écriture', vide.ecrire === false);
const etrangere = await collecterFournisseur(faux, {
  fetchImpl: async () => reponse({ items: [item({ jp: { jobLocation: [place('DE', 'Berlin')] } })] }),
});
check('une collecte sans offre française ne demande pas d’écriture',
  etrangere.ecrire === false && etrangere.stats.offresFrance === 0);
const pleine = await collecterFournisseur(faux, { fetchImpl: async () => reponse({ items: [item()] }) });
check('une collecte française demande l’écriture', pleine.ecrire === true);
check('seules les offres françaises sont retenues',
  pleine.valeur.offres.every(x => x.country === 'FR'));
check('la borne de taille et le TTL sont communs à tous les fournisseurs',
  MAX_OFFRES > 0 && TTL_SECONDES > 24 * 3600, `${MAX_OFFRES} offres, TTL ${TTL_SECONDES / 3600} h`);

console.log('\n── Branchement dans api/jobs.js ─────────────────────');
check('api/jobs.js porte un collecteur Teamtailor', /async function fetchTeamtailor\(/.test(jobsSrc));
check('et il lit la clé qu’écrit le cron',
  jobsSrc.includes("kvGet('teamtailor_jobs')") &&
  FOURNISSEURS.find(f => f.nom === 'Teamtailor')?.cle === 'teamtailor_jobs');
// La cause n'est pas écrite en dur : elle est déduite de la balise de passage,
// pour distinguer « cron jamais passé » de « passé, crawl mort ».
check('un réservoir vide déclare la source en échec, via la balise',
  /muet\(journal, 'Teamtailor',[\s\S]{0,140}?causeDepuisBalise\(await lireBalise\(\), 'Teamtailor'\)\)/.test(jobsSrc));
check('… et le vide est traité comme l’absence, pas servi en silence',
  /!offres \|\| !offres\.length/.test(jobsSrc));

const ordre = [...jobsSrc.matchAll(/\['([^']+)',\s+\(\) =>/g)].map(m => m[1]);
check('Teamtailor est dans la liste des collecteurs', ordre.includes('Teamtailor'), ordre.join(' → '));
const iTT = ordre.indexOf('Teamtailor');
for (const tiers of ['France Travail', 'French Job Market', 'JSearch', 'Adzuna', 'Remotive', 'Arbeitnow']) {
  const i = ordre.indexOf(tiers);
  check(`Teamtailor passe avant ${tiers} (le dédoublonnage garde la 1re occurrence)`,
    iTT >= 0 && i >= 0 && iTT < i);
}

function extraire(src, nom) {
  const i = src.indexOf(`async function ${nom}(`);
  if (i < 0) return null;
  let profondeur = 0;
  const debut = src.indexOf('{', i);
  for (let j = debut; j < src.length; j++) {
    if (src[j] === '{') profondeur++;
    else if (src[j] === '}' && --profondeur === 0) return src.slice(i, j + 1);
  }
  return null;
}
const blocFetch = extraire(jobsSrc, 'fetchTeamtailor');
check('le collecteur du handler est extractible pour être exécuté', Boolean(blocFetch));

async function appeler(contenuKV, { q = '', type = '', location = '', page = 0, balise = null } = {}) {
  const j = [];
  const bac = {
    console,
    kvGet: async () => contenuKV,
    muet: (jj, source, raison, cause) => { jj?.push({ source, raison, cause: cause || 'inconnue' }); return []; },
    // La VRAIE règle de lecture de la balise, importée et non recopiée.
    causeDepuisBalise,
    lireBalise: async () => balise,
    FILTRE_VERS_CONTRAT: { stage: 'Stage', alternance: 'Alternance', cdi: 'CDI', cdd: 'CDD', freelance: 'Freelance' },
    resultat: null, journal: j,
  };
  vm.createContext(bac);
  vm.runInContext(`${blocFetch}; resultat = fetchTeamtailor(${JSON.stringify(q)}, ${JSON.stringify(type)}, ${JSON.stringify(location)}, ${page}, journal, lireBalise);`, bac);
  return { offres: await bac.resultat, journal: j };
}

const offreKV = (p = {}) => ({
  id: 'tt_acme_1', title: 'Développeur Backend', company: 'Acme', location: 'Paris',
  type: 'CDI', salary: null, description: 'Node.js', url: 'https://careers.acme.com/jobs/1',
  date: '2026-10-01T08:00:00Z', remote: false, source: 'Teamtailor', logo: null, country: 'FR', ...p,
});

const absente = await appeler(null);
check('une clé KV absente n’est PAS une liste vide — la source est déclarée en échec',
  absente.offres.length === 0 && Boolean(absente.journal.at(-1)?.cause),
  absente.journal.at(-1)?.cause);
const vidée = await appeler({ offres: [] });
check('un réservoir vide est déclaré en échec, pas servi',
  vidée.offres.length === 0 && Boolean(vidée.journal.at(-1)?.cause));
const normal = await appeler({ offres: [offreKV()] });
check('une clé valide rend ses offres', normal.offres.length === 1 && normal.journal.length === 0);

const avecInconnu = { offres: [offreKV(), offreKV({ id: 'tt_acme_2', title: 'Account Executive', type: null })] };
check('sous filtre CDI, seule l’offre au contrat LU est rendue',
  (await appeler(avecInconnu, { type: 'cdi' })).offres.length === 1);
check('sous filtre CDD, une offre au contrat inconnu n’est pas servie comme CDD',
  (await appeler(avecInconnu, { type: 'cdd' })).offres.length === 0);
check('hors filtre, l’offre au contrat inconnu est servie telle quelle',
  (await appeler(avecInconnu)).offres.length === 2);

const cent = { offres: Array.from({ length: 100 }, (_, i) => offreKV({ id: `tt_acme_${i}`, title: `Poste ${i}`, date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T08:00:00Z` })) };
const p0 = await appeler(cent);
const p1 = await appeler(cent, { page: 1 });
check('une page rend au plus dix offres', p0.offres.length === 10, `${p0.offres.length}`);
check('deux pages consécutives ne se recouvrent pas',
  !p0.offres.some(a => p1.offres.some(b => b.id === a.id)));
check('les plus récentes d’abord',
  new Date(p0.offres[0].date) >= new Date(p0.offres.at(-1).date));
check('le terme de recherche filtre vraiment',
  (await appeler(cent, { q: 'Poste 7' })).offres.every(x => /Poste 7/.test(x.title)));

console.log('\n── Le cron de collecte ──────────────────────────────');
check('le cron refuse un appel sans CRON_SECRET',
  /CRON_SECRET/.test(cronSrc) && /\b401\b/.test(cronSrc));
check('un fournisseur qui échoue n’emporte pas les autres',
  /catch \(e\)/.test(cronSrc) && /continue;/.test(cronSrc));
check('le registre ne stocke que ce dont le pays est établi comme la France',
  /country === 'FR'/.test(atsSrc));
// Trois ATS enchaînés font ~40 s mesurées. Le runtime Edge impose de répondre
// en 25 s ; la durée réservée dans vercel.json doit rester large devant.
check('le cron n’est pas en runtime Edge (≈40 s pour trois ATS)',
  !/runtime:\s*'edge'/.test(cronSrc));
const dureeAts = (vercel.functions || {})['api/cron/collect-ats.js']?.maxDuration;
check('la durée réservée couvre trois ATS avec de la marge',
  Number(dureeAts) >= 120, `maxDuration ${dureeAts} s`);

if (failed) { console.error(`\n❌ sonde Teamtailor : ${failed} échec(s)\n`); process.exit(1); }
console.log(`\n✅ sonde Teamtailor : ${passed} vérifications OK\n`);
