// Le lecteur PARTAGÉ des réservoirs, prêt à être exécuté dans le bac à sable
// d'une sonde de collecteur.
//
// Les cinq collecteurs ATS de `api/jobs.js` délèguent leur lecture — contrat,
// lieu, requête, pagination — à `servirReservoir`, qui lit la requête avec
// `api/_lib/recherche.js`. Une sonde qui exécute `fetchLever` dans un `vm` doit
// donc lui fournir ces deux pièces. Elles sont lues dans le VRAI handler et
// importées du VRAI module, jamais recopiées : une copie resterait verte en
// divergeant de ce que la production exécute.
import * as recherche from '../../api/_lib/recherche.js';

function extraireFonction(source, nom) {
  const i = source.indexOf(`function ${nom}(`);
  if (i < 0) return null;
  let profondeur = 0;
  for (let j = source.indexOf('{', i); j < source.length; j++) {
    if (source[j] === '{') profondeur++;
    else if (source[j] === '}' && --profondeur === 0) return source.slice(i, j + 1);
  }
  return null;
}

// `source` se place avant le collecteur dans `vm.runInContext` ; `globaux`
// s'ajoute au bac à sable.
export function lecteurPartage(jobsSrc) {
  const parPage = /const PAR_PAGE = \d+;/.exec(jobsSrc)?.[0];
  const servir = extraireFonction(jobsSrc, 'servirReservoir');
  return {
    present: Boolean(parPage && servir),
    source: `${parPage}\n${servir}`,
    globaux: { ...recherche },
  };
}
