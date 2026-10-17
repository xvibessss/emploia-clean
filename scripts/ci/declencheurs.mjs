// Lecture des déclencheurs d'un workflow GitHub Actions, sans parseur YAML.
//
// Le dépôt n'a aucune dépendance de parsing YAML, et le garde [15] travaille
// déjà au regex sur le texte des workflows. Même approche ici, avec une
// contrainte supplémentaire : la détection doit distinguer une CLÉ d'un
// commentaire qui la cite. `.github/workflows/ci.yml` explique justement, en
// commentaire, pourquoi il n'a plus de `branches:` sous `pull_request:` — un
// `grep branches:` lirait la documentation du correctif comme la panne qu'il
// surveille, et le garde naîtrait rouge.
//
// D'où une lecture consciente de l'indentation plutôt qu'une recherche à plat :
//   1. retirer les commentaires `#` (hors chaînes citées) ;
//   2. repérer la clé `on:` de premier niveau ;
//   3. y trouver les clés `pull_request:` / `pull_request_target:` ;
//   4. ne relever les `branches:` / `branches-ignore:` qu'imbriquées sous
//      elles. Un `branches:` sous `push:` est le cas légitime — c'est lui qui
//      évite de relancer les quatre jobs à chaque poussée de branche.
//
// Le module ne lit aucun fichier : il prend du texte et rend des constats.
// C'est ce qui permet à scripts/ci/declencheurs.test.mjs de l'éprouver sur des
// extraits construits à la main, y compris ceux qu'on ne veut pas commiter.

/** Clés de déclencheur dont le filtre `branches:` porte sur la branche CIBLE. */
const DECLENCHEURS_SURVEILLES = 'pull_request_target|pull_request';

/** Filtres de branche, par opposition à `types:`, `paths:` ou `tags:`. */
const FILTRE_DE_BRANCHE = /\b(branches-ignore|branches)\s*:/;

// Un `#` n'ouvre un commentaire YAML qu'en début de ligne ou précédé d'une
// espace, et jamais à l'intérieur d'une chaîne citée.
export function retirerCommentaire(ligne) {
  let citation = null;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (citation) { if (c === citation) citation = null; continue; }
    if (c === '"' || c === "'") { citation = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(ligne[i - 1]))) return ligne.slice(0, i);
  }
  return ligne;
}

/**
 * Déclencheurs `pull_request` / `pull_request_target` d'un workflow, et les
 * filtres de branche qui les restreignent.
 *
 * @param {string} texte contenu brut du .yml
 * @returns {{forme: 'absent'|'en-ligne'|'bloc', pullRequest: Array<{
 *   nom: string, ligne: number, filtres: Array<{cle: string, ligne: number}>
 * }>}}
 */
export function analyserDeclencheurs(texte) {
  const lignes = String(texte).split('\n').map((brut, i) => {
    const code = retirerCommentaire(brut);
    return {
      n: i + 1,
      code,
      vide: code.trim() === '',
      indent: code.length - code.trimStart().length,
    };
  });

  // `on` est parfois cité — YAML 1.1 en fait un booléen, et certains dépôts
  // écrivent `"on":` pour couper court aux linters qui s'en émeuvent.
  const CLE_ON = /^(?:["']?on["']?)\s*:(.*)$/;
  const iOn = lignes.findIndex((l) => !l.vide && l.indent === 0 && CLE_ON.test(l.code));
  if (iOn === -1) return { forme: 'absent', pullRequest: [] };

  const reste = lignes[iOn].code.match(CLE_ON)[1].trim();

  // Forme en ligne : `on: push`, `on: [push, pull_request]`, et la forme
  // exotique `on: {pull_request: {branches: [main]}}`. Seule la dernière peut
  // porter un filtre, et on ne la relève que si l'accolade qui suit le
  // déclencheur en contient un — sinon `{push: {branches: [main]}}` ferait
  // accuser le `pull_request` d'à côté.
  if (reste) {
    const pullRequest = [];
    const motif = new RegExp(`(${DECLENCHEURS_SURVEILLES})\\s*(?::\\s*\\{([^}]*)\\})?`, 'g');
    for (const m of reste.matchAll(motif)) {
      const corps = m[2] || '';
      const f = corps.match(FILTRE_DE_BRANCHE);
      pullRequest.push({
        nom: m[1],
        ligne: lignes[iOn].n,
        filtres: f ? [{ cle: f[1], ligne: lignes[iOn].n }] : [],
      });
    }
    return { forme: 'en-ligne', pullRequest };
  }

  // Forme en bloc : tout ce qui suit `on:` en étant plus indenté, jusqu'à la
  // prochaine clé de premier niveau. Les lignes vides — et les commentaires,
  // devenus vides à l'étape 1 — ne ferment pas le bloc.
  const bloc = [];
  for (let i = iOn + 1; i < lignes.length; i++) {
    if (lignes[i].vide) continue;
    if (lignes[i].indent === 0) break;
    bloc.push(lignes[i]);
  }
  if (!bloc.length) return { forme: 'bloc', pullRequest: [] };

  const base = bloc[0].indent;
  const CLE_DECLENCHEUR = new RegExp(`^\\s*(${DECLENCHEURS_SURVEILLES})\\s*:(.*)$`);
  const ITEM_DECLENCHEUR = new RegExp(`^\\s*-\\s*(${DECLENCHEURS_SURVEILLES})\\s*$`);

  const pullRequest = [];
  for (let i = 0; i < bloc.length; i++) {
    const l = bloc[i];
    if (l.indent !== base) continue;

    // `on:\n  - push\n  - pull_request` : une séquence ne porte pas de filtre.
    const item = l.code.match(ITEM_DECLENCHEUR);
    if (item) { pullRequest.push({ nom: item[1], ligne: l.n, filtres: [] }); continue; }

    const m = l.code.match(CLE_DECLENCHEUR);
    if (!m) continue;

    const filtres = [];
    const enLigne = m[2].match(FILTRE_DE_BRANCHE);
    if (enLigne) filtres.push({ cle: enLigne[1], ligne: l.n });
    // Le sous-bloc du déclencheur : plus indenté que lui, jusqu'à la prochaine
    // clé de même niveau. C'est là, et nulle part ailleurs, qu'un `branches:`
    // le restreint.
    for (let j = i + 1; j < bloc.length && bloc[j].indent > base; j++) {
      const f = bloc[j].code.match(new RegExp(`^\\s*(branches-ignore|branches)\\s*:`));
      if (f) filtres.push({ cle: f[1], ligne: bloc[j].n });
    }
    pullRequest.push({ nom: m[1], ligne: l.n, filtres });
  }
  return { forme: 'bloc', pullRequest };
}

/** Constats plats, prêts à être transformés en `fail()`. */
export function filtresDeBranches(texte) {
  return analyserDeclencheurs(texte).pullRequest.flatMap((d) =>
    d.filtres.map((f) => ({ declencheur: d.nom, cle: f.cle, ligne: f.ligne })));
}

/** Vrai si le workflow se déclenche sur les pull requests, filtré ou non. */
export function aDeclencheurPullRequest(texte) {
  return analyserDeclencheurs(texte).pullRequest.length > 0;
}
