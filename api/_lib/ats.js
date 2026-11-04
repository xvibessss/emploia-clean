// ── REGISTRE DES ATS CRAWLÉS EN DIRECT ───────────────────────────────────────
// Les collecteurs de cette famille ne sont pas des API tierces qui republient :
// ils lisent l'ATS de l'employeur à la source, sans clé ni quota, et servent
// l'URL de la page de candidature de l'entreprise. Greenhouse a ouvert la voie
// (PR 99) ; Lever est le second.
//
// POURQUOI UN REGISTRE, ET UN SEUL CRON. Le premier réflexe était un cron par
// ATS. Deux raisons de ne pas le faire, et une seule est bonne :
//
//   · La MAUVAISE raison, et il faut la retirer explicitement : « le plan
//     Hobby plafonne le nombre de crons ». IL NE LE FAIT PAS à cette échelle.
//     Vérifié sur la page de tarification des crons de Vercel : Hobby autorise
//     100 crons par projet, comme Pro et comme Enterprise. Ce que Hobby
//     interdit, c'est la FRÉQUENCE — une exécution par jour au plus, avec une
//     précision à l'heure près — et c'est cette contrainte-là, et pas le
//     nombre, qui avait fait échouer le déploiement de la PR 99. Le dépôt
//     compte dix crons ; un onzième n'aurait rien cassé. Justifier
//     l'architecture par une limite inexistante serait exactement la devinette
//     que `_lib/contrat.js` interdit pour la donnée.
//
//   · La BONNE raison : un ATS de plus ne doit coûter qu'une LIGNE. Ici, un
//     fournisseur déclare son nom, sa clé KV, son catalogue et sa fonction de
//     collecte ; le cron applique les trois mêmes gardes à tous, et
//     `api/jobs.js` fait un `kvGet` par clé. Quand Teamtailor viendra, il n'y
//     aura ni cron à écrire, ni heure à choisir, ni garde à recopier — et
//     c'est le recopiage qui fait diverger les gardes.
//
// La clé reste PAR FOURNISSEUR, et non partagée. C'est ce qui permet à
// `causesEnEchec` de nommer Greenhouse et Lever séparément : une panne du
// crawl Lever ne doit pas se lire comme une panne de Greenhouse, ni se
// masquer derrière ses offres. Une seule clé commune rendrait les deux pannes
// indiscernables — précisément le silence que `causesEnEchec` est venu retirer.
import { TTL_OFFRES_SECONDES } from './ats-balise.js';
import { collecterGreenhouse } from './greenhouse.js';
import { BOARDS as BOARDS_GREENHOUSE, RELEVE as RELEVE_GREENHOUSE } from './greenhouse-boards.js';
import { collecterLever } from './lever.js';
import { collecterTeamtailor } from './teamtailor.js';
import { BOARDS as BOARDS_LEVER, RELEVE as RELEVE_LEVER } from './lever-boards.js';
import { BOARDS as BOARDS_TEAMTAILOR, RELEVE as RELEVE_TEAMTAILOR } from './teamtailor-boards.js';

// 72 heures, pour un cron QUOTIDIEN. Le rapport est délibéré : deux collectes
// consécutives peuvent échouer avant que la clé disparaisse, et à la troisième
// la source bascule dans `sourcesEnEchec` avec la cause `collecte_absente`.
//
// C'est le point du TTL : la clé EXPIRE au lieu de vivre indéfiniment. Un TTL
// infini aurait servi éternellement le dernier relevé réussi, et une panne de
// cron serait restée invisible — exactement le silence que `causesEnEchec` est
// venu retirer pour les sources amont. Mieux vaut une source déclarée morte
// qu'une source qui sert du périmé sans le dire.
// Une seule définition, dans `_lib/ats-balise.js`, parce que la balise en
// dépend et qu'elle ne peut pas importer ce fichier (voir l'en-tête là-bas).
export const TTL_SECONDES = TTL_OFFRES_SECONDES;

// MESURÉ chez Greenhouse : 668 octets par offre, soit 218 Ko pour 334 offres.
// La borne existe parce que ce chiffre est fonction du catalogue : à 200 boards
// la même valeur pèserait ~1,5 Mo et dépasserait la taille d'un enregistrement
// Upstash. 600 offres ≈ 400 Ko, donc une marge de 2,5× sous la limite — et le
// jour où un catalogue la dépasse, la troncature est JOURNALISÉE plutôt que
// découverte par une écriture qui échoue en silence.
export const MAX_OFFRES = 600;

