// ── DÉCOUVERTE DES BOARDS : UN NOM D'ENTREPRISE, LES CINQ ATS, UN VERDICT ────
//
// POURQUOI CET OUTIL. Le relevé Ashby (#110) a fait le compte des quatre
// premiers : 1 531 slugs devinés pour 24 entreprises nouvelles, et un
// rendement qui baisse (2,8 nouvelles pour 100 candidats chez Greenhouse, 1,2
// chez Ashby). Sa conclusion : « le goulot n'est pas le collecteur — c'est la
// DÉCOUVERTE des boards ». Chaque relevé a écrit sa propre sonde
// (`scripts/<ats>/verifier-boards.mjs`) contre sa propre liste de 400 noms, et
// aucune ne répond à la question qu'on se pose vraiment : « cette entreprise
// recrute-t-elle en France sur un ATS qu'emploia sait lire ? ».
//
// CE QU'IL FAIT. Pour chaque nom, il essaie quelques slugs plausibles sur les
// cinq ATS du registre `FOURNISSEURS` de `api/_lib/ats.js` — et il passe par
// le VRAI collecteur de chacun, pas par une copie de sa requête. Les offres
// sont donc normalisées et localisées exactement comme le cron le fera : le
// pays retenu est celui que `collect-ats` retiendra, et un ATS ajouté au
// registre est essayé ici sans une ligne de plus.
//
// LA RÈGLE DE LECTURE, héritée du relevé Teamtailor : un board se constate à
// ce qu'il PORTE, jamais à son code HTTP. SmartRecruiters répond 200 avec zéro
// offre à n'importe quel slug, `zzz-entreprise-inexistante-xyz` compris. Le
// verdict `vide` ne prouve donc pas qu'un board existe ; seul `fr` (ou
// `etranger`) le prouve.
//
//   fr          le board porte des offres localisées en France → candidat
//   etranger    il porte des offres, aucune en France → inutile à emploia
//   vide        réponse lisible, zéro offre — board vide OU slug inconnu
//   absent      refus (http_404…) ou réponse illisible
//
// USAGE — à lancer depuis un poste qui atteint les API des ATS :
//
//   npm run ats:decouvrir -- "Pennylane" "Back Market" "Qonto"
//   npm run ats:decouvrir -- "Groupe SEB=groupeseb,seb"   # slugs explicites
//
// Pour chaque entreprise trouvée en France et absente du catalogue, il
// imprime la ligne prête à coller dans `api/_lib/<ats>-boards.js`. Il n'écrit
// rien, n'envoie rien : lecture seule des API publiques des ATS.
import { FOURNISSEURS } from '../../api/_lib/ats.js';

// Mots qui changent le slug sans changer l'employeur. Retirés pour une
// variante supplémentaire, jamais à la place du nom complet.
const MOTS_JURIDIQUES = new Set(['groupe', 'group', 'sa', 'sas', 'sasu', 'france', 'inc', 'ltd', 'gmbh']);

