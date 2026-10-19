// ── INGEST GREENHOUSE → UNE CLÉ KV ───────────────────────────────────────────
// Pourquoi un cron et pas un neuvième collecteur en ligne dans `api/jobs.js` :
// la collecte des 28 boards prend 10,1 s mesurées, là où le handler borne
// CHAQUE source à 10 s (`withTimeout(…, 10000)`). Branchée dans le chemin de
// la requête, elle expirerait à tous les coups — et à 60 boards elle serait
// trois fois pire. La durée d'une collecte ATS est fonction du nombre
// d'entreprises ; celle d'une requête utilisateur ne peut pas l'être.
//
// Le dépôt avait déjà la forme : les offres déposées par les employeurs vivent
// dans la clé `employer_jobs` et `fetchEmployerJobs` les lit avec un `kvGet`.
// Celui-ci fait pareil, à ceci près que la clé est remplie par un crawl plutôt
// que par un formulaire. Pour `api/jobs.js`, les deux sources se ressemblent :
// une lecture KV, pas un appel réseau.
export const config = { runtime: 'edge', regions: ['cdg1'] };

import { kvSet } from '../_lib/auth.js';
import { collecterGreenhouse } from '../_lib/greenhouse.js';
import { BOARDS } from '../_lib/greenhouse-boards.js';

export const CLE_KV = 'greenhouse_jobs';

// 36 heures, pour un cron qui tourne toutes les 6 heures. Le rapport est
// délibéré : cinq collectes consécutives peuvent échouer avant que la clé
// disparaisse, et à la sixième la source bascule dans `sourcesEnEchec` avec la
// cause `collecte_absente`.
//
// C'est le point : la clé EXPIRE au lieu de vivre indéfiniment. Un TTL infini
// aurait servi éternellement le dernier relevé réussi, et une panne de cron
// serait restée invisible — exactement le silence que `causesEnEchec` est venu
// retirer pour les huit sources amont. Mieux vaut une source déclarée morte
// qu'une source qui sert du périmé sans le dire.
export const TTL_SECONDES = 36 * 3600;

// MESURÉ : 668 octets par offre, soit 218 Ko pour les 334 offres du relevé du
// 2026-10-19. La borne existe parce que ce chiffre est fonction du catalogue :
// à 200 boards la même valeur peserait ~1,5 Mo et dépasserait la taille d'un
// enregistrement Upstash. 600 offres ≈ 400 Ko, donc une marge de 2,5× sous la
// limite — et le jour où le catalogue la dépasse, la troncature est JOURNALISÉE
// plutôt que découverte par une écriture qui échoue en silence.
export const MAX_OFFRES = 600;

// Plus large que la concurrence du collecteur en ligne : un cron n'a pas
// d'utilisateur qui attend, et 8 boards en parallèle ramènent la collecte sous
// les 8 secondes.
const CONCURRENCE_CRON = 8;

export default async function handler(req) {
  // Vercel injecte `Authorization: Bearer <CRON_SECRET>` sur les appels
  // programmés. Sans ce garde, n'importe qui pourrait déclencher 28 requêtes
  // sortantes à volonté.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const journal = [];
  const debut = Date.now();
  const toutes = await collecterGreenhouse(BOARDS, { journal, concurrence: CONCURRENCE_CRON });

  // On ne garde que la France. Ce n'est pas une économie de place, c'est une
  // question de ce qu'on sait servir : emploia est un site d'emploi français,
  // et une offre dont le pays n'a pas pu être ÉTABLI (`country: null`, 2 813
  // offres sur 6 484 au relevé) n'est pas une offre française qu'on aurait
  // ratée — c'est un lieu qu'on n'a pas su lire. La stocker pour la servir
  // « au cas où » reviendrait à la présenter comme française.
  const francaises = toutes.filter(o => o.country === 'FR');
  const retenues = francaises.slice(0, MAX_OFFRES);
  if (francaises.length > MAX_OFFRES) {
    console.error(`collect-greenhouse: ${francaises.length} offres FR pour une borne à ${MAX_OFFRES} — ${francaises.length - MAX_OFFRES} écartée(s). Le catalogue a dépassé ce qu'une seule clé KV peut porter : découper par clé.`);
  }

  // Les échecs de boards ne font pas échouer la collecte — c'est la garantie
  // du collecteur — mais ils ne partent pas qu'en journal d'exécution, dont la
  // rétention est courte. Ils entrent dans la valeur stockée, donc ils
  // survivent jusqu'à la collecte suivante et restent lisibles.
  const valeur = {
    collecteLe: new Date().toISOString(),
    boards: BOARDS.length,
    boardsEnEchec: journal.map(e => ({ board: e.source.replace('Greenhouse/', ''), cause: e.cause })),
    offres: retenues,
  };

  // Une collecte VIDE n'écrase pas la précédente. Si les 28 boards échouent en
  // même temps — panne réseau de la fonction, Greenhouse indisponible — écrire
  // `offres: []` remplacerait un relevé valide par du vide, et la page
  // afficherait zéro offre Greenhouse en répondant 200. On laisse l'ancienne
  // valeur vivre sur son TTL : elle est périmée mais vraie, et si la panne
  // dure elle expirera d'elle-même en déclarant la source morte.
  if (!retenues.length) {
    console.error(`collect-greenhouse: aucune offre FR collectée sur ${BOARDS.length} boards (${journal.length} en échec) — la clé précédente est laissée intacte.`);
    return new Response(JSON.stringify({
      ok: false, raison: 'collecte_vide', boards: BOARDS.length,
      boardsEnEchec: valeur.boardsEnEchec, ecrit: false,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  await kvSet(CLE_KV, valeur, TTL_SECONDES);

  const avecContrat = retenues.filter(o => o.type).length;
  return new Response(JSON.stringify({
    ok: true,
    ecrit: true,
    boards: BOARDS.length,
    boardsEnEchec: valeur.boardsEnEchec,
    offresCollectees: toutes.length,
    offresFrance: francaises.length,
    offresStockees: retenues.length,
    contratLu: avecContrat,
    dureeMs: Date.now() - debut,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
