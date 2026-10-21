// ── INGEST DES ATS CRAWLÉS EN DIRECT → UNE CLÉ KV PAR FOURNISSEUR ────────────
// Un seul cron pour tous les ATS. Il remplace `api/cron/collect-greenhouse`,
// dont il reprend les gardes mot pour mot, et il parcourt le registre de
// `_lib/ats.js` : Greenhouse, Lever, et demain Teamtailor sans qu'une ligne
// d'ici change.
//
// POURQUOI UN CRON ET PAS UN COLLECTEUR EN LIGNE DANS `api/jobs.js`. Mesuré :
// Greenhouse 10,1 s pour 28 boards, Lever 23,6 s pour 17 boards. Le handler
// borne CHAQUE source à 10 s (`withTimeout(…, 10000)`). Branchée dans le
// chemin de la requête, la collecte expirerait à tous les coups. La durée d'un
// crawl ATS est fonction du nombre d'entreprises ; celle d'une requête
// utilisateur ne peut pas l'être.
//
// POURQUOI LE RUNTIME NODE, ALORS QUE LES NEUF AUTRES CRONS SONT EN EDGE.
// C'est la seule déviation de ce fichier, et elle est MESURÉE, pas stylistique.
// Les deux collectes enchaînées font ~34 s, et une fonction en runtime Edge
// « must begin sending a response within 25 seconds ». Un cron Edge serait donc
// tué en pleine collecte Lever — et le pire est la forme de la panne : la clé
// `lever_jobs` ne serait JAMAIS écrite, la source lirait `collecte_absente` à
// perpétuité, et rien n'en nommerait la cause réelle. Exactement le silence que
// `causesEnEchec` est venu retirer. Le runtime Node plafonne à 300 s sur le
// plan Hobby, et `vercel.json` réserve 300 s à ce seul chemin : la marge est
// explicite, pour que l'ajout d'un troisième ATS ne la découvre pas par un 504.
//
// NOTE SUR LE PLAN HOBBY, et il faut la poser parce qu'elle a coûté un
// déploiement. Ce que Hobby interdit est la FRÉQUENCE : une exécution par jour
// au plus — `0 */6 * * *` a fait échouer le déploiement de la PR 99 sur les
// deux projets, avant même le build. Ce qu'il N'interdit PAS est le NOMBRE :
// 100 crons par projet, autant que Pro et Enterprise. Le dépôt en compte dix ;
// un onzième aurait été permis. Si ce cron est unique, c'est pour que les
// gardes ne soient écrits qu'une fois — pas pour économiser un créneau qui
// n'est pas rare.
//
// Le style du handler SUIT le runtime, et le garde n°8 de `scripts/ci-guards.mjs`
// l'a imposé : un handler en runtime Node qui appellerait l'API Web des
// requêtes et des réponses utiliserait des objets qui n'existent pas chez lui.
// Ce fichier est donc écrit au style Node — `(req, res)`,
// `req.headers['authorization']`, `res.status().json()` — comme `api/nps.js` et
// `api/share-score.js`, les deux autres handlers Node du dépôt.
//
// Ce garde a attrapé la faute avant le déploiement, et il l'a attrapée DEUX
// fois : la première dans le code, la seconde dans le commentaire qui
// l'expliquait, parce qu'il lit le fichier entier sans exempter les
// commentaires. C'est la bonne façon de le faire — un garde qui ignorerait les
// commentaires raterait du code mis en commentaire — donc c'est au commentaire
// de ne pas citer les motifs qu'il décrit.
export const config = { runtime: 'nodejs', regions: ['cdg1'] };

import { kvSet } from '../_lib/auth.js';
import { FOURNISSEURS, TTL_SECONDES, collecterFournisseur } from '../_lib/ats.js';

export default async function handler(req, res) {
  // Vercel injecte `Authorization: Bearer <CRON_SECRET>` sur les appels
  // programmés. Sans ce garde, n'importe qui pourrait déclencher les 45
  // requêtes sortantes du catalogue à volonté.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers['authorization'] !== `Bearer ${cronSecret}`) {
    return res.status(401).send('Unauthorized');
  }

  const debut = Date.now();
  const rapport = [];

  // Les fournisseurs l'un après l'autre, et non en parallèle : chacun ouvre
  // déjà `concurrence` connexions, et les paralléliser multiplierait la
  // mémoire de décodage JSON sans rien gagner — un cron n'a pas d'utilisateur
  // qui attend.
  for (const fournisseur of FOURNISSEURS) {
    let collecte;
    try {
      collecte = await collecterFournisseur(fournisseur);
    } catch (e) {
      // Un fournisseur qui explose ne doit pas emporter les autres : c'est la
      // même garantie que `collecterBoard` applique board par board, appliquée
      // ici fournisseur par fournisseur. Sans elle, une exception dans Lever
      // laisserait la clé de Greenhouse non écrite, et deux sources
      // mourraient pour le prix d'une.
      console.error(`collect-ats/${fournisseur.nom}: la collecte a échoué — ${e?.message || e}. La clé précédente est laissée intacte.`);
      rapport.push({ source: fournisseur.nom, ok: false, raison: 'collecte_interrompue', ecrit: false });
      continue;
    }

    // Une collecte VIDE n'écrase pas la précédente. Si tous les boards
    // échouent en même temps — panne réseau de la fonction, ATS indisponible —
    // écrire `offres: []` remplacerait un relevé valide par du vide, et la page
    // afficherait zéro offre en répondant 200. On laisse l'ancienne valeur
    // vivre sur son TTL : elle est périmée mais vraie, et si la panne dure elle
    // expirera d'elle-même en déclarant la source morte.
    if (!collecte.ecrire) {
      console.error(`collect-ats/${fournisseur.nom}: aucune offre FR collectée sur ${collecte.stats.boards} boards (${collecte.stats.boardsEnEchec} en échec) — la clé précédente est laissée intacte.`);
      rapport.push({
        source: fournisseur.nom, ok: false, raison: 'collecte_vide', ecrit: false,
        boards: collecte.stats.boards, boardsEnEchec: collecte.valeur.boardsEnEchec,
      });
      continue;
    }

    try {
      await kvSet(collecte.cle, collecte.valeur, TTL_SECONDES);
    } catch (e) {
      // Une écriture KV qui échoue est un échec RÉEL, et il ne doit pas se lire
      // comme une collecte réussie dans le rapport.
      console.error(`collect-ats/${fournisseur.nom}: écriture de ${collecte.cle} refusée — ${e?.message || e}`);
      rapport.push({ source: fournisseur.nom, ok: false, raison: 'ecriture_refusee', ecrit: false });
      continue;
    }

    rapport.push({
      source: fournisseur.nom, ok: true, ecrit: true, cle: collecte.cle,
      boardsEnEchec: collecte.valeur.boardsEnEchec, ...collecte.stats,
    });
  }

  // `ok` au niveau du cron veut dire « au moins un fournisseur a écrit ». Le
  // détail par fournisseur reste lisible dans `fournisseurs` : un succès global
  // ne masque pas une source morte, et c'est ce que le rapport doit permettre
  // de voir d'un coup d'œil.
  return res.status(200).json({
    ok: rapport.some(r => r.ok),
    fournisseurs: rapport,
    dureeMs: Date.now() - debut,
  });
}
