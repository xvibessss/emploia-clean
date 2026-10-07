#!/usr/bin/env node
// Sonde des sources d'offres : /api/jobs répond-il, et avec combien de bras ?
//
//   node scripts/smoke/sources.mjs                 # emploia.eu
//   node scripts/smoke/sources.mjs https://autre   # autre base
//
// Pourquoi cette sonde existe. /api/jobs interroge huit collecteurs en
// parallèle et rend ce qui revient. Un collecteur qui tombe ne fait donc pas
// tomber la réponse : elle reste 200, la page affiche des offres, et personne
// ne voit qu'il en manque. Trois des huit ne renvoyaient plus rien — France
// Travail jamais configuré, Internships en 404, Adzuna en 400 — et le seul
// moyen de s'en apercevoir était de compter les sources à la main.
//
// La sonde de surface ne pouvait pas l'attraper : elle vérifie qu'un handler
// ne répond ni 500 ni 404, et /api/jobs répondait 200. C'est une panne de
// contenu, pas de disponibilité, et il lui faut son propre contrôle.

const BASE = (process.argv.find((a) => a.startsWith('http')) || 'https://emploia.eu').replace(/\/$/, '');
const TIMEOUT = 25000;

// Des requêtes volontairement différentes : un métier de santé, un métier
// technique localisé, un métier manuel. Une seule requête ne prouverait pas
// que la recherche filtre — c'est précisément ce qu'on veut aussi vérifier.
const REQUETES = [
  { chemin: '/api/jobs?q=infirmier', attendu: 'infirmi' },
  { chemin: '/api/jobs?q=developpeur&location=Lyon', attendu: 'lyon' },
  { chemin: '/api/jobs?q=boulanger', attendu: 'boulang' },
];

// Les collecteurs qu'on sait absents, chacun avec sa raison. Une absence sans
// raison écrite ici fait échouer la sonde : c'est ce qui empêche la liste de
// grossir en silence jusqu'à ne plus rien prouver.
const ABSENCES_CONNUES = {
  'France Travail': 'FRANCE_TRAVAIL_CLIENT_ID / _SECRET jamais créés — compte à ouvrir sur francetravail.io',
  Internships: 'HTTP 404 sur internships-api.p.rapidapi.com/active-jb-7d — abonnement ou chemin à revoir sur RapidAPI',
  Emploia: "aucune offre déposée par un employeur pour l'instant — normal tant que personne n'a publié",
  // Adzuna répond, mais par intermittence : des HTTP 503 de leur côté, plusieurs
  // fois par heure. Le tolérer évite une sonde rouge au hasard des minutes ;
  // c'est le journal d'exécution qui dira si le 503 devient permanent.
  Adzuna: 'HTTP 503 intermittent côté Adzuna — toléré, à relire si la source disparaît durablement',
};

let echecs = 0;
const ko = (m, d) => { echecs++; console.error(`  ✗ ${m}${d ? ` — ${d}` : ''}`); };
const ok = (m, d) => console.log(`  ✓ ${m}${d ? ` — ${d}` : ''}`);

console.log(`\nSonde des sources d'offres — ${BASE}\n`);

const vues = new Set();
const absencesRencontrees = new Set();
// Une réponse sans `sourcesEnEchec` vient d'un déploiement antérieur à
// l'instrumentation. Sans ce drapeau, l'absence du champ se lirait comme
// « aucun collecteur en échec » : la sonde dirait vert sur une panne.
let champPresent = false;

for (const { chemin, attendu } of REQUETES) {
  let rep;
  try {
    const res = await fetch(BASE + chemin, { signal: AbortSignal.timeout(TIMEOUT) });
    if (res.status !== 200) { ko(chemin, `HTTP ${res.status}`); continue; }
    rep = await res.json();
  } catch (e) { ko(chemin, e.name === 'TimeoutError' ? 'délai dépassé' : e.message); continue; }

  // `demo: true` est le repli codé en dur du handler : il signifie que les
  // huit collecteurs sont revenus vides. C'est le pire cas, et il est muet.
  if (rep.demo) { ko(chemin, 'réponse de démonstration — les huit collecteurs sont revenus vides'); continue; }
  if (!rep.total) { ko(chemin, 'aucune offre'); continue; }

  // Le filtre fonctionne-t-il ? Une recherche qui rend des offres sans rapport
  // est aussi cassée qu'une recherche vide, mais elle en a l'air moins.
  const pertinentes = (rep.jobs || []).filter((j) =>
    `${j.title} ${j.location}`.toLowerCase().includes(attendu)).length;
  if (!pertinentes) { ko(chemin, `${rep.total} offres, aucune ne mentionne « ${attendu} »`); continue; }

  if (Array.isArray(rep.sourcesEnEchec)) champPresent = true;
  for (const s of rep.sourcesEnEchec || []) absencesRencontrees.add(s);
  for (const s of rep.sources || []) vues.add(s);
  ok(chemin, `${rep.total} offres · ${pertinentes} pertinentes dans la première page`);
}

console.log('');
if (!champPresent) {
  ko('la réponse ne porte pas `sourcesEnEchec`',
     "déploiement antérieur à l'instrumentation — l'état des collecteurs est invérifiable");
}
const inattendues = [...absencesRencontrees].filter((s) => !ABSENCES_CONNUES[s]);
if (inattendues.length) ko(`${inattendues.length} collecteur(s) en échec sans raison déclarée`, inattendues.join(', '));
else ok('aucun collecteur en échec en dehors des absences déclarées');

for (const [nom, raison] of Object.entries(champPresent ? ABSENCES_CONNUES : {})) {
  if (absencesRencontrees.has(nom)) console.log(`  ! ${nom} toujours absent — ${raison}`);
  else console.log(`  ↻ ${nom} ne figure plus parmi les échecs — retirer son entrée d'ABSENCES_CONNUES`);
}

console.log(`\n${vues.size} source(s) distinctes ont fourni des offres`);
console.log(`${echecs ? '❌' : '✅'} ${echecs} problème(s)\n`);
process.exit(echecs ? 1 : 0);
