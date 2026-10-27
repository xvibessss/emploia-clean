// Vérification board par board du catalogue Ashby.
//
// LA RÈGLE QUE CE RELEVÉ APPLIQUE EN PREMIER, et elle vient du sondage de
// clôture du relevé Teamtailor : **un board vivant se constate à ce qu'il
// PORTE, jamais à son code HTTP**. SmartRecruiters répond HTTP 200 à tout, y
// compris au slug `zzz-entreprise-inexistante-xyz`, avec zéro offre dans tous
// les cas — un sondage sur le code aurait inscrit huit entreprises fantômes.
//
// Ashby, lui, se comporte bien : 404 pour un slug inconnu, 200 avec
// `{"jobs":[]}` pour un board réel mais vide (constaté sur `spendesk`). Le
// code y est donc significatif — raison de plus pour ne pas s'y fier par
// habitude. Cette sonde classe sur le CONTENU et rapporte les deux cas
// séparément, pour que le prochain lecteur voie que la distinction a été
// vérifiée plutôt que supposée.
//
// CE QU'ELLE MESURE EN PLUS, et qui décide du collecteur :
//   · `isRemote` CONTREDIT `workplaceType`. Sur `alan`, 80 offres portent
//     `isRemote: true` ET `workplaceType: "Hybrid"`, à Paris ou Madrid. Dans
//     `api/jobs.js`, une offre `remote: true` matche TOUS les filtres de lieu
//     — ces 80 remonteraient donc sur chaque page ville. La sonde compte la
//     contradiction avant qu'une ligne de collecteur choisisse un champ.
//   · La rémunération est derrière un DRAPEAU DE CONSENTEMENT,
//     `shouldDisplayCompensationOnJobPostings`, et elle mélange salaire et
//     equity. La sonde vérifie que le drapeau et les données concordent.
//   · `addressCountry` est un NOM de pays, pas un code ISO — et il vaut
//     parfois « European Union » ou « France, Metropolitan ».
//
//   node scripts/ashby/verifier-boards.mjs            # candidats par défaut
//   node scripts/ashby/verifier-boards.mjs alan       # candidats explicites
import { CANDIDATS } from './candidats.mjs';

const BASE = 'https://api.ashbyhq.com/posting-api/job-board';
const CONCURRENCE = 6;
const TIMEOUT_MS = 30000;

// « France » et ses variantes telles qu'Ashby les écrit, constatées au relevé.
const NOMS_FR = /^(france|france, metropolitan|french guiana|réunion|reunion|guadeloupe|martinique|mayotte)$/i;
const TEXTE_FR = /\bfrance\b|\bparis\b|\blyon\b|\bmarseille\b|\btoulouse\b|\bbordeaux\b|\blille\b|\bnantes\b|\bnice\b|\bstrasbourg\b|\bmontpellier\b|\brennes\b|\bgrenoble\b/i;

const lieux = (j) => [
  { location: j?.location, address: j?.address },
  ...(Array.isArray(j?.secondaryLocations) ? j.secondaryLocations : []),
];
const paysDe = (l) => String(l?.address?.postalAddress?.addressCountry ?? '').trim();

