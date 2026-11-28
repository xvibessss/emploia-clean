// Simulateur de filtre ATS : logique pure, testée par
// scripts/smoke/filtre-ats.test.mjs. Le handler est api/filtre-ats.js.
//
// MÉTHODE, affichée telle quelle sur la page : pour chaque offre RÉELLE du
// métier, on retient ses trois compétences les plus demandées sur l'ensemble
// des offres analysées — celles qu'un recruteur met le plus souvent en filtre.
// Le CV « passe » l'offre s'il cite ces trois compétences. Rien n'est tiré au
// hasard : chaque point de la grille est une offre, et chaque chiffre se
// recompte à partir de la liste renvoyée.

export const NB_EXIGEES = 3;
export const MIN_OFFRES = 15;

/** Fréquence de chaque compétence sur l'ensemble des offres. */
export function frequences(offres) {
  const f = new Map();
  for (const o of offres) for (const k of new Set(o.k)) f.set(k, (f.get(k) || 0) + 1);
  return f;
}

/** Les compétences d'une offre qu'on tient pour exigées : ses plus demandées. */
export function exigeesDe(k, freq, n = NB_EXIGEES) {
  return [...new Set(k)]
    .map((id, rang) => ({ id, rang, f: freq.get(id) || 0 }))
    .sort((a, b) => b.f - a.f || a.rang - b.rang)
    .slice(0, n)
    .map((x) => x.id);
}

/** L'offre laisse passer ce CV s'il cite toutes ses compétences exigées. */
export const passe = (exigees, cv) => exigees.every((id) => cv.has(id));

/**
 * offres : [{ t, c, k: [ids] }] — k = compétences repérées dans l'offre.
 * cvIds  : compétences repérées dans le CV.
 */
export function analyser(offres, cvIds) {
  const cv = new Set(cvIds);
  const freq = frequences(offres);
  const lignes = offres.map((o) => {
    const e = exigeesDe(o.k, freq);
    return { t: o.t, c: o.c, e, p: passe(e, cv) };
  });
  // Ce qui ferait revenir des offres : une compétence manquante dont l'ajout
  // SEULE suffit à repasser le filtre de l'offre.
  const recup = new Map();
  for (const l of lignes) {
    if (l.p) continue;
    const manque = l.e.filter((id) => !cv.has(id));
    if (manque.length === 1) recup.set(manque[0], (recup.get(manque[0]) || 0) + 1);
  }
  const exigeesQuelquePart = new Set(lignes.flatMap((l) => l.e));
  const manquantes = [...exigeesQuelquePart]
    .filter((id) => !cv.has(id))
    .map((id) => ({ id, n: freq.get(id) || 0, r: recup.get(id) || 0 }))
    .sort((a, b) => b.r - a.r || b.n - a.n)
    .slice(0, 12);
  const fortes = [...cv]
    .filter((id) => freq.has(id))
    .map((id) => ({ id, n: freq.get(id) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 12);
  const enLice = lignes.filter((l) => l.p).length;
  return { nbOffres: lignes.length, enLice, filtrees: lignes.length - enLice, offres: lignes, manquantes, fortes };
}
