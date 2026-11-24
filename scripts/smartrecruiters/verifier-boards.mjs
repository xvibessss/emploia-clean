// Vérification entreprise par entreprise du catalogue SmartRecruiters.
//
// Même doctrine que les trois `verifier-boards.mjs` précédents : un
// identifiant se devine, et un identifiant deviné qui ne rend rien est pire
// qu'une entreprise absente — il inscrit au catalogue un employeur qu'on ne
// collectera jamais.
//
// CE QUE CETTE SONDE DOIT FAIRE DE PLUS, et c'est propre à SmartRecruiters :
// un identifiant INCONNU rend HTTP 200 avec `totalFound: 0`, pas 404. Le
// statut ne départage donc rien. Ce qui départage, c'est `company.name` dans
// les offres servies : une entreprise n'est « vivante » que si elle sert au
// moins une offre, et elle n'est « la bonne » que si son nom est celui
// attendu. Deux identifiants peuvent aussi désigner la MÊME entreprise
// (`accor` et `accorhotels`) : la sonde regroupe par `company.identifier`
// servi, pour qu'aucune entreprise n'entre deux fois au catalogue.
//
// Elle mesure aussi, avant qu'une ligne de collecteur s'appuie dessus :
//   · le filtre serveur `country=fr` est-il honnête ? On recompte
//     `location.country` sur chaque offre rendue sous ce filtre ;
//   · `typeOfEmployment` dit-il un CONTRAT ou une DURÉE ? On le croise avec
//     les titres qui écrivent « CDI » ou « CDD » ;
//   · combien d'offres portent une ville, un drapeau distanciel, une date.
//
//   node scripts/smartrecruiters/verifier-boards.mjs            # candidats par défaut
//   node scripts/smartrecruiters/verifier-boards.mjs accor alten
import { CANDIDATS } from './candidats.mjs';

const API = 'https://api.smartrecruiters.com/v1/companies';
const CONCURRENCE = 4;
const TIMEOUT_MS = 20000;
const PAR_PAGE = 100;   // le maximum que l'API accepte

async function lire(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'emploia-prototype/1.0' } });
    if (!res.ok) return { statut: res.status };
    try { return { statut: 200, data: await res.json() }; } catch { return { statut: 200, note: 'reponse_illisible' }; }
  } catch (e) {
    return { statut: null, note: e.name === 'AbortError' ? 'timeout' : 'erreur_reseau' };
  } finally { clearTimeout(t); }
}

