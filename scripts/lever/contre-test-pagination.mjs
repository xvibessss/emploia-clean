// Contre-test : le recouvrement mesuré est-il un artefact de la pagination ?
//
// `recouvrement.mjs` interroge l'API de production sur `page=0`, et celle-ci
// borne chaque source (France Travail à 8 résultats, les offres employeurs à
// 5, Greenhouse à 10 par page…). Si emploia connaissait les 77 offres Veepee
// mais n'en rendait que 12 par page, l'apport mesuré serait un artefact de
// pagination et non un trou de couverture. Il faut le vérifier avant de
// conclure quoi que ce soit — c'est le même contre-test qui a validé le
// relevé Greenhouse, refait ici parce qu'un protocole ne se cite pas, il se
// rejoue.
const API = process.env.EMPLOIA_API || 'https://emploia.eu/api/jobs';
const pause = (ms) => new Promise(r => setTimeout(r, ms));
const cle = j => (j.title + j.company).toLowerCase().replace(/[^a-z0-9]/g, '');
const normal = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

const CAS = [
  { q: 'Veepee', leverFR: 77 },
  { q: 'Pigment', leverFR: 46 },
  { q: 'Verkor', leverFR: 44 },
  { q: 'Qonto', leverFR: 27 },
];

for (const cas of CAS) {
  const vues = new Set();
  const deCetteEntreprise = new Set();
  let pagesVides = 0;
  for (let page = 0; page <= 10 && pagesVides < 2; page++) {
    let res;
    try {
      res = await fetch(`${API}?${new URLSearchParams({ q: cas.q, location: 'France', page: String(page) })}`);
    } catch (e) { console.log(`  ${cas.q} page ${page} → ${e.message}`); break; }
    if (!res.ok) { console.log(`  ${cas.q} page ${page} → http_${res.status}`); break; }
    const d = await res.json();
    const jobs = Array.isArray(d?.jobs) ? d.jobs : [];
    const avant = vues.size;
    for (const j of jobs) {
      if (!j?.title || !j?.company) continue;
      vues.add(cle(j));
      if (normal(j.company) === normal(cas.q)) deCetteEntreprise.add(cle(j));
    }
    if (vues.size === avant) pagesVides++; else pagesVides = 0;
    await pause(1100);
  }
  console.log(`${cas.q.padEnd(10)} : emploia rend ${String(vues.size).padStart(3)} offres distinctes sur 11 pages, dont ${String(deCetteEntreprise.size).padStart(3)} de l’entreprise elle-même — Lever en porte ${cas.leverFR} en France.`);
}