function sansAccent(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// « Back Market » → backmarket, back-market ; « Groupe Barrière » → aussi
// barriere. Peu de variantes, et c'est voulu : chaque variante coûte un appel
// par ATS, et l'outil doit rester poli avec des API publiques sans clé.
export function slugsCandidats(nom) {
  const mots = sansAccent(nom).toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim().split(' ').filter(Boolean);
  if (!mots.length) return [];
  const utiles = mots.filter(m => !MOTS_JURIDIQUES.has(m));
  const variantes = [mots.join(''), mots.join('-')];
  if (utiles.length && utiles.length < mots.length) variantes.push(utiles.join(''), utiles.join('-'));
  return [...new Set(variantes)];
}

// « Nom=slug1,slug2 » : les slugs explicites remplacent les variantes.
export function lireArgument(arg) {
  const [nom, slugs] = String(arg).split('=');
  const explicites = (slugs || '').split(',').map(s => s.trim()).filter(Boolean);
  return { nom: nom.trim(), slugs: explicites.length ? explicites : slugsCandidats(nom) };
}

function verdict({ offres, fr, echec }) {
  if (fr > 0) return 'fr';
  if (offres > 0) return 'etranger';
  if (echec) return 'absent';
  return 'vide';
}

// Un nom, tous les ATS. Les ATS partent en parallèle (cinq hôtes différents),
// les slugs d'un même ATS l'un après l'autre, et on s'arrête au premier slug
// qui porte des offres : le suivant ne dirait rien de plus.
export async function decouvrir(nom, { slugs = slugsCandidats(nom), fetchImpl = fetch, fournisseurs = FOURNISSEURS } = {}) {
  const lignes = await Promise.all(fournisseurs.map(async (f) => {
    const essais = [];
    for (const slug of slugs) {
      const journal = [];
      const offres = await f.collecter([{ board: slug, company: nom }], { journal, fetchImpl, concurrence: 1 });
      const essai = {
        ats: f.nom,
        slug,
        offres: offres.length,
        fr: offres.filter(o => o.country === 'FR').length,
        echec: journal[0]?.cause || null,
        dejaAuCatalogue: f.boards.some(b => b.board === slug),
      };
      essai.verdict = verdict(essai);
      essais.push(essai);
      if (essai.offres > 0) break;
    }
    // Le meilleur essai de cet ATS : celui qui porte des offres s'il y en a
    // un, sinon le dernier — tous disent alors la même chose.
    return essais.find(e => e.offres > 0) || essais.at(-1);
  }));
  return { nom, slugs, lignes: lignes.filter(Boolean) };
}

// Un ATS « injoignable » n'a rien dit : ni absent, ni vide. Si AUCUN n'a
// répondu, le résultat entier est muet — réseau coupé, proxy, DNS — et le
// présenter comme « aucune entreprise trouvée » serait affirmer une absence
// qu'on n'a pas constatée.
const CAUSES_RESEAU = new Set(['erreur_reseau', 'timeout']);
export function injoignable(ligne) {
  return ligne.verdict === 'absent' && CAUSES_RESEAU.has(ligne.echec);
}

export function ligneDeCatalogue({ slug, fr }, nom) {
  return `{ board: '${slug}', company: '${nom.replace(/'/g, "\\'")}', offresFR: ${fr} },`;
}

// ── EN LIGNE DE COMMANDE ─────────────────────────────────────────────────────
const lanceDirectement = import.meta.url === `file://${process.argv[1]}`;
if (lanceDirectement) {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage : npm run ats:decouvrir -- "Entreprise" ["Autre=slug1,slug2" …]');
    process.exit(2);
  }
  const aAjouter = [];
  const toutes = [];
  for (const arg of args) {
    const { nom, slugs } = lireArgument(arg);
    const { lignes } = await decouvrir(nom, { slugs });
    toutes.push(...lignes);
    console.log(`\n── ${nom}  (slugs essayés : ${slugs.join(', ')})`);
    for (const l of lignes.sort((a, b) => b.fr - a.fr || b.offres - a.offres)) {
      const detail = l.verdict === 'absent' ? l.echec
        : l.verdict === 'vide' ? '0 offre (board vide ou slug inconnu)'
        : `${l.offres} offres dont ${l.fr} en France`;
      const marque = l.dejaAuCatalogue ? '  [déjà au catalogue]' : '';
      console.log(`  ${l.verdict.padEnd(9)} ${l.ats.padEnd(16)} ${l.slug.padEnd(22)} ${detail}${marque}`);
      if (l.verdict === 'fr' && !l.dejaAuCatalogue) aAjouter.push({ ...l, nom });
    }
  }
  const muettes = toutes.filter(injoignable).length;
  if (muettes === toutes.length) {
    console.error(`\n✗ Aucun ATS n'a répondu (${muettes} essais, tous en erreur réseau ou timeout) : ce résultat ne dit RIEN des entreprises. Relancer depuis un poste qui atteint les API des ATS.`);
    process.exit(1);
  }
  if (muettes) console.error(`\n⚠ ${muettes} essai(s) sur ${toutes.length} sans réponse réseau : leur « absent » n'est pas une absence constatée.`);
  if (aAjouter.length) {
    console.log('\n══ À AJOUTER AU CATALOGUE (après relecture) ══');
    for (const ats of [...new Set(aAjouter.map(a => a.ats))]) {
      console.log(`\n  api/_lib/${ats.toLowerCase()}-boards.js`);
      for (const a of aAjouter.filter(x => x.ats === ats)) console.log(`    ${ligneDeCatalogue(a, a.nom)}`);
    }
  } else {
    console.log('\nAucune entreprise nouvelle trouvée en France sur les ATS du registre.');
  }
}