async function sonder(board) {
  const url = `${BASE}/${encodeURIComponent(board)}?includeCompensation=true`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'emploia-prototype/1.0' } });
    } finally { clearTimeout(t); }
    if (!res.ok) return { board, statut: res.status, offres: null };
    let data;
    try { data = await res.json(); } catch { return { board, statut: 200, offres: null, note: 'reponse_illisible' }; }
    if (!Array.isArray(data?.jobs)) return { board, statut: 200, offres: null, note: 'reponse_illisible' };
    const jobs = data.jobs;

    // On ne compte que les offres PUBLIÉES. `isListed: false` est une offre
    // retirée du site carrière par l'employeur.
    const listees = jobs.filter(j => j.isListed !== false);

    const estFR = (j) => lieux(j).some(l => NOMS_FR.test(paysDe(l)));
    const estFRparTexte = (j) => lieux(j).some(l => TEXTE_FR.test(String(l?.location ?? '')));
    const parPays = listees.filter(estFR).length;
    const parTexte = listees.filter(estFRparTexte).length;

    // Les désaccords entre les deux signaux.
    const paysSansTexte = listees.filter(j => estFR(j) && !estFRparTexte(j))
      .map(j => lieux(j).map(l => paysDe(l) + '/' + String(l?.location ?? '')).join(' + '));
    const texteSansPays = listees.filter(j => estFRparTexte(j) && !estFR(j))
      .map(j => lieux(j).map(l => (paysDe(l) || '∅') + '/' + String(l?.location ?? '')).join(' + '));

    // La France uniquement en lieu SECONDAIRE : le piège de la famille.
    const frSecondaire = listees.filter(j =>
      !NOMS_FR.test(paysDe({ location: j.location, address: j.address })) &&
      (j.secondaryLocations || []).some(l => NOMS_FR.test(paysDe(l)))
    ).map(j => paysDe({ address: j.address }) + ' + [' + (j.secondaryLocations || []).map(paysDe).join(', ') + ']');

    // LA CONTRADICTION : isRemote vs workplaceType.
    const remoteContredit = listees.filter(j => j.isRemote === true && j.workplaceType && j.workplaceType !== 'Remote').length;
    const vraimentRemote = listees.filter(j => j.workplaceType === 'Remote').length;
    const isRemoteVrai = listees.filter(j => j.isRemote === true).length;

    // La rémunération : le drapeau de consentement concorde-t-il ?
    const aDonnees = (j) => Boolean(j.compensation?.compensationTierSummary || j.compensation?.summaryComponents?.length);
    const flagFauxAvecDonnees = listees.filter(j => !j.shouldDisplayCompensationOnJobPostings && aDonnees(j)).length;
    const flagVrai = listees.filter(j => j.shouldDisplayCompensationOnJobPostings).length;
    const composants = listees.flatMap(j => j.compensation?.summaryComponents || []);

    return {
      board, statut: 200, offres: listees.length, nonListees: jobs.length - listees.length,
      offresFR: parPays, offresFRparTexte: parTexte,
      paysSansTexte, texteSansPays, frSecondaire,
      remoteContredit, vraimentRemote, isRemoteVrai,
      flagVrai, flagFauxAvecDonnees,
      avecSalaire: composants.filter(c => c.compensationType === 'Salary').length,
      typesRemuneration: [...new Set(composants.map(c => c.compensationType))],
      intervalles: [...new Set(composants.map(c => c.interval))],
      devises: [...new Set(composants.map(c => c.currencyCode))],
      employmentTypes: [...new Set(listees.map(j => j.employmentType).filter(Boolean))],
      workplaceTypes: [...new Set(listees.map(j => j.workplaceType).filter(Boolean))],
      pays: [...new Set(listees.flatMap(j => lieux(j).map(paysDe).filter(Boolean)))],
    };
  } catch (e) {
    return { board, statut: null, offres: null, note: e.name === 'AbortError' ? 'timeout' : 'erreur_reseau' };
  }
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
const candidats = libres.length ? libres : CANDIDATS;
console.error(`Sondage de ${candidats.length} boards Ashby…`);
const res = await enLots(candidats, CONCURRENCE, sonder);

// LE CLASSEMENT SE FAIT SUR LE CONTENU, pas sur le code.
const lisibles = res.filter(r => r.offres !== null);
const porteurs = lisibles.filter(r => r.offres > 0);
const videsMaisReels = lisibles.filter(r => r.offres === 0);
const avecFR = porteurs.filter(r => r.offresFR > 0);

console.log('\n── BOARDS QUI PORTENT DES OFFRES ────────────────────');
for (const r of porteurs.sort((a, b) => b.offresFR - a.offresFR || b.offres - a.offres)) {
  console.log(`  ${String(r.offres).padStart(4)} offres  ${String(r.offresFR).padStart(4)} FR   ${r.board}`);
}
console.log(`\n── BOARDS RÉELS MAIS VIDES (200, zéro offre) ────────`);
console.log(`  ${videsMaisReels.length}${videsMaisReels.length ? ' — ' + videsMaisReels.map(r => r.board).join(', ') : ''}`);
console.log('  Ils ne sont PAS inscrits : le critère est de porter une offre française, pas d’exister.');

