// ── LA BALISE DE PASSAGE DU CRON ATS ───────────────────────────────────────
//
// CE FICHIER N'IMPORTE RIEN, ET C'EST VOULU. `api/jobs.js` tourne en runtime
// Edge et doit lire la règle de la balise ; la lui faire prendre dans
// `_lib/ats.js` tirerait les deux collecteurs et les deux catalogues de boards
// dans le bundle de la route la plus chaude du site — 46 Ko de code de crawl
// embarqués pour appeler deux fonctions qui ne touchent pas au réseau. La
// balise vit donc à part, et `ats.js` vient la chercher ici.
//
// La règle d'ÉCRITURE et la règle de LECTURE sont dans le même fichier, pour
// que deux moitiés d'une même convention ne puissent pas diverger.

// Le TTL des clés d'OFFRES (`greenhouse_jobs`, `lever_jobs`). Il est déclaré
// ici plutôt que dans `ats.js` parce que la balise en dépend : une balise plus
// vieille que lui n'explique plus l'absence d'une clé d'offres. `ats.js` le
// réexporte sous son nom d'origine, donc une seule définition existe.
export const TTL_OFFRES_SECONDES = 72 * 3600;

// POURQUOI UNE CLÉ À PART, ET SURTOUT POURQUOI PAS LA MÊME QU'ICI.
//
// Le cron laisse intacte la clé d'un fournisseur dont la collecte ne ramène
// rien, et ce garde est BIEN placé : `greenhouse_jobs` et `lever_jobs` portent
// des centaines d'offres servies en ce moment. Les écraser avec `offres: []`
// sur une panne de crawl passagère ferait disparaître la source du site pour
// vingt-quatre heures — on n'aurait pas rendu une panne lisible, on en aurait
// créé une. C'est la dissymétrie avec le réservoir RapidAPI, où la même
// écriture à vide était inoffensive parce que `causeReservoir` refuse de
// servir une entrée sans offre.
//
// Mais laisser la clé intacte a un prix : il ne reste alors AUCUNE trace que le
// cron est passé. Au bout de 72 h la clé expire, et les deux histoires se
// confondent exactement comme JSearch les confondait avant la PR #105 :
//
//   le cron n'est jamais passé            → clé expirée → collecte_absente
//   il est passé trois nuits, crawl mort  → clé expirée → collecte_absente
//
// D'où la séparation : la BALISE (le cron est passé, voici ce qu'il a trouvé)
// s'écrit toujours ; la CHARGE (les offres) n'est remplacée que quand la
// collecte a produit quelque chose. Deux informations de durées de vie et de
// risques différents, donc deux clés.
//
// Elle ne porte AUCUNE offre — c'est ce qui la rend sans danger : la réécrire
// chaque nuit ne peut rien mettre hors ligne.
export const CLE_BALISE = 'ats_passage';

// Plus longue que le TTL des clés d'offres (72 h), et c'est la seule contrainte
// qui compte : la balise sert à EXPLIQUER l'absence d'une clé d'offres, donc
// elle doit lui survivre. Une balise qui expirerait la première ne saurait
// rien expliquer du tout.
export const TTL_BALISE_SECONDES = 14 * 24 * 3600;

// Le rapport du cron, réduit à ce qui tient dans une balise : un verdict par
// fournisseur, et aucune offre. `boardsEnEchec` arrive tantôt en tableau
// (depuis `valeur`) tantôt en nombre (depuis `stats`) selon le chemin — on le
// ramène à un nombre, parce que c'est tout ce qu'on en lira.
export function construireBalise(rapport, maintenant = new Date()) {
  const fournisseurs = {};
  for (const r of rapport || []) {
    fournisseurs[r.source] = {
      ok: !!r.ok,
      raison: r.ok ? 'ok' : (r.raison || 'inconnue'),
      offres: r.offresStockees ?? 0,
      boards: r.boards ?? 0,
      boardsEnEchec: Array.isArray(r.boardsEnEchec) ? r.boardsEnEchec.length : (r.boardsEnEchec ?? 0),
    };
  }
  return { passeLe: maintenant.toISOString(), fournisseurs };
}

// La règle de LECTURE vit à côté de la règle d'écriture, pour qu'elles ne
// divergent pas. `api/jobs.js` l'appelle quand une clé d'offres ne donne rien.
//
// Une balise plus vieille que le TTL des clés d'offres n'explique plus rien :
// si elle date de dix jours, le cron n'est pas passé depuis, et c'est ça
// l'information — pas ce qu'il avait trouvé la dernière fois.
export function causeDepuisBalise(balise, nom, maintenant = Date.now()) {
  const f = balise?.fournisseurs?.[nom];
  if (!f || !balise?.passeLe) return 'collecte_absente';
  const age = (maintenant - new Date(balise.passeLe).getTime()) / 1000;
  if (!Number.isFinite(age) || age > TTL_OFFRES_SECONDES) return 'collecte_absente';
  // Passé, et ce fournisseur a échoué : crawl vide, exception, ou écriture KV
  // refusée. Les trois appellent le même geste — aller voir le fournisseur ou
  // les journaux du cron — et le détail reste lisible dans `raison`, qu'un
  // cinquième jeton n'aurait fait que dupliquer.
  return f.ok ? 'collecte_absente' : 'collecte_en_echec';
}
