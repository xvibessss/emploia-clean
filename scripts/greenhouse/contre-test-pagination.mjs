// Contre-test : le recouvrement mesuré est-il un artefact de la pagination ?
//
// `recouvrement.mjs` interroge l'API de production sur `page=0`, et celle-ci
// borne chaque source (France Travail à 8 résultats, les offres employeurs à
// 5…). Si emploia connaissait les 76 offres Doctolib mais n'en rendait que 17
// par page, l'apport mesuré serait un artefact de pagination et non un trou de
// couverture. Il faut le vérifier avant de conclure quoi que ce soit.
//
// On repagine donc les trois plus gros boards jusqu'à épuisement, et on
// compte les offres DISTINCTES que l'API finit par rendre pour cette
// entreprise. Si le total plafonne loin sous le compte Greenhouse, le trou est
// réel.
const API = process.env.EMPLOIA_API || 'https://emploia.eu/api/jobs';
const pause = (ms) => new Promise(r => setTimeout(r, ms));
const cle = j => (j.title + j.company).toLowerCase().replace(/[^a-z0-9]/g, '');

const CAS = [
  { q: 'Doctolib', greenhouseFR: 76 },
  { q: 'Datadog', greenhouseFR: 50 },
  { q: 'SumUp', greenhouseFR: 37 },
];

for (const cas of CAS) {
  const vues = new Set();
  const deCetteEntreprise = new Set();
  let pagesVides = 0;
  for (let page = 0; page <= 10 && pagesVides < 2; page++) {
    const res = await fetch(`${API}?${new URLSearchParams({ q: cas.q, location: 'France', page: String(page) })}`);
    if (!res.ok) { console.log(`  ${cas.q} page ${page} → http_${res.status}`); break; }
    const d = await res.json();
    const jobs = Array.isArray(d?.jobs) ? d.jobs : [];
    const avant = vues.size;
    for (const j of jobs) {
      if (!j?.title || !j?.company) continue;
      vues.add(cle(j));
      if (String(j.company).toLowerCase().replace(/[^a-z0-9]/g, '') === cas.q.toLowerCase().replace(/[^a-z0-9]/g, '')) {
        deCetteEntreprise.add(cle(j));
      }
    }
    if (vues.size === avant) pagesVides++; else pagesVides = 0;
    await pause(1100);
  }
  console.log(`${cas.q.padEnd(10)} : emploia rend ${String(vues.size).padStart(3)} offres distinctes sur 11 pages, dont ${String(deCetteEntreprise.size).padStart(3)} de l’entreprise elle-même — Greenhouse en porte ${cas.greenhouseFR} en France.`);
}
