// Les aiguilles de contenu que la production doit servir, route par route.
//
// Cette table est isolée du corps de la sonde parce qu'elle a deux lecteurs :
//   • scripts/smoke/prod.mjs        la vérifie contre le site déployé ;
//   • scripts/smoke/assertions.test.mjs la vérifie hors ligne, en CI, contre
//     les fichiers du dépôt.
//
// C'est la seule copie de ces montants côté sonde. La recopier ailleurs
// rouvrirait la panne que la garde existe pour fermer : un prix changé dans un
// .html sans l'être ici resterait invisible jusqu'au prochain `smoke:prod`,
// où il ressemblerait à une régression de prod alors que c'est la sonde qui
// serait fausse.
//
// Ajouter une route ne demande que son chemin servi et ses aiguilles : la
// garde résout seule le fichier correspondant via les rewrites de vercel.json.

// Normalise les espaces insécables et fines que le HTML glisse dans les prix,
// sinon « 59 € » rendu avec une fine ne correspond jamais à « 59 € » tapé ici.
// U+00A0 insécable, U+202F insécable étroite, U+2009 fine.
export function norm(s) { return s.replace(/[   ]/g, ' '); }

export const PAGE_ASSERTIONS = [
  {
    title: '[A] Landing — la grille servie est bien la nouvelle',
    route: '/',
    // La carte « Écoles & RH » ne porte plus de montant : elle renvoie au devis,
    // comme legal.html, et le barème vit sur /ecoles seule. L'aiguille est donc
    // la formulation et non un prix. « Sur devis » ne ferait pas l'affaire : le
    // tableau comparatif de la même page le contient déjà pour cette colonne,
    // donc il resterait présent même si la carte reprenait un chiffre.
    must: ['59€', '24€', 'Pack Campagne', 'Tarification par siège'],
    // Anciens montants et preuves sociales fabriquées : leur présence signifie
    // que la prod sert encore une version antérieure à la PR #28.
    //
    // Les trois derniers sont la grille écoles d'avant 451847a, restée sur la
    // carte « Écoles & RH » de la landing parce qu'aucune aiguille ne la
    // couvrait : la landing annonçait 9€ le siège quand /ecoles en demandait 22.
    // Ils portent leur contexte, pas leur seul montant — « 9€ » nu est un
    // sous-mot de « 59€ », légitime sur cette même page.
    mustNot: ['45€', '19€', '24 800', '1 240 avis', '14 200',
              '/étudiant/an', '6€ au-delà', '39€/candidat'],
  },
  {
    title: '[B] Page écoles',
    route: '/ecoles',
    // Le barème est par tranches : les trois taux et le forfait plateforme
    // figurent tous dans la page servie, et c'est leur ensemble qui identifie la
    // grille. Un seul taux ne distinguerait pas la grille actuelle d'une grille
    // à moitié mise à jour.
    must: ['22 €', '17 €', '12 €', '2 500 €', '40 000', 'pilote'],
    // Prix au siège d'avant le barème par tranches, retiré le 2026-10-06 par
    // 451847a : sa présence signifie que la prod sert encore la grille à 9 €.
    // La chaîne porte son unité, parce que « 9 € » seul se retrouve dans tout
    // montant en 9 — « 19 € », « 39 € » — et sonnerait faux au premier
    // changement de tarif.
    mustNot: ['9 € par siège', '9 € par étudiant'],
  },
  {
    title: '[B bis] Conformité — identité du vendeur et conditions de vente',
    route: '/legal',
    // Le SIREN est l'élément qu'un service comptable d'école vérifie en premier,
    // et la franchise en base explique l'absence de TVA sur la facture.
    must: ['928 482 553', 'Entrepreneur individuel', '293 B', 'Conditions générales de vente', 'L221-28'],
    // Formes sociales et grilles périmées qui ne doivent pas réapparaître.
    mustNot: ['EmploiA SAS', 'édité à titre personnel', 'Pro / Intensif'],
  },
];
