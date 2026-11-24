// Sonde de la lecture d'une requête dans les réservoirs (`api/_lib/recherche.js`).
//
// Les titres ci-dessous sont des offres RÉELLES des réservoirs Greenhouse,
// Lever et Teamtailor, relevées sur /api/jobs en production le 2026-11-05 ;
// quelques-unes, signalées, sont construites pour isoler un cas. Les requêtes
// sont celles des pages /metier et /emploi à la même date.
//
// Ce qu'elle garde : le défaut que ce module a retiré. Les réservoirs
// cherchaient la requête ENTIÈRE comme une sous-chaîne, sensible aux accents —
// 34 des 37 pages /metier (requêtes de plusieurs mots) ne recevaient donc
// aucune offre ATS, ni les 11 pages ville qui envoient `q=emploi`.
import fs from 'node:fs';
import path from 'node:path';
import { rangerParRequete, motsPorteurs, lieuCorrespond, indiceEntreprise } from '../../api/_lib/recherche.js';
import vm from 'node:vm';
import { lecteurPartage } from './_lecteur-partage.mjs';

let passed = 0, failed = 0;
function check(label, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

let n = 0;
const offre = (title, company, location, p = {}) => ({
  id: `o${++n}`, title, company, location, description: '', remote: false,
  date: new Date(Date.UTC(2026, 9, 1 + n)).toISOString(), ...p,
});
const RESERVOIR = [
  offre('DevOps - SRE (F/H/X)', 'Leocare', 'Cesson-Sévigné'),
  offre('Technicien/ne qualité (H/F)', 'Verkor', 'Bourbourg, Hauts-de-France'),
  offre('Technicien/ne de Production H/F', 'Verkor', 'Bourbourg, Hauts-de-France'),
  offre('Stage - Chef de Projet & Relation Client', 'Ornikar', 'Paris'),
  offre('Assistant·e Chef de Projet Marketing - alternance', 'Deliveroo', 'Paris, France'),
  offre('Social Media Manager & TikTok Creator - stage', 'Ornikar', 'Paris'),
  offre('Key Account Manager', 'Skello', 'Paris'),
  offre('Data scientist Internship (6 months)', 'Shift Technology', 'France - Paris'),
  offre('🥗 Employé.e Polyvalent.e de Restauration / Plonge (F/H) - CDD - Montreuil', 'Foodles', 'Montreuil'),
  offre('Product Manager', '360Learning', 'Paris, Remote'),
  offre('Customer Success Manager - Lille', 'Skello', 'Lille'),
  offre('Business Development Manager - Bordeaux', 'Deliveroo', 'Bordeaux, France'),
  offre('Senior Software Engineer', 'Seedtag', 'Madrid, Barcelona, Paris'),
  offre('Strategic Enterprise Account Executive, Media', 'Databricks', 'Paris, France',
    { description: 'Want to help solve the world\'s toughest problems with big data and AI?' }),
];
const titres = (jobs) => jobs.map(j => j.title);
const contient = (jobs, debut) => jobs.some(j => j.title.startsWith(debut));

// ── 1. LES REQUÊTES DE PLUSIEURS MOTS ────────────────────────────────────────
console.log('\n── Requêtes de plusieurs mots (pages /metier) ──');
const cuisine = rangerParRequete(RESERVOIR, 'chef de cuisine cuisinier restauration');
check('« chef de cuisine cuisinier restauration » trouve le poste de restauration',
  contient(cuisine, '🥗 Employé.e Polyvalent.e de Restauration'), titres(cuisine).join(' | '));
check('… mais pas « Chef de Projet » : « chef » seul ne qualifie pas',
  !contient(cuisine, 'Stage - Chef de Projet'));
const devops = rangerParRequete(RESERVOIR, 'devops cloud engineer');
check('« devops cloud engineer » trouve « DevOps - SRE »', contient(devops, 'DevOps - SRE'));
const cm = rangerParRequete(RESERVOIR, 'community manager social media marketing');
check('« community manager social media marketing » trouve « Social Media Manager »',
  contient(cm, 'Social Media Manager'));
check('… mais pas « Key Account Manager » : « manager » seul ne qualifie pas',
  !contient(cm, 'Key Account Manager'));
check('une requête faite de mots faibles reste cherchable — « manager » trouve « Key Account Manager »',
  contient(rangerParRequete(RESERVOIR, 'manager'), 'Key Account Manager'));
const ds = rangerParRequete(RESERVOIR, 'data scientist');
check('« data scientist » trouve l’offre qui le porte dans son titre', contient(ds, 'Data scientist Internship'));
check('… et pas celle dont seul le chapeau dit « data » : un mot sur deux, hors titre, ne suffit pas',
  !contient(ds, 'Strategic Enterprise Account Executive'));

// ── 2. ACCENTS, MOTS COURTS, DESCRIPTION ────────────────────────────────────
console.log('\n── Accents, mots courts, description ──');
const accent = [offre('Développeur php / symfony confirmé', 'Confidentiel', 'Versailles')];
check('« developpeur » sans accent trouve « Développeur »', rangerParRequete(accent, 'developpeur').length === 1);
// Construits : un poste RH, et une offre dont seul un mot contient « rh ».
const rh = [offre('Chargé RH', 'Acme', 'Lyon'), offre('Commercial Rhône-Alpes', 'Acme', 'Lyon')];
const surRh = rangerParRequete(rh, 'RH');
check('« RH » filtre vraiment : un mot court n’est pas ignoré', surRh.length === 1, titres(surRh).join(' | '));
check('… et se compare comme un mot entier — « Rhône » ne répond pas', surRh[0]?.title === 'Chargé RH');
const python = [offre('Backend Engineer', 'Acme', 'Paris', { description: 'Stack : Python, Django, PostgreSQL' }), offre('Office Manager', 'Acme', 'Paris')];
check('une requête d’un seul mot se lit aussi dans la description, comme avant',
  rangerParRequete(python, 'python').length === 1);

// ── 3. LE RANG ──────────────────────────────────────────────────────────────
console.log('\n── Rang ──');
const ancienneTitre = offre('Chef de Projet Marketing', 'Acme', 'Paris', { date: '2026-01-01T00:00:00Z' });
const recenteDescription = offre('Account Executive', 'Acme', 'Paris', { date: '2026-11-01T00:00:00Z', description: 'Rattaché au marketing' });
const rang = rangerParRequete([recenteDescription, ancienneTitre], 'marketing');
check('un mot dans le titre passe devant un mot dans la description, même plus ancien',
  rang[0] === ancienneTitre && rang.length === 2);
const sansRequete = rangerParRequete(RESERVOIR, '');
check('sans requête, rien n’est écarté et l’ordre est celui de la date',
  sansRequete.length === RESERVOIR.length &&
  sansRequete.every((j, i) => i === 0 || new Date(sansRequete[i - 1].date) >= new Date(j.date)));

// ── 4. LES PAGES VILLE ──────────────────────────────────────────────────────
console.log('\n── Pages ville ──');
check('`q=Lyon&location=Lyon` : la ville n’est pas cherchée dans le titre, le filtre de lieu l’impose',
  motsPorteurs('Lyon', 'Lyon').length === 0 && rangerParRequete(RESERVOIR, 'Lyon', 'Lyon').length === RESERVOIR.length);
check('`q=emploi` n’écarte rien', rangerParRequete(RESERVOIR, 'emploi', 'Rouen').length === RESERVOIR.length);
check('« Le Havre » : le mot de liaison ne devient pas un critère', motsPorteurs('Le Havre', 'Le Havre').length === 0);
check('le lieu se compare sans accent — « Saint-Étienne » trouve « Saint-Etienne »',
  lieuCorrespond({ location: 'Saint-Etienne' }, 'Saint-Étienne'));
check('une offre distancielle reste servie sous filtre de lieu',
  lieuCorrespond({ location: 'Berlin', remote: true }, 'Lyon'));

// ── 5. ENSEIGNE HOMONYME ────────────────────────────────────────────────────
console.log('\n── Enseigne homonyme ──');
const boulanger = [offre('Vendeur électroménager H/F', 'Boulanger', 'Lille'), offre('Commis boulanger', 'Paul', 'Lille')];
const surBoulanger = rangerParRequete(boulanger, 'boulanger');
check('« boulanger » ne remonte pas l’enseigne Boulanger sur son seul nom',
  surBoulanger.length === 1 && surBoulanger[0].title === 'Commis boulanger');
check('la neutralisation porte sur le nom entier', indiceEntreprise('Boulangerie Paul') === 'Boulangerie Paul');

// ── 6. LES REQUÊTES RÉELLES DES PAGES SEO ───────────────────────────────────
// Lues dans les pages elles-mêmes : si une page change sa requête, l'invariant
// est revérifié sur la nouvelle.
console.log('\n── Requêtes des pages SEO ──');
const racine = new URL('../../', import.meta.url);
const lire = (dossier) => fs.readdirSync(new URL(dossier, racine)).filter(f => f.endsWith('.html')).map(f => {
  const html = fs.readFileSync(new URL(path.posix.join(dossier, f), racine), 'utf8');
  const q = /DEFAULT_QUERY\s*=\s*['"]([^'"]*)['"]/.exec(html)?.[1];
  const l = /DEFAULT_LOCATION\s*=\s*['"]([^'"]*)['"]/.exec(html)?.[1] || '';
  return { f, q, l };
}).filter(p => p.q !== undefined);
// Une page ville déclare son lieu ; `emploi/remote.html` (« remote télétravail »,
// sans lieu) n'en est pas une et cherche bien ses mots.
const metiers = lire('metier/'), villes = lire('emploi/').filter(p => p.l);
const metiersMuets = metiers.filter(p => !motsPorteurs(p.q, p.l).length);
check('chaque page /metier a au moins un mot porteur — aucune ne sert un réservoir non filtré',
  metiers.length > 0 && metiersMuets.length === 0,
  `${metiers.length} pages${metiersMuets.length ? ` ; muettes : ${metiersMuets.map(p => p.f).join(', ')}` : ''}`);
const multi = metiers.filter(p => p.q.trim().split(/\s+/).length > 1);
// Avant : aucune offre ne pouvait répondre, quel que soit son titre. Après : un
// titre qui porte un seul des mots porteurs de la page suffit.
const multiServies = multi.filter(p => rangerParRequete([offre(motsPorteurs(p.q, p.l)[0], 'Acme', '')], p.q, p.l).length === 1);
check('une page /metier de plusieurs mots est servie par une offre qui porte UN de ses mots',
  multiServies.length === multi.length, `${multiServies.length}/${multi.length}`);
const villesFiltrees = villes.filter(p => motsPorteurs(p.q, p.l).length > 0);
check('aucune page ville ne cherche sa ville dans les titres — le lieu suffit',
  villes.length > 0 && villesFiltrees.length === 0,
  `${villes.length} pages${villesFiltrees.length ? ` ; filtrées : ${villesFiltrees.map(p => p.f).join(', ')}` : ''}`);

// ── 7. LE LECTEUR DU HANDLER L'UTILISE VRAIMENT ─────────────────────────────
// Le module peut être juste et le handler continuer à chercher d'un bloc : on
// exécute ici `servirReservoir` tel qu'écrit dans `api/jobs.js`.
console.log('\n── Le lecteur du handler ──');
const jobsSrc = fs.readFileSync(new URL('api/jobs.js', racine), 'utf8');
const lecteur = lecteurPartage(jobsSrc);
check('`servirReservoir` est lisible dans le handler', lecteur.present);
function servir(offres, q, location = '', page = 0) {
  const bac = { ...lecteur.globaux, FILTRE_VERS_CONTRAT: {}, offres, resultat: null };
  vm.createContext(bac);
  vm.runInContext(`${lecteur.source}\nresultat = servirReservoir(offres, ${JSON.stringify(q)}, '', ${JSON.stringify(location)}, ${page});`, bac);
  return bac.resultat;
}
check('le handler sert une page /metier de plusieurs mots',
  contient(servir(RESERVOIR, 'chef de cuisine cuisinier restauration'), '🥗 Employé.e Polyvalent.e de Restauration'));
check('le handler sert une page ville par son lieu',
  servir(RESERVOIR, 'Lille', 'Lille').map(j => j.title).join() === 'Customer Success Manager - Lille');
check('le handler range par pertinence avant de paginer',
  servir([recenteDescription, ancienneTitre], 'marketing')[0] === ancienneTitre);
check('`api/jobs.js` ne cherche plus nulle part la requête d’un bloc',
  !/toLowerCase\(\)\.includes\(ql\)/.test(jobsSrc));

if (failed) { console.error(`\n❌ sonde de la recherche : ${failed} échec(s) sur ${passed + failed}\n`); process.exit(1); }
console.log(`\n✅ sonde de la recherche : ${passed} vérifications OK\n`);
