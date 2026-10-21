// Sonde du réservoir RapidAPI : JSearch et French Job Market.
//
// Ce que cette sonde protège, et pourquoi elle existe. Les deux sources
// rendaient `http_429` en production. La mesure du 2026-10-21 a écarté les
// deux explications plausibles — ce n'était ni une clé invalide (la passerelle
// RapidAPI rend 401 sans clé, jamais 429) ni un throttle par seconde (deux
// requêtes isolées à 100 s d'intervalle, un appel par API chacune, les deux
// refusées). Restait le plafond MENSUEL des plans gratuits, relevé sur les
// grilles publiques :
//
//   JSearch            BASIC  200 requêtes/mois  « Hard Limit »
//   French job market  BASIC   30 requêtes/mois  « Hard Limit »
//
// Ces nombres sont la raison du passage au cron : l'appel en ligne coûtait une
// requête par requête utilisateur, et un seul passage de crawler sur les 86
// pages SEO en consomme 86 — 2,9 fois le quota mensuel entier de French Job
// Market. La sonde RECALCULE cette arithmétique depuis les constantes du
// dépôt, pour que monter le budget sans monter le plan fasse rougir la CI
// plutôt que la production trois semaines plus tard.
//
// Elle est hors ligne : le `fetch` est injecté, aucune requête ne sort.
import fs from 'node:fs';
import vm from 'node:vm';
import {
  BUDGETS, FAMILLES, MAX_OFFRES_PAR_SOURCE, AGE_MAX_SECONDES, TTL_SECONDES,
  collecterJSearch, collecterFrenchMarket,
} from '../../api/_lib/rapidapi.js';
import { CLE_KV, estJourDeCollecte, fusionner } from '../../api/cron/collect-rapidapi.js';

