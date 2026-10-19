/* ═══════════════════════════════════════════════════════════════════
   EmploiA — corps de l'alerte de régression SEO.

   Pourquoi ce fichier existe. Cette logique vivait dans le `script:` de
   l'étape « Ouvrir une issue en cas d'échec » de
   .github/workflows/seo-regression.yml. Gardée par
   `failure() && github.event_name == 'schedule'`, elle n'avait jamais tourné
   une seule fois : le workflow audite la PRODUCTION, donc il ne tourne pas
   sur les pull requests ; un workflow_dispatch réussi ne satisfait pas
   `failure()` ; un workflow_dispatch en échec n'est pas un `schedule`. Le
   seul chemin qui l'exerçait était un cron de 06:00 UTC en échec.

   C'est gênant parce que c'est le chemin censé rattraper une panne
   silencieuse. Une régression SEO ne se voit pas, et un job rouge dans un
   onglet que personne n'ouvre ne sert à rien — l'issue, elle, arrive par
   email. Si ce code était cassé, la garde contre la panne était elle-même en
   panne, sans que rien ne le signale.

   Sorti du YAML, il s'exerce de deux façons :
   — hors ligne, à chaque PR, par scripts/seo/alerte-regression.test.mjs, qui
     l'appelle avec un faux client et vérifie les deux branches ;
   — pour de vrai dans un job GitHub Actions, par le mode RÉPÉTITION, armé par
     l'entrée `repetition_alerte` du workflow_dispatch. Il fait tout le
     parcours — lecture du rapport, inventaire des issues ouvertes, choix de
     la branche, assemblage de la requête par `.endpoint()` — et publie le
     résultat dans le résumé du job, sans jamais appeler l'API d'écriture.

   Le garde-fou ne s'affaiblit pas en devenant testable : `repetition` est un
   PARAMÈTRE, jamais lu depuis l'environnement. Seule l'étape de répétition le
   passe, en dur, à `true`. L'étape réelle ne le mentionne pas et sa condition
   est inchangée — aucune entrée de workflow ne peut la faire basculer en
   répétition et la rendre muette un matin d'échec planifié.

   CommonJS (.cjs) : le dépôt est `"type": "module"`, et le `require` que
   github-script injecte dans le script est celui de CommonJS.
═══════════════════════════════════════════════════════════════════ */
const fs = require('node:fs');

const ETIQUETTE = 'seo-regression';
const RAPPORT_PAR_DEFAUT = '/tmp/seo-report.txt';
// GitHub refuse un corps d'issue au-delà de 65 536 caractères. On garde de la
// marge pour l'en-tête, les délimiteurs de bloc et le lien vers le job.
const TAILLE_MAX_RAPPORT = 60000;

// Lire le rapport ne doit jamais empêcher l'alerte de partir. Le script inline
// faisait un `readFileSync` nu : si l'audit échouait AVANT d'avoir écrit son
// rapport — un `checkout` ou un `setup-node` en échec suffit —, `failure()`
// était vrai, l'étape démarrait, la lecture levait, et aucune issue n'était
// ouverte. La panne la plus brutale était la seule à n'alerter personne.
// La sonde hors ligne couvre ce cas.
function lireRapport(chemin) {
  try {
    return fs.readFileSync(chemin, 'utf8');
  } catch (err) {
    return [
      `(rapport introuvable : ${chemin} — ${err.message})`,
      "L'audit a échoué avant d'avoir écrit son rapport : voir le job pour la cause.",
    ].join('\n');
  }
}

function construireTitre(maintenant = new Date()) {
  return `Régression SEO détectée — ${maintenant.toISOString().slice(0, 10)}`;
}

function construireCorps({ rapport, context }) {
  const { owner, repo } = context.repo;
  return [
    "L'audit quotidien a échoué. Rapport complet :",
    '',
    '```',
    rapport.slice(0, TAILLE_MAX_RAPPORT),
    '```',
    '',
    `[Voir le job](${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId})`,
  ].join('\n');
}

// Le résumé du job est le seul endroit où la répétition laisse une trace :
// elle ne crée rien, ne commente rien, n'écrit aucune étiquette.
async function publierRepetition({ core, nomAppel, requete, corps }) {
  const lignes = [
    '## Répétition de l’alerte de régression SEO',
    '',
    "**Rien n'a été publié.** Le parcours complet a tourné — lecture du rapport,",
    'inventaire des issues ouvertes, choix de la branche — puis la requête a été',
    'assemblée par `.endpoint()`, qui construit méthode, URL et corps **sans les',
    'envoyer**.',
    '',
    `Branche retenue : \`github.rest.issues.${nomAppel}\``,
    '',
    `\`\`\`\n${requete.method} ${requete.url}\n\`\`\``,
    '',
    "<details><summary>Corps de l’issue qui serait publiée</summary>",
    '',
    corps,
    '',
    '</details>',
  ].join('\n');

  console.log(`répétition — ${nomAppel} : ${requete.method} ${requete.url} (non envoyée)`);
  if (core && core.summary) await core.summary.addRaw(lignes).write();
  return lignes;
}

/**
 * Ouvre — ou commente — l'issue d'alerte de régression SEO.
 *
 * @param {object}  o
 * @param {object}  o.github         client octokit fourni par github-script
 * @param {object}  o.context        contexte du run
 * @param {object} [o.core]          utilitaires @actions/core (résumé du job)
 * @param {boolean} [o.repetition]   true = tout faire sauf envoyer la requête
 * @param {string}  [o.cheminRapport]
 * @returns {Promise<{action: string, nomAppel?: string, parametres?: object}>}
 */
module.exports = async function alerterRegressionSeo({
  github,
  context,
  core,
  repetition = false,
  cheminRapport = RAPPORT_PAR_DEFAUT,
}) {
  const { owner, repo } = context.repo;
  const rapport = lireRapport(cheminRapport);
  const corps = construireCorps({ rapport, context });

  const { data: ouvertes } = await github.rest.issues.listForRepo({
    owner,
    repo,
    state: 'open',
    labels: ETIQUETTE,
  });

  // Une seule issue ouverte à la fois : on commente la courante plutôt que
  // d'en empiler une par jour.
  const nomAppel = ouvertes.length > 0 ? 'createComment' : 'create';
  const parametres = ouvertes.length > 0
    ? { owner, repo, issue_number: ouvertes[0].number, body: corps }
    : { owner, repo, title: construireTitre(), body: corps, labels: [ETIQUETTE] };

  const appel = github.rest.issues[nomAppel];

  // `=== true` et non une valeur vague : si jamais ce paramètre venait un jour
  // d'ailleurs, seule la valeur booléenne exacte suspend la publication. Tout
  // le reste — `undefined`, `''`, la chaîne `'false'` — alerte pour de vrai.
  // Le défaut de ce code doit être d'alerter, jamais de se taire.
  if (repetition === true) {
    const requete = appel.endpoint(parametres);
    await publierRepetition({ core, nomAppel, requete, corps });
    return { action: 'repetition', nomAppel, parametres };
  }

  await appel(parametres);
  console.log(nomAppel === 'create'
    ? 'issue de régression SEO ouverte'
    : `issue #${ouvertes[0].number} commentée`);
  return { action: nomAppel, nomAppel, parametres };
};

module.exports.ETIQUETTE = ETIQUETTE;
module.exports.TAILLE_MAX_RAPPORT = TAILLE_MAX_RAPPORT;
module.exports.construireTitre = construireTitre;