const titre = (p) => String(p?.name ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

async function sonder(id) {
  const tout = await lire(`${API}/${encodeURIComponent(id)}/postings?limit=1`);
  if (tout.statut !== 200 || !tout.data) return { id, statut: tout.statut, note: tout.note, offres: null };
  const total = Number(tout.data.totalFound) || 0;
  if (!total) return { id, statut: 200, offres: 0, note: 'aucune_offre' };

  // Toutes les offres FR, page après page, jusqu'à épuisement.
  const fr = [];
  for (let offset = 0; offset < 5000; offset += PAR_PAGE) {
    const page = await lire(`${API}/${encodeURIComponent(id)}/postings?limit=${PAR_PAGE}&offset=${offset}&country=fr`);
    if (page.statut !== 200 || !Array.isArray(page.data?.content)) {
      return { id, statut: page.statut, note: page.note || 'pagination_interrompue', offres: total };
    }
    fr.push(...page.data.content);
    if (page.data.content.length < PAR_PAGE || fr.length >= Number(page.data.totalFound)) break;
  }

  const premiere = tout.data.content?.[0];
  const types = new Map();
  for (const p of fr) types.set(p?.typeOfEmployment?.id ?? '∅', (types.get(p?.typeOfEmployment?.id ?? '∅') || 0) + 1);

  // Le croisement qui décide : un titre qui ÉCRIT son contrat contre l'id
  // structuré. Si `permanent` couvre des CDD, l'id n'est pas un contrat.
  const croisement = { cdiEcrit: {}, cddEcrit: {} };
  for (const p of fr) {
    const t = titre(p), tid = p?.typeOfEmployment?.id ?? '∅';
    if (/\bcdi\b/.test(t)) croisement.cdiEcrit[tid] = (croisement.cdiEcrit[tid] || 0) + 1;
    if (/\bcdd\b/.test(t)) croisement.cddEcrit[tid] = (croisement.cddEcrit[tid] || 0) + 1;
  }

  return {
    id, statut: 200, offres: total, offresFR: fr.length,
    nom: premiere?.company?.name ?? null,
    identifiantServi: premiere?.company?.identifier ?? null,
    // Le filtre serveur, recompté offre par offre.
    filtreMenteur: fr.filter(p => String(p?.location?.country ?? '').toLowerCase() !== 'fr').length,
    sansVille: fr.filter(p => !p?.location?.city).length,
    distanciel: fr.filter(p => p?.location?.remote === true).length,
    hybride: fr.filter(p => p?.location?.hybrid === true).length,
    sansDate: fr.filter(p => !p?.releasedDate).length,
    contratDansTitre: fr.filter(p => /\b(cdi|cdd|stage|stagiaire|alternance|alternant|apprenti|interim|freelance)\b/.test(titre(p))).length,
    types: Object.fromEntries(types),
    croisement,
    exemples: fr.slice(0, 3).map(p => p.name),
  };
}

async function enLots(liste, n, fn) {
  const out = [];
  for (let i = 0; i < liste.length; i += n) {
    out.push(...await Promise.all(liste.slice(i, i + n).map(fn)));
    process.stderr.write(`  …${Math.min(i + n, liste.length)}/${liste.length}\n`);
  }
  return out;
}

const args = process.argv.slice(2);
const out = args.find(a => a.startsWith('--out='))?.slice(6) || null;
const libres = args.filter(a => !a.startsWith('--'));
const candidats = [...new Set((libres.length ? libres : CANDIDATS).map(s => s.toLowerCase()))];
console.error(`Sondage de ${candidats.length} identifiants SmartRecruiters…`);
const res = await enLots(candidats, CONCURRENCE, sonder);

const vivants = res.filter(r => r.statut === 200 && r.offres > 0 && r.offresFR !== undefined);
// Deux identifiants, une entreprise : on garde celui que l'API sert elle-même.
const parEntreprise = new Map();
for (const r of vivants) {
  const cle = String(r.identifiantServi || r.id).toLowerCase();
  if (!parEntreprise.has(cle) || r.id === cle) parEntreprise.set(cle, r);
}
const uniques = [...parEntreprise.values()];
const avecFR = uniques.filter(r => r.offresFR > 0);

console.log('\n── ENTREPRISES QUI SERVENT DES OFFRES ───────────────');
for (const r of uniques.sort((a, b) => b.offresFR - a.offresFR || b.offres - a.offres)) {
  console.log(`  ${String(r.offres).padStart(5)} offres  ${String(r.offresFR).padStart(4)} FR   ${r.id.padEnd(22)} « ${r.nom} »${r.identifiantServi && r.identifiantServi.toLowerCase() !== r.id ? `  (servi sous ${r.identifiantServi})` : ''}`);
}
const doublons = vivants.length - uniques.length;
console.log(`\n  identifiants en double (même entreprise) : ${doublons}`);

console.log('\n── IDENTIFIANTS SANS OFFRE ──────────────────────────');
const morts = res.filter(r => !(r.statut === 200 && r.offres > 0 && r.offresFR !== undefined));
const parCause = new Map();
for (const r of morts) { const k = r.note || 'HTTP ' + r.statut; parCause.set(k, (parCause.get(k) || 0) + 1); }
for (const [k, v] of [...parCause].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
const suspects = morts.filter(r => r.note === 'timeout' || r.note === 'erreur_reseau' || r.note === 'pagination_interrompue');
console.log(`  faux négatifs possibles : ${suspects.length}${suspects.length ? ' — ' + suspects.map(r => `${r.id}:${r.note}`).join(', ') : ''}`);

const totFR = avecFR.reduce((s, r) => s + r.offresFR, 0);
const tot = uniques.reduce((s, r) => s + r.offres, 0);
console.log(`\nRésumé : ${uniques.length} entreprises distinctes servent des offres, ${avecFR.length} en France.`);
console.log(`Total : ${tot} offres, dont ${totFR} sous country=fr (${tot ? (100 * totFR / tot).toFixed(1) : 0} %).`);

console.log('\n── LE FILTRE SERVEUR EST-IL HONNÊTE ? ───────────────');
console.log(`  offres rendues sous country=fr dont location.country ≠ fr : ${avecFR.reduce((s, r) => s + r.filtreMenteur, 0)} / ${totFR}`);
console.log(`  sans ville : ${avecFR.reduce((s, r) => s + r.sansVille, 0)} · distanciel : ${avecFR.reduce((s, r) => s + r.distanciel, 0)} · hybride : ${avecFR.reduce((s, r) => s + r.hybride, 0)} · sans date : ${avecFR.reduce((s, r) => s + r.sansDate, 0)}`);

console.log('\n── typeOfEmployment : CONTRAT OU DURÉE ? ────────────');
const types = {}, cdi = {}, cdd = {};
for (const r of avecFR) {
  for (const [k, v] of Object.entries(r.types)) types[k] = (types[k] || 0) + v;
  for (const [k, v] of Object.entries(r.croisement.cdiEcrit)) cdi[k] = (cdi[k] || 0) + v;
  for (const [k, v] of Object.entries(r.croisement.cddEcrit)) cdd[k] = (cdd[k] || 0) + v;
}
console.log('  ids servis            :', JSON.stringify(types));
console.log('  titres écrivant « CDI »:', JSON.stringify(cdi));
console.log('  titres écrivant « CDD »:', JSON.stringify(cdd));
console.log(`  contrat écrit dans le titre : ${avecFR.reduce((s, r) => s + r.contratDansTitre, 0)} / ${totFR}`);

if (out) {
  const fs = await import('node:fs');
  fs.writeFileSync(out, JSON.stringify({ releve: new Date().toISOString(), resultats: res }, null, 2));
  console.log(`\nRelevé complet écrit dans ${out}`);
}
console.log('\nJSON:' + JSON.stringify(avecFR.map(r => ({ board: r.id, company: r.nom, offres: r.offres, offresFR: r.offresFR }))));
