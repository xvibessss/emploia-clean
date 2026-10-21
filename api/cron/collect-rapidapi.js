// ── INGEST JSEARCH + FRENCH JOB MARKET → UNE CLÉ KV ─────────────────────────
//
// Même forme que `collect-greenhouse`, pour une raison différente. Greenhouse
// est passée au cron parce que sa collecte dure 10,1 s et ne tient pas dans la
// borne de 10 s par source du handler. Ces deux sources y passent parce que
// leur PLAFOND MENSUEL ne tient pas dans le trafic : 200 requêtes/mois pour
// JSearch, 30 pour French Job Market, quand un seul passage de crawler sur les
// 86 pages SEO en coûte 86. Le raisonnement complet et les mesures qui
// l'établissent sont dans `api/_lib/rapidapi.js`.
//
// Le résultat commun aux deux cas : le nombre d'appels sortants devient
// fonction du calendrier et non du trafic, donc borné à l'avance.
export const config = { runtime: 'edge', regions: ['cdg1'] };

import { kvGet, kvSet } from '../_lib/auth.js';
import {
  CLE_KV, BUDGETS, MAX_OFFRES_PAR_SOURCE, TTL_SECONDES, AGE_MAX_SECONDES,
  collecterJSearch, collecterFrenchMarket,
} from '../_lib/rapidapi.js';

// Réexportés : les sondes et les tests lisent ces bornes depuis le cron, mais
// elles sont DÉCLARÉES dans `_lib/rapidapi.js` parce que `api/jobs.js` les lit
// aussi — et un handler ne doit pas importer un cron pour connaître un TTL.
export { CLE_KV, TTL_SECONDES, AGE_MAX_SECONDES };

// Les crons Vercel tournent en UTC. `getUTCDay() === 1` est donc le lundi
// partout, sans dépendre du fuseau de la fonction.
const LUNDI = 1;

export function estJourDeCollecte(source, maintenant = new Date()) {
  if (source === 'jsearch') return true;
  // French Job Market : 30 requêtes/mois pour 31 jours. Le quotidien déborde
  // AVANT la fin du mois — ce n'est pas une marge serrée, c'est une
  // impossibilité arithmétique. L'hebdomadaire est le seul rythme que son plan
  // gratuit autorise.
  if (source === 'frenchmarket') return maintenant.getUTCDay() === LUNDI;
  return false;
}

// Une collecte vide n'écrase pas la précédente, par SOURCE. Le garde de
// `collect-greenhouse` porte sur une clé entière ; ici la clé porte deux
// sources dont une seule est collectée la plupart des jours, donc appliquer le
// garde globalement effacerait French Job Market six jours sur sept.
//
// `etat` est mis à jour même quand les offres sont conservées : c'est ce qui
// permet à `api/jobs.js` de dire `quota_epuise` plutôt que `collecte_absente`
// quand le réservoir finit par périmer. L'ancienne valeur est périmée mais
// vraie ; la RAISON de sa péremption, elle, doit être la plus récente.
export function fusionner(precedent, source, resultat) {
  const avant = precedent?.[source] || null;
  if (!resultat) return avant;

  const { etat, offres, appels } = resultat;
  if (!offres.length) {
    if (!avant) return { collecteLe: null, etat, appels, offres: [] };
    return { ...avant, etat, appels, conserveeDepuis: avant.collecteLe };
  }

  const retenues = offres.slice(0, MAX_OFFRES_PAR_SOURCE);
  if (offres.length > retenues.length) {
    console.error(`collect-rapidapi: ${source} a ramené ${offres.length} offres pour une borne à ${MAX_OFFRES_PAR_SOURCE} — ${offres.length - retenues.length} écartée(s).`);
  }
  return { collecteLe: new Date().toISOString(), etat, appels, offres: retenues };
}

export default async function handler(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const cle = process.env.RAPIDAPI_KEY;
  const journal = [];
  const debut = Date.now();
  const maintenant = new Date();

  // La valeur précédente est relue AVANT la collecte : c'est elle qui sera
  // conservée si une source rend zéro offre.
  const precedent = await kvGet(CLE_KV);

  const resultats = {};
  if (estJourDeCollecte('jsearch', maintenant)) {
    resultats.jsearch = await collecterJSearch({ cle, journal });
  }
  if (estJourDeCollecte('frenchmarket', maintenant)) {
    resultats.frenchmarket = await collecterFrenchMarket({ cle, journal });
  }

  const valeur = {
    collecteLe: maintenant.toISOString(),
    jsearch: fusionner(precedent, 'jsearch', resultats.jsearch),
    frenchmarket: fusionner(precedent, 'frenchmarket', resultats.frenchmarket),
  };

  const appels = Object.values(resultats).reduce((n, r) => n + (r?.appels || 0), 0);
  const offres = ['jsearch', 'frenchmarket'].reduce((n, s) => n + (valeur[s]?.offres?.length || 0), 0);

  // Rien du tout dans les deux sources, ni maintenant ni avant : écrire une clé
  // vide ferait apparaître un réservoir là où il n'y en a pas. On laisse
  // l'absence être une absence, et `collecte_absente` la dira.
  if (!offres) {
    console.error(`collect-rapidapi: aucune offre, ni collectée ni conservée (${appels} appel(s), journal: ${JSON.stringify(journal)}) — clé non écrite.`);
    return new Response(JSON.stringify({
      ok: false, raison: 'collecte_vide', appels, journal, ecrit: false,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (journal.length) console.error('collect-rapidapi: échecs — ' + JSON.stringify(journal));

  await kvSet(CLE_KV, valeur, TTL_SECONDES);

  return new Response(JSON.stringify({
    ok: true,
    ms: Date.now() - debut,
    appels,
    budgets: {
      jsearch: `${BUDGETS.jsearch.pagesParCollecte}/collecte, plafond ${BUDGETS.jsearch.plafondMensuel}/mois`,
      frenchmarket: `${BUDGETS.frenchmarket.pagesParCollecte}/collecte hebdomadaire, plafond ${BUDGETS.frenchmarket.plafondMensuel}/mois`,
    },
    sources: {
      jsearch: { etat: valeur.jsearch?.etat || 'non_collectee', offres: valeur.jsearch?.offres?.length || 0, collecteLe: valeur.jsearch?.collecteLe || null },
      frenchmarket: { etat: valeur.frenchmarket?.etat || 'non_collectee', offres: valeur.frenchmarket?.offres?.length || 0, collecteLe: valeur.frenchmarket?.collecteLe || null },
    },
    journal,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
