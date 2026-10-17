// Le barème Écoles, CFA et cabinets — déclaré une fois, ici.
//
// Pourquoi ce fichier existe
// ──────────────────────────
// Le 2026-10-06, le commit 451847a a remplacé le prix au siège par ce barème
// par tranches. Seul ecoles.html a suivi. Pendant neuf jours la landing a
// vendu le siège 9 €, et l'agent de support a chiffré 9 € / 6 € / 39 € à de
// vrais clients. Les correctifs qui ont suivi (PR 69, 71, 74, 79) ont chacun
// réparé une copie et posé un garde pour *cet* endroit-là. Aucun n'a supprimé
// la duplication : les montants restaient recopiés à la main dans quatre
// fichiers, et la prochaine divergence n'avait qu'à choisir un autre endroit.
//
// Ce module est cette suppression. Les montants ne sont plus écrits qu'ici ;
// scripts/pricing/bareme.test.mjs refuse toute PR où un fichier les cite
// autrement.
//
// Pourquoi une déclaration *et* un garde, plutôt qu'un simple import
// ────────────────────────────────────────────────────────────────────
// Le site est statique et n'a aucune étape de build (`buildCommand: echo ok`
// dans vercel.json), et le calculateur de ecoles.html est un <script> inline
// servi tel quel au navigateur. Un `import` depuis la page est donc impossible
// sans introduire un bundler ou une requête réseau sur le chemin critique —
// pour quatre endroits, le remède coûterait plus que le mal.
//
// La forme retenue est donc : ce module est la source, et le garde **extrait**
// les littéraux du calculateur réellement servi pour les confronter à elle.
// La page reste octet pour octet ce qu'elle était ; la liberté de diverger,
// elle, a disparu. C'est la technique que scripts/pricing/ecoles.test.mjs
// emploie déjà pour exécuter le calculateur servi au lieu d'une copie.
//
// Qui lit ce module
// ─────────────────
//   • scripts/pricing/bareme.test.mjs  le confronte aux quatre citants ;
//   • scripts/smoke/assertions.mjs     en dérive les aiguilles de la sonde.
//
// Changer un montant ici fait échouer la CI en nommant chaque fichier resté
// sur l'ancienne valeur. C'est le but : le barème ne bouge plus en silence.

// ── Le barème ───────────────────────────────────────────────────────────────
// Par tranches, et non par volume : chaque tranche de sièges est facturée à
// son propre taux, comme un barème d'impôt. Un taux unique appliqué à tout
// l'effectif selon le palier atteint rendait un effectif supérieur moins cher,
// ce qu'un acheteur repère immédiatement. Ne pas revenir à un taux unique —
// l'invariant de croissance est gardé par scripts/pricing/ecoles.test.mjs.
export const BAREME = Object.freeze({
  tranches: Object.freeze([
    Object.freeze({ jusqua: 500, prix: 22 }),
    Object.freeze({ jusqua: 1000, prix: 17 }),
    Object.freeze({ jusqua: Infinity, prix: 12 }),
  ]),
  // Forfait annuel unique, indépendant de l'effectif : SSO, tableau de bord,
  // personnalisation, cadrage, support nommé. Il ne s'applique qu'au modèle
  // par siège — un cabinet d'outplacement est déjà équipé.
  forfaitPlateforme: 2500,
  // Plancher de facturation, tous modèles confondus : en dessous, la mise en
  // place coûte plus que la recette.
  plancher: 3500,
  // Outplacement : deux modèles, linéaires tous les deux, sans forfait.
  outplacementUsage: 190,    // € par candidat effectivement accompagné
  outplacementLicence: 1500, // € par consultant et par an, candidats illimités
  // Seuil HT au-delà duquel une mise en concurrence formalisée est probable.
  seuilMiseEnConcurrence: 40000,
});

// Les effectifs dont le devis est *affiché* quelque part : tableau « Ce que
// cela donne » de /ecoles, JSON-LD, metas, prompt de l'agent de support. Leur
// total et leur coût moyen sont calculés ci-dessous, jamais recopiés — c'est
// cette colonne de moyennes qui avait divergé une première fois.
export const EXEMPLES_SIEGES = Object.freeze([400, 800, 2000]);
export const EXEMPLES_OUTPLACEMENT = Object.freeze([
  Object.freeze({ mode: 'usage', quantite: 60 }),
  Object.freeze({ mode: 'licence', quantite: 4 }),
]);

// ── Le calcul ───────────────────────────────────────────────────────────────

// Somme des tranches pour un effectif donné, hors forfait et hors plancher.
function coutDesSieges(effectif) {
  let total = 0;
  let depuis = 0;
  for (const tranche of BAREME.tranches) {
    const sieges = Math.min(effectif, tranche.jusqua) - depuis;
    if (sieges <= 0) break;
    total += sieges * tranche.prix;
    depuis = tranche.jusqua;
  }
  return total;
}

// Devis annuel pour un effectif de sièges, forfait et plancher compris.
export function devisSieges(effectif) {
  return Math.max(BAREME.plancher, coutDesSieges(effectif) + BAREME.forfaitPlateforme);
}

// Coût moyen par siège : le devis divisé par l'effectif, plancher compris.
// Un acheteur fait exactement cette division ; toute autre définition le
// ferait arriver à un autre nombre que celui qu'on affiche.
export function moyenneParSiege(effectif) {
  return devisSieges(effectif) / effectif;
}

// Devis annuel d'outplacement. Linéaire, sans forfait, mais le plancher
// s'applique aussi.
export function devisOutplacement(quantite, mode) {
  const taux = mode === 'licence' ? BAREME.outplacementLicence : BAREME.outplacementUsage;
  return Math.max(BAREME.plancher, quantite * taux);
}

// ── Les formes écrites ──────────────────────────────────────────────────────
// Les citations sont vérifiées après passage par norm() de
// scripts/smoke/assertions.mjs, qui ramène les espaces insécables et fines à
// l'espace ordinaire. Ces formateurs posent donc des espaces ordinaires : la
// comparaison reste juste quelle que soit l'espace qu'un rédacteur a tapée.

// « 2 500 € », « 22 € » — le groupe de milliers séparé par une espace.
export function euros(montant, decimales = 0) {
  return `${nombre(montant, decimales)} €`;
}

// « 22€ », « 190€ » — la forme serrée des cartes de la landing.
export function eurosSerres(montant, decimales = 0) {
  return `${nombre(montant, decimales)}€`;
}

// « 11 300 », « 28,25 » — sans unité, pour les citations qui la portent
// ailleurs (JSON-LD, seuil cité sans symbole).
export function nombre(montant, decimales = 0) {
  const [entier, fraction] = montant.toFixed(decimales).split('.');
  const groupe = entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fraction ? `${groupe},${fraction}` : groupe;
}

// Tous les montants que le barème autorise à figurer en face d'une unité
// (« par siège », « /candidat »). C'est la liste blanche du garde : elle est
// dérivée du barème, pas tenue à la main. Une liste des anciens prix ne
// dirait rien du prochain changement de grille.
export function montantsParUnite() {
  return new Set([
    ...BAREME.tranches.map((t) => t.prix),
    BAREME.outplacementUsage,
    BAREME.outplacementLicence,
    // Les coûts moyens des effectifs affichés : légitimes en face de « par
    // siège », et c'est bien une moyenne qu'on y lit, pas un taux de tranche.
    ...EXEMPLES_SIEGES.map((n) => moyenneParSiege(n)),
    ...EXEMPLES_OUTPLACEMENT.map((e) => devisOutplacement(e.quantite, e.mode) / e.quantite),
  ]);
}