console.log('\n── CE QUI NE RÉPOND PAS ─────────────────────────────');
const morts = res.filter(r => r.offres === null);
const parCause = new Map();
for (const r of morts) { const k = r.note || 'HTTP ' + r.statut; parCause.set(k, (parCause.get(k) || 0) + 1); }
for (const [k, v] of [...parCause].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
const suspects = morts.filter(r => r.note === 'timeout' || r.note === 'erreur_reseau');
console.log(`  faux négatifs possibles (timeout / réseau) : ${suspects.length}${suspects.length ? ' — ' + suspects.map(r => r.board).join(', ') : ''}`);

const tot = porteurs.reduce((s, r) => s + r.offres, 0);
const totFR = porteurs.reduce((s, r) => s + r.offresFR, 0);
console.log(`\nRésumé : ${lisibles.length}/${candidats.length} lisibles, ${porteurs.length} portent au moins une offre, ${avecFR.length} au moins une en France.`);
console.log(`Total offres publiées : ${tot} — dont ${totFR} en France (${tot ? (100 * totFR / tot).toFixed(1) : 0} %), ${porteurs.reduce((s, r) => s + r.offresFRparTexte, 0)} par le texte du lieu.`);
console.log(`Offres non listées, écartées : ${porteurs.reduce((s, r) => s + r.nonListees, 0)}`);

console.log('\n── LA CONTRADICTION isRemote / workplaceType ────────');
console.log(`  offres isRemote = true          : ${porteurs.reduce((s, r) => s + r.isRemoteVrai, 0)}`);
console.log(`  dont workplaceType ≠ "Remote"   : ${porteurs.reduce((s, r) => s + r.remoteContredit, 0)}  <-- les marquer distancielles les ferait remonter sur TOUTES les pages ville`);
console.log(`  offres workplaceType = "Remote" : ${porteurs.reduce((s, r) => s + r.vraimentRemote, 0)}`);
console.log('  workplaceType observés :', JSON.stringify([...new Set(porteurs.flatMap(r => r.workplaceTypes))].sort()));

console.log('\n── LA RÉMUNÉRATION, ET LE CONSENTEMENT DE L’EMPLOYEUR ');
console.log(`  offres avec le drapeau d’affichage à true : ${porteurs.reduce((s, r) => s + r.flagVrai, 0)}`);
console.log(`  offres AVEC données mais drapeau à false  : ${porteurs.reduce((s, r) => s + r.flagFauxAvecDonnees, 0)}  <-- si >0, publier violerait un choix explicite`);
console.log(`  composants de type « Salary »             : ${porteurs.reduce((s, r) => s + r.avecSalaire, 0)}`);
console.log('  types de rémunération :', JSON.stringify([...new Set(porteurs.flatMap(r => r.typesRemuneration))].sort()));
console.log('  intervalles           :', JSON.stringify([...new Set(porteurs.flatMap(r => r.intervalles))].sort()));
console.log('  devises               :', JSON.stringify([...new Set(porteurs.flatMap(r => r.devises))].sort()));

console.log('\n── LE PAYS : un NOM, pas un code ISO ────────────────');
const dp = porteurs.flatMap(r => r.paysSansTexte);
const dt = porteurs.flatMap(r => r.texteSansPays);
console.log(`  pays = France mais le texte ne le dit pas : ${dp.length}`);
for (const d of [...new Set(dp)].slice(0, 12)) console.log(`      ${d}`);
console.log(`  texte français mais pays ≠ France        : ${dt.length}`);
for (const d of [...new Set(dt)].slice(0, 12)) console.log(`      ${d}`);
const sec = porteurs.flatMap(r => r.frSecondaire);
console.log(`  France UNIQUEMENT en lieu secondaire     : ${sec.length}`);
for (const d of [...new Set(sec)].slice(0, 12)) console.log(`      ${d}`);
console.log('\n  valeurs de addressCountry :', JSON.stringify([...new Set(porteurs.flatMap(r => r.pays))].sort().slice(0, 40)));
console.log('  employmentType observés   :', JSON.stringify([...new Set(porteurs.flatMap(r => r.employmentTypes))].sort()));

if (out) {
  const fs = await import('node:fs');
  fs.writeFileSync(out, JSON.stringify({ releve: new Date().toISOString(), resultats: res }, null, 2));
  console.log(`\nRelevé complet écrit dans ${out}`);
}
console.log('\nJSON:' + JSON.stringify(avecFR.map(r => ({ board: r.board, offres: r.offres, offresFR: r.offresFR }))));