export const FOURNISSEURS = [
  {
    nom: 'Greenhouse',
    cle: 'greenhouse_jobs',
    boards: BOARDS_GREENHOUSE,
    releve: RELEVE_GREENHOUSE,
    collecter: collecterGreenhouse,
    // Plus large que la concurrence du collecteur en ligne : un cron n'a pas
    // d'utilisateur qui attend, et 8 boards en parallèle ramènent la collecte
    // de Greenhouse sous les 8 secondes.
    concurrence: 8,
  },
  {
    nom: 'Lever',
    cle: 'lever_jobs',
    boards: BOARDS_LEVER,
    releve: RELEVE_LEVER,
    collecter: collecterLever,
    // Plus basse que Greenhouse, et c'est mesuré : Lever rend la description
    // complète en HTML dans chaque élément du tableau — 1,2 Mo pour les 45
    // offres de `qonto`, ~27 ko par offre. Cinq boards de front suffisent à
    // saturer le décodage JSON sans ouvrir vingt connexions lourdes.
    concurrence: 5,
  },
  {
    nom: 'Teamtailor',
    cle: 'teamtailor_jobs',
    boards: BOARDS_TEAMTAILOR,
    releve: RELEVE_TEAMTAILOR,
    collecter: collecterTeamtailor,
    // Six, et la collecte tient en 5,1 s pour 19 boards — la plus rapide des
    // trois, parce que ces entreprises sont plus petites : 322 offres au
    // total, là où Lever en rend 1 900 et Greenhouse 6 500. Le cron passe donc
    // de ~34 s à ~40 s, loin sous les 300 s réservées dans vercel.json.
    concurrence: 6,
  },
];

// Une collecte, les trois gardes, un relevé prêt à écrire. Rendu séparément de
// l'écriture KV pour que la sonde puisse l'exécuter hors ligne.
//
// Les trois gardes, dans l'ordre où ils comptent :
//   1. On ne garde que la France — voir ci-dessous.
//   2. La borne de taille est journalisée quand elle mord.
//   3. Une collecte VIDE ne produit pas de relevé à écrire : `ecrire` vaut
//      `false`, et l'appelant laisse vivre la clé précédente sur son TTL.
export async function collecterFournisseur(fournisseur, options = {}) {
  const journal = [];
  const debut = Date.now();
  const toutes = await fournisseur.collecter(fournisseur.boards, {
    ...options,
    journal,
    concurrence: fournisseur.concurrence,
  });

  // On ne garde que la France. Ce n'est pas une économie de place, c'est une
  // question de ce qu'on sait servir : emploia est un site d'emploi français,
  // et une offre dont le pays n'a pas pu être ÉTABLI (`country: null`) n'est
  // pas une offre française qu'on aurait ratée — c'est un lieu qu'on n'a pas su
  // lire. La stocker pour la servir « au cas où » reviendrait à la présenter
  // comme française.
  const francaises = toutes.filter(o => o.country === 'FR');
  const retenues = francaises.slice(0, MAX_OFFRES);
  if (francaises.length > MAX_OFFRES) {
    console.error(`collect-ats/${fournisseur.nom}: ${francaises.length} offres FR pour une borne à ${MAX_OFFRES} — ${francaises.length - MAX_OFFRES} écartée(s). Le catalogue a dépassé ce qu'une seule clé KV peut porter : découper par clé.`);
  }

  return {
    nom: fournisseur.nom,
    cle: fournisseur.cle,
    // Les échecs de boards ne font pas échouer la collecte — c'est la garantie
    // du collecteur — mais ils ne partent pas qu'en journal d'exécution, dont
    // la rétention est courte. Ils entrent dans la valeur stockée, donc ils
    // survivent jusqu'à la collecte suivante et restent lisibles.
    valeur: {
      collecteLe: new Date().toISOString(),
      source: fournisseur.nom,
      boards: fournisseur.boards.length,
      boardsEnEchec: journal.map(e => ({
        board: String(e.source).replace(`${fournisseur.nom}/`, ''),
        cause: e.cause,
      })),
      offres: retenues,
    },
    // Une collecte vide n'écrase pas la précédente. Si tous les boards
    // échouent en même temps — panne réseau de la fonction, ATS indisponible —
    // écrire `offres: []` remplacerait un relevé valide par du vide, et la page
    // afficherait zéro offre en répondant 200.
    ecrire: retenues.length > 0,
    stats: {
      boards: fournisseur.boards.length,
      boardsEnEchec: journal.length,
      offresCollectees: toutes.length,
      offresFrance: francaises.length,
      offresStockees: retenues.length,
      contratLu: retenues.filter(o => o.type).length,
      dureeMs: Date.now() - debut,
    },
  };
}

// Réexportées pour que le cron n'ait qu'un seul import à faire.
export { CLE_BALISE, TTL_BALISE_SECONDES, construireBalise, causeDepuisBalise } from './ats-balise.js';
