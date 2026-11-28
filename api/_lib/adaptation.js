// Adaptation guidée du CV (/adapter) : prompt et, surtout, VALIDATION des
// suggestions de l'IA. Pure, testée par scripts/smoke/adaptation.test.mjs.
//
// La règle d'honnêteté n'est pas laissée au prompt seul. Une suggestion n'est
// montrée que si le serveur peut vérifier qu'elle reformule le CV :
//   · `avant` est un extrait RÉEL du CV (on remplace ce qui existe) ;
//   · `apres` ne cite aucune compétence du lexique absente du CV ;
//   · `apres` ne contient aucun nombre absent du CV.
// Les compétences de l'offre que le CV n'a pas deviennent des QUESTIONS : rien
// n'est ajouté sans un « oui » du candidat.

import { ANTI_EMBELLISSEMENT } from './prompts-candidature.js';
import { COMPETENCES, competencesDe, normaliser } from './competences.js';

export const MAX_SUGGESTIONS = 8;
export const MAX_QUESTIONS = 6;
export const SECTIONS = ['Titre', 'Profil', 'Expérience', 'Compétences', 'Formation', 'Autre'];

export const SYSTEME = `Tu es un recruteur senior français qui aide un candidat à adapter SON CV à UNE offre. Tu ne réécris pas le CV : tu proposes des modifications ciblées, une par une, que le candidat accepte ou refuse.

RÈGLE D'HONNÊTETÉ ABSOLUE : tu reformules uniquement ce que le CV dit déjà. Tu n'ajoutes aucune compétence, aucun outil, aucun logiciel, aucune langue, aucun chiffre, aucun employeur, aucun diplôme ni aucune mission qui ne figure pas dans le CV. Une exigence de l'offre que le CV ne couvre pas ne fait PAS l'objet d'une suggestion : le candidat sera interrogé à part.

${ANTI_EMBELLISSEMENT}

Ce qui rend une suggestion utile :
- reprendre l'orthographe EXACTE de l'offre pour une compétence que le CV cite autrement (« Google Analytics » si le CV dit « GA ») ;
- un titre de profil qui reprend l'intitulé de l'offre, quand le parcours le justifie ;
- un résumé recentré sur ce que l'offre demande, avec les faits du CV ;
- une ligne d'expérience reformulée avec un verbe d'action et les mots de l'offre, sans changer les faits.

FORMAT — réponds UNIQUEMENT par un objet JSON, sans texte autour :
{"intro":"1 à 2 phrases, en tutoyant, qui disent par quoi on commence et pourquoi",
 "suggestions":[{"section":"Titre|Profil|Expérience|Compétences|Formation|Autre",
   "avant":"extrait COPIÉ À L'IDENTIQUE du CV, caractère pour caractère, 300 caractères au plus",
   "apres":"la version proposée",
   "pourquoi":"une phrase, en tutoyant, qui cite ce que l'offre demande"}]}
Au plus ${MAX_SUGGESTIONS} suggestions, de la plus utile à la moins utile. Si le CV est déjà bien aligné, renvoie moins de suggestions plutôt que des retouches inutiles.`;

export function messageUtilisateur(cv, offre) {
  return `OFFRE :\n${offre}\n\nCV DU CANDIDAT :\n${cv}\n\nPropose tes modifications au format JSON demandé.`;
}

const espaces = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const nombres = (s) => new Set((String(s).match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.')));

/** Lit la réponse de l'IA : l'objet JSON, même entouré de texte ou de ```. */
export function lireReponse(texte) {
  const t = String(texte || '');
  for (const essai of [t, (t.match(/\{[\s\S]*\}/) || [''])[0]]) {
    try { const o = JSON.parse(essai); if (o && typeof o === 'object') return o; } catch { /* suivant */ }
  }
  return null;
}

/**
 * Garde les suggestions vérifiables, écarte les autres. Rend aussi le motif
 * de chaque rejet : c'est ce que la sonde vérifie.
 */
export function validerSuggestions(brutes, cv) {
  const cvEsp = espaces(cv);
  const cvComp = new Set(competencesDe(cv, 200));
  const cvNombres = nombres(cv);
  const gardees = [];
  const ecartees = [];
  const vus = new Set();
  for (const s of Array.isArray(brutes) ? brutes : []) {
    const avant = String(s?.avant ?? '').slice(0, 400);
    const apres = String(s?.apres ?? '').trim().slice(0, 900);
    const section = SECTIONS.includes(s?.section) ? s.section : 'Autre';
    const pourquoi = String(s?.pourquoi ?? '').trim().slice(0, 300);
    const rejet = (motif) => ecartees.push({ motif, avant: avant.slice(0, 80), apres: apres.slice(0, 80) });
    if (!apres) { rejet('vide'); continue; }
    if (avant.trim() && !cvEsp.includes(espaces(avant))) { rejet('avant_absent_du_cv'); continue; }
    if (espaces(avant) === espaces(apres)) { rejet('identique'); continue; }
    const nouvelles = competencesDe(apres, 200).filter((id) => !cvComp.has(id));
    if (nouvelles.length) { rejet('competence_inventee:' + nouvelles.join(',')); continue; }
    const chiffres = [...nombres(apres)].filter((n) => !cvNombres.has(n));
    if (chiffres.length) { rejet('chiffre_invente:' + chiffres.join(',')); continue; }
    const cle = espaces(avant).toLowerCase();
    if (cle && vus.has(cle)) { rejet('doublon'); continue; }
    if (cle) vus.add(cle);
    gardees.push({ section, avant: avant.trim(), apres, pourquoi });
    if (gardees.length >= MAX_SUGGESTIONS) break;
  }
  return { gardees, ecartees };
}

/** Compétences de l'offre absentes du CV : on les demande, on ne les écrit pas. */
export function questionsPour(offre, cv) {
  const cvComp = new Set(competencesDe(cv, 200));
  return competencesDe(offre, 40).filter((id) => !cvComp.has(id)).slice(0, MAX_QUESTIONS);
}

/** Les motifs des compétences de l'offre, pour recalculer le score côté page. */
export function motifsOffre(offre) {
  const ids = new Set(competencesDe(offre, 40));
  return COMPETENCES.filter((c) => ids.has(c.id)).map((c) => ({ id: c.id, nom: c.nom, re: c.re.source }));
}

/** Score de couverture : part des compétences de l'offre que le CV cite. */
export function score(offre, cv) {
  const demandees = competencesDe(offre, 40);
  if (!demandees.length) return null;
  const t = normaliser(cv);
  const couvertes = COMPETENCES.filter((c) => demandees.includes(c.id) && c.re.test(t)).length;
  return Math.round((100 * couvertes) / demandees.length);
}