let passed = 0, failed = 0;
function check(label, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const reponse = (corps, { ok = true, status = 200 } = {}) => ({
  ok, status, json: async () => corps,
});

// ── 1. LE BUDGET TIENT SOUS LE PLAFOND MESURÉ ───────────────────────────────
// Le garde central. Il ne vérifie pas qu'un nombre est « raisonnable » : il
// refait le calcul du pire cas et le compare au plafond du fournisseur.
console.log('\n── Budget mensuel vs plafond du plan ──');
for (const [source, b] of Object.entries(BUDGETS)) {
  const pireCas = b.pagesParCollecte * b.collectesParMois;
  check(`${source} : ${pireCas} requêtes/mois au pire cas ≤ plafond ${b.plafondMensuel}`,
    pireCas <= b.plafondMensuel,
    `${b.pagesParCollecte} × ${b.collectesParMois} = ${pireCas}`);
}

// 31 et 5 ne sont pas décoratifs : ce sont les pires cas du calendrier. Un
// budget calculé sur 30 jours déborderait sept mois par an, et un budget
// hebdomadaire calculé sur 4 lundis déborderait les mois à 5 lundis.
check('le quotidien est budgété sur 31 jours, pas sur 30',
  BUDGETS.jsearch.collectesParMois === 31);
check('l’hebdomadaire est budgété sur 5 lundis, pas sur 4',
  BUDGETS.frenchmarket.collectesParMois === 5);

// French Job Market ne PEUT PAS être quotidienne, et c'est de l'arithmétique,
// pas une préférence : 30 requêtes pour 31 jours.
check('French Job Market ne tient pas un appel par jour sur son plan gratuit',
  BUDGETS.frenchmarket.plafondMensuel < 31,
  `${BUDGETS.frenchmarket.plafondMensuel} requêtes/mois < 31 jours`);

check('assez de familles déclarées pour les deux budgets',
  FAMILLES.length >= BUDGETS.jsearch.pagesParCollecte &&
  FAMILLES.length >= BUDGETS.frenchmarket.pagesParCollecte,
  `${FAMILLES.length} familles`);

// ── 2. LA DURÉE TIENT SOUS maxDuration ──────────────────────────────────────
// Onze appels séquentiels à 8 s auraient atteint 88 s pour une fonction bornée
// à 60 s : le cron aurait été tué AVANT d'écrire sa clé, et la panne se serait
// lue `collecte_absente` — un cron qui tourne, échoue par dépassement, et se
// présente comme un cron qui ne tourne pas.
console.log('\n── Durée du pire cas vs maxDuration ──');
const libSrc = fs.readFileSync(new URL('../../api/_lib/rapidapi.js', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const maxDuration = vercel.functions?.['api/**/*.js']?.maxDuration;
const delai = Number(/const DELAI = (\d+);/.exec(libSrc)?.[1]);
const concurrence = Number(/const CONCURRENCE = (\d+);/.exec(libSrc)?.[1]);
check('DELAI et CONCURRENCE sont lisibles dans le collecteur',
  Number.isFinite(delai) && Number.isFinite(concurrence), `${delai} ms, ${concurrence} en parallèle`);
const appelsMax = BUDGETS.jsearch.pagesParCollecte + BUDGETS.frenchmarket.pagesParCollecte;
const secondesPireCas = Math.ceil(BUDGETS.jsearch.pagesParCollecte / concurrence) * (delai / 1000)
                      + Math.ceil(BUDGETS.frenchmarket.pagesParCollecte / concurrence) * (delai / 1000);
check(`${appelsMax} appels en lots tiennent sous maxDuration ${maxDuration} s`,
  secondesPireCas < maxDuration, `${secondesPireCas} s au pire cas`);

// ── 3. LE CALENDRIER ────────────────────────────────────────────────────────
console.log('\n── Jours de collecte ──');
// 2026-10-19 est un lundi, 2026-10-21 un mercredi.
const lundi = new Date('2026-10-19T03:00:00Z');
const mercredi = new Date('2026-10-21T03:00:00Z');
check('JSearch est collectée tous les jours',
  estJourDeCollecte('jsearch', lundi) && estJourDeCollecte('jsearch', mercredi));
check('French Job Market est collectée le lundi', estJourDeCollecte('frenchmarket', lundi));
check('French Job Market n’est PAS collectée les autres jours',
  !estJourDeCollecte('frenchmarket', mercredi));
check('une source inconnue n’est jamais collectée', !estJourDeCollecte('autre', lundi));

// ── 4. LES COLLECTEURS, RÉSEAU INJECTÉ ──────────────────────────────────────
console.log('\n── Collecteurs (hors ligne) ──');

const sansCle = await collecterJSearch({ cle: null, fetchImpl: async () => reponse({}) });
check('sans RAPIDAPI_KEY, l’état est cle_absente et aucun appel ne part',
  sansCle.etat === 'cle_absente' && sansCle.appels === 0);

const brutJS = { job_id: 'x1', job_title: 'Développeur', employer_name: 'Acme', job_city: 'Lyon', job_country: 'FR', job_employment_type: 'FULLTIME' };
let appelsVus = 0;
const okJS = await collecterJSearch({
  cle: 'k', fetchImpl: async () => { appelsVus++; return reponse({ data: [brutJS] }); },
});
check('une collecte normale rend une offre par famille interrogée',
  okJS.etat === 'ok' && okJS.offres.length === BUDGETS.jsearch.pagesParCollecte,
  `${okJS.offres.length} offres pour ${appelsVus} appels`);
check('les offres sont normalisées, pas rendues brutes',
  okJS.offres[0]?.id === 'js_x1' && okJS.offres[0]?.company === 'Acme' && okJS.offres[0]?.country === 'FR');

// Le 429 arrête les appels suivants. Sans cet arrêt, un plan épuisé ferait
// partir six refus au lieu d'un lot.
let appels429 = 0;
const quotaJS = await collecterJSearch({
  cle: 'k', fetchImpl: async () => { appels429++; return reponse({ message: 'quota' }, { ok: false, status: 429 }); },
});
check('un 429 rend l’état quota', quotaJS.etat === 'quota');
check('un 429 arrête la collecte après le premier lot',
  appels429 === concurrence, `${appels429} appels au lieu de ${BUDGETS.jsearch.pagesParCollecte}`);

// Un 429 n'est PAS journalisé comme un échec http_429 : ce n'est pas une panne
// de transport, c'est le plan qui refuse, et le cron le remonte par `etat`.
const journalQuota = [];
await collecterJSearch({ cle: 'k', journal: journalQuota, fetchImpl: async () => reponse(null, { ok: false, status: 429 }) });
check('un 429 ne pollue pas le journal des échecs de transport', journalQuota.length === 0);

// Un refus qui n'est pas un quota reste un échec journalisé, et il n'emporte
// pas les autres appels — la garantie du collecteur Greenhouse.
const journal404 = [];
const mixte = await collecterJSearch({
  cle: 'k', journal: journal404,
  fetchImpl: async (url) => String(url).includes('infirmier')
    ? reponse(null, { ok: false, status: 404 })
    : reponse({ data: [brutJS] }),
});
check('un appel en échec n’emporte pas les autres',
  mixte.etat === 'ok' && mixte.offres.length === BUDGETS.jsearch.pagesParCollecte - 1,
  `${mixte.offres.length} offres, ${journal404.length} échec(s) journalisé(s)`);
check('l’échec de transport porte sa cause bornée',
  journal404.some(e => e.cause === 'http_404'));

const reseau = [];
const casse = await collecterJSearch({
  cle: 'k', journal: reseau, fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
});
check('une panne réseau rend zéro offre sans lever',
  casse.offres.length === 0 && reseau.every(e => e.cause === 'erreur_reseau'));

// French Job Market : son filtre DOM-TOM est conservé du collecteur en ligne.
const fm = await collecterFrenchMarket({
  cle: 'k',
  fetchImpl: async () => reponse({ data: [
    { job_id: 'a', title: 'Comptable', location: 'Nantes' },
    { job_id: 'b', title: 'Comptable', location: 'Fort-de-France, Martinique' },
  ] }),
});
check('French Job Market écarte les offres DOM-TOM',
  fm.offres.length === BUDGETS.frenchmarket.pagesParCollecte &&
  fm.offres.every(o => !o.location.toLowerCase().includes('martinique')),
  `${fm.offres.length} offres retenues sur ${BUDGETS.frenchmarket.pagesParCollecte * 2} reçues`);
check('French Job Market respecte son propre budget, plus petit que celui de JSearch',
  fm.offres.length === BUDGETS.frenchmarket.pagesParCollecte &&
  BUDGETS.frenchmarket.pagesParCollecte < BUDGETS.jsearch.pagesParCollecte);

// ── 5. LE GARDE ANTI-ÉCRASEMENT, PAR SOURCE ─────────────────────────────────
// Le garde de `collect-ats` porte sur une clé entière. Ici la clé porte
// DEUX sources dont une seule est collectée six jours sur sept : l'appliquer
// globalement effacerait French Job Market tous les autres jours.
console.log('\n── Garde anti-écrasement ──');
const precedent = {
  jsearch: { collecteLe: '2026-10-20T03:00:00Z', etat: 'ok', offres: [{ id: 'js_vieux' }] },
  frenchmarket: { collecteLe: '2026-10-19T03:00:00Z', etat: 'ok', offres: [{ id: 'fm_vieux' }] },
};

const vide = fusionner(precedent, 'jsearch', { etat: 'quota', offres: [], appels: 3 });
check('une collecte vide CONSERVE les offres précédentes',
  vide.offres.length === 1 && vide.offres[0].id === 'js_vieux');
check('une collecte vide met quand même l’état à jour',
  vide.etat === 'quota', 'sinon `quota_epuise` serait indicible à la lecture');
check('une collecte vide ne rajeunit PAS la date de collecte',
  vide.collecteLe === '2026-10-20T03:00:00Z',
  'sinon la fraîcheur par source masquerait une panne durable');

const nonCollectee = fusionner(precedent, 'frenchmarket', undefined);
check('une source non collectée ce jour-là garde son entrée intacte',
  nonCollectee?.offres?.[0]?.id === 'fm_vieux' && nonCollectee.etat === 'ok');

const neuve = fusionner(precedent, 'jsearch', { etat: 'ok', offres: [{ id: 'js_neuf' }], appels: 6 });
check('une collecte non vide remplace les offres et date l’entrée',
  neuve.offres[0].id === 'js_neuf' && neuve.collecteLe !== precedent.jsearch.collecteLe);

const premiereFois = fusionner(null, 'jsearch', { etat: 'quota', offres: [], appels: 3 });
check('sans précédent, une collecte vide ne fabrique pas d’offres',
  premiereFois.offres.length === 0 && premiereFois.collecteLe === null);

const trop = fusionner(null, 'jsearch', {
  etat: 'ok', appels: 6,
  offres: Array.from({ length: MAX_OFFRES_PAR_SOURCE + 5 }, (_, i) => ({ id: `js_${i}` })),
});
check('la borne de taille est appliquée',
  trop.offres.length === MAX_OFFRES_PAR_SOURCE, `${MAX_OFFRES_PAR_SOURCE} offres maximum`);

// ── 6. LA LECTURE : TROIS ABSENCES, TROIS CAUSES ────────────────────────────
// `causeReservoir` est lue dans le VRAI `api/jobs.js` et exécutée telle
// quelle. Une copie de sa logique resterait verte en divergeant du handler —
// le défaut que la sonde du barème Écoles a déjà corrigé une fois.
console.log('\n── Causes d’absence, extraites du handler ──');
const jobsSrc = fs.readFileSync(new URL('../../api/jobs.js', import.meta.url), 'utf8');

function extraire(nom) {
  const i = jobsSrc.indexOf(`function ${nom}(`);
  if (i < 0) return null;
  let p = 0;
  const debut = jobsSrc.indexOf('{', i);
  for (let j = debut; j < jobsSrc.length; j++) {
    if (jobsSrc[j] === '{') p++;
    else if (jobsSrc[j] === '}' && --p === 0) return jobsSrc.slice(i, j + 1);
  }
  return null;
}

const blocCause = extraire('causeReservoir');
check('causeReservoir est présente dans le handler', !!blocCause);
const bac = { AGE_MAX_SECONDES, Date, console };
vm.createContext(bac);
vm.runInContext(`${blocCause}\nthis.causeReservoir = causeReservoir;`, bac);
const { causeReservoir } = bac;

const frais = new Date(Date.now() - 3600_000).toISOString();
const vieux = new Date(Date.now() - (AGE_MAX_SECONDES.jsearch + 3600) * 1000).toISOString();

check('réservoir absent → collecte_absente',
  causeReservoir(undefined, 'jsearch') === 'collecte_absente');
check('réservoir frais → aucune cause, la source est servie',
  causeReservoir({ collecteLe: frais, etat: 'ok', offres: [{}] }, 'jsearch') === null);
check('clé non posée → cle_absente, pas quota_epuise',
  causeReservoir({ etat: 'cle_absente', offres: [] }, 'jsearch') === 'cle_absente');
check('périmé après un refus de quota → quota_epuise',
  causeReservoir({ collecteLe: vieux, etat: 'quota', offres: [{}] }, 'jsearch') === 'quota_epuise',
  'décision d’abonnement, pas panne de cron');
check('périmé sans refus de quota → collecte_absente',
  causeReservoir({ collecteLe: vieux, etat: 'ok', offres: [{}] }, 'jsearch') === 'collecte_absente',
  'le cron ne tourne plus');
check('entrée datée mais sans offre → la cause de son état',
  causeReservoir({ collecteLe: frais, etat: 'quota', offres: [] }, 'jsearch') === 'quota_epuise');

// La tolérance de French Job Market est PLUS LONGUE, parce que son plan ne
// permet que l'hebdomadaire. Un âge de huit jours est une panne pour JSearch
// et un cycle normal pour elle : confondre les deux ferait clignoter une
// source saine.
const huitJours = new Date(Date.now() - 8 * 86400_000).toISOString();
check('8 jours : panne pour JSearch, cycle normal pour French Job Market',
  causeReservoir({ collecteLe: huitJours, etat: 'ok', offres: [{}] }, 'jsearch') === 'collecte_absente' &&
  causeReservoir({ collecteLe: huitJours, etat: 'ok', offres: [{}] }, 'frenchmarket') === null);
check('la tolérance hebdomadaire couvre deux cycles manqués',
  AGE_MAX_SECONDES.frenchmarket >= 14 * 86400,
  `${AGE_MAX_SECONDES.frenchmarket / 86400} jours`);

// ── 7. LE VOCABULAIRE RESTE FERMÉ ───────────────────────────────────────────
console.log('\n── Vocabulaire des causes ──');
check('quota_epuise est dans l’ensemble fermé du handler',
  /const CAUSES = new Set\(\[[^\]]*'quota_epuise'/.test(jobsSrc));
check('quota_epuise est distinct de collecte_absente et de cle_absente',
  /'cle_absente'/.test(jobsSrc) && /'collecte_absente'/.test(jobsSrc));

const blocCauses = jobsSrc.slice(jobsSrc.indexOf('const CAUSES'), jobsSrc.indexOf('async function fetch'));
const bac2 = { console };
vm.createContext(bac2);
vm.runInContext(`${blocCauses}\nthis.causePublique = causePublique;`, bac2);
check('quota_epuise traverse causePublique sans être réduit à inconnue',
  bac2.causePublique('quota_epuise') === 'quota_epuise');
check('un message libre est toujours réduit à inconnue',
  bac2.causePublique('quota épuisé sur https://x?key=SECRET') === 'inconnue');

// ── 8. INTERNSHIPS EST RETIRÉE, PAS SEULEMENT DÉBRANCHÉE ────────────────────
// L'API est retirée par son fournisseur depuis le 2026-08-03 (« This API is no
// longer available »). Une source morte qui reste déclarée figure en échec
// perpétuel et dilue la liste des pannes réelles.
console.log('\n── Internships : retrait complet ──');
check('aucun collecteur fetchInternships ne subsiste',
  !/async function fetchInternships/.test(jobsSrc));
check('Internships n’est plus déclarée dans la liste des collecteurs',
  !/\['Internships',/.test(jobsSrc));
check('aucun appel à internships-api ne subsiste',
  !/fetch\(`https:\/\/internships-api/.test(jobsSrc));
check('le retrait est documenté là où le collecteur se trouvait',
  /SOURCE RETIRÉE/.test(jobsSrc) && /2026-08-03/.test(jobsSrc));
const sondeSrc = fs.readFileSync(new URL('./sources.mjs', import.meta.url), 'utf8');
check('Internships ne figure plus dans les absences connues de la sonde',
  !/^\s*Internships:/m.test(sondeSrc));

// ── 9. LE HANDLER LIT LA CLÉ UNE SEULE FOIS ─────────────────────────────────
console.log('\n── Lecture du réservoir dans le handler ──');
check('les deux sources lisent le réservoir passé en argument',
  /fetchJSearch\(q, type, location, page, journal, reservoirRapidapi\)/.test(jobsSrc) &&
  /fetchFrenchMarket\(q, type, location, page, journal, reservoirRapidapi\)/.test(jobsSrc));
check('la clé n’est lue qu’une fois par requête',
  (jobsSrc.match(/kvGet\(CLE_RAPIDAPI\)/g) || []).length === 1);
check('une lecture KV en échec ne fait pas tomber la requête',
  /kvGet\(CLE_RAPIDAPI\)\.catch\(\(\) => null\)/.test(jobsSrc));
check('le filtre de lecture est partagé par les trois réservoirs',
  (jobsSrc.match(/servirReservoir\(/g) || []).length >= 4,
  'une définition et trois appels');

// ── 10. LE CRON EST DÉCLARÉ, ET À UNE FRÉQUENCE QUE HOBBY ACCEPTE ───────────
// `0 */6 * * *` a fait ÉCHOUER le déploiement de la PR #99 avant le build : sur
// le plan Hobby un cron ne tourne qu'une fois par jour. La contrainte se
// vérifie ici pour se découvrir avant la poussée.
console.log('\n── Déclaration du cron ──');
const cron = (vercel.crons || []).find(c => c.path === '/api/cron/collect-rapidapi');
check('le cron est déclaré dans vercel.json', !!cron, cron?.schedule);
const champs = (cron?.schedule || '').split(/\s+/);
check('la fréquence est quotidienne au plus, comme Hobby l’exige',
  champs.length === 5 && !champs[1].includes('*') && !champs[1].includes('/') && champs[2] === '*',
  cron?.schedule);
check('le cron passe AVANT celui des alertes de 7 h',
  Number(champs[1]) < 7, `${champs[1]} h UTC`);
check('la clé KV du cron est celle que le handler lit',
  CLE_KV === 'rapidapi_jobs' && jobsSrc.includes('CLE_KV as CLE_RAPIDAPI'));
check('le TTL de la clé couvre trois exécutions quotidiennes manquées',
  TTL_SECONDES >= 72 * 3600, `${TTL_SECONDES / 3600} h`);

const cronSrc = fs.readFileSync(new URL('../../api/cron/collect-rapidapi.js', import.meta.url), 'utf8');
check('le cron refuse un appel sans CRON_SECRET',
  /req\.headers\.get\('authorization'\) !== `Bearer \$\{cronSecret\}`/.test(cronSrc) &&
  /status: 401/.test(cronSrc));
check('une collecte totalement vide n’écrit pas la clé',
  cronSrc.indexOf('if (!offres)') < cronSrc.indexOf('await kvSet(CLE_KV'));

if (failed) { console.error(`\n❌ sonde RapidAPI : ${failed} échec(s) sur ${passed + failed}\n`); process.exit(1); }
console.log(`\n✅ sonde RapidAPI : ${passed} vérifications OK\n`);
