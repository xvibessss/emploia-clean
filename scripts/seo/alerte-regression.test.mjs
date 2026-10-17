// Sonde de l'alerte de régression SEO — scripts/seo/alerte-regression.cjs.
//
// Ce que cette sonde verrouille, et pourquoi elle existe. L'étape « Ouvrir une
// issue en cas d'échec » de .github/workflows/seo-regression.yml n'avait jamais
// tourné : sa condition est `failure() && github.event_name == 'schedule'`, et
// le workflow n'est pas déclenché par les pull requests — il audite la
// production. Le seul chemin qui l'exerçait était un cron de 06:00 UTC en
// échec. C'est exactement le chemin censé rattraper une panne silencieuse :
// tant qu'il restait inline dans le YAML, il pouvait être cassé depuis des mois
// sans que rien ne le dise.
//
// Elle est HORS LIGNE, sur le gabarit des autres sondes du job `guards` : elle
// importe le VRAI module — celui que le workflow appelle, pas une copie — et
// lui donne un faux client octokit qui enregistre les appels. Une copie de la
// logique resterait verte en divergeant du fichier réellement exécuté.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

// Le module est en CommonJS parce que le `require` injecté par github-script
// l'est, et que le dépôt est `"type": "module"`.
const require = createRequire(import.meta.url);
const alerter = require('./alerte-regression.cjs');

let passed = 0, failed = 0;
function check(label, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const context = {
  repo: { owner: 'xvibessss', repo: 'emploia-clean' },
  serverUrl: 'https://github.com',
  runId: 424242,
  eventName: 'schedule',
};

// Faux client : chaque méthode enregistre ses paramètres. `.endpoint()` imite
// la vraie — elle assemble la requête sans l'envoyer — pour que le mode
// répétition emprunte ici le même chemin que dans un job.
function faireClient(issuesOuvertes = []) {
  const appels = { listForRepo: [], create: [], createComment: [], endpoint: [] };
  const enregistrer = (nom, url) => {
    const f = async (p) => { appels[nom].push(p); return { data: { number: 7 } }; };
    f.endpoint = (p) => { appels.endpoint.push({ nom, p }); return { method: 'POST', url, body: p }; };
    return f;
  };
  return {
    appels,
    rest: {
      issues: {
        listForRepo: async (p) => { appels.listForRepo.push(p); return { data: issuesOuvertes }; },
        create: enregistrer('create', '/repos/{owner}/{repo}/issues'),
        createComment: enregistrer('createComment', '/repos/{owner}/{repo}/issues/{issue_number}/comments'),
      },
    },
  };
}

function faireCore() {
  const etat = { resume: '', ecrit: false };
  return {
    etat,
    summary: {
      addRaw(s) { etat.resume += s; return this; },
      async write() { etat.ecrit = true; return this; },
    },
  };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alerte-seo-'));
const rapport = path.join(tmp, 'seo-report.txt');
fs.writeFileSync(rapport, 'FAIL /legal — aucun h1\nFAIL /ecoles — canonical absent\n');

// ── 1. Aucune issue ouverte → on en crée une ───────────────────────────────
console.log('\n[1] aucune issue ouverte → création');
{
  const github = faireClient([]);
  const r = await alerter({ github, context, cheminRapport: rapport });

  check('une issue est créée', github.appels.create.length === 1);
  check('aucun commentaire n’est posté', github.appels.createComment.length === 0);
  check('les issues ouvertes sont cherchées sur la bonne étiquette',
    github.appels.listForRepo[0]?.labels === alerter.ETIQUETTE
    && github.appels.listForRepo[0]?.state === 'open');

  const issue = github.appels.create[0] || {};
  check('le titre est daté du jour',
    issue.title === alerter.construireTitre(), issue.title);
  check('l’étiquette seo-regression est posée',
    Array.isArray(issue.labels) && issue.labels.includes(alerter.ETIQUETTE));
  check('le corps porte le rapport', (issue.body || '').includes('FAIL /legal — aucun h1'));
  check('le corps porte le lien du job',
    (issue.body || '').includes(`/actions/runs/${context.runId}`));
  check('le dépôt visé est celui du contexte',
    issue.owner === context.repo.owner && issue.repo === context.repo.repo);
  check('la valeur de retour nomme l’action', r.action === 'create');
}

// ── 2. Une issue déjà ouverte → on la commente, on n'en empile pas ─────────
// La raison d'être du dédoublonnage : sans lui, un mois de cron en échec
// laisse trente issues identiques, et plus personne n'en ouvre aucune.
console.log('\n[2] une issue ouverte → commentaire, pas d’empilement');
{
  const github = faireClient([{ number: 512 }, { number: 513 }]);
  const r = await alerter({ github, context, cheminRapport: rapport });

  check('aucune issue n’est créée', github.appels.create.length === 0);
  check('un commentaire est posté', github.appels.createComment.length === 1);
  check('il va sur l’issue ouverte la plus ancienne retournée',
    github.appels.createComment[0]?.issue_number === 512);
  check('le commentaire porte le rapport',
    (github.appels.createComment[0]?.body || '').includes('FAIL /ecoles'));
  check('la valeur de retour nomme l’action', r.action === 'createComment');
}

// ── 3. Mode répétition → tout le parcours, aucune écriture ─────────────────
console.log('\n[3] répétition → le parcours entier sans rien publier');
{
  const github = faireClient([]);
  const core = faireCore();
  const r = await alerter({ github, context, core, repetition: true, cheminRapport: rapport });

  check('aucune issue n’est créée', github.appels.create.length === 0);
  check('aucun commentaire n’est posté', github.appels.createComment.length === 0);
  check('les issues ouvertes sont tout de même inventoriées',
    github.appels.listForRepo.length === 1);
  check('la requête est assemblée par .endpoint()',
    github.appels.endpoint.length === 1 && github.appels.endpoint[0].nom === 'create');
  check('.endpoint() reçoit les paramètres réels de l’appel',
    github.appels.endpoint[0].p.labels?.includes(alerter.ETIQUETTE));
  check('le résumé du job est écrit', core.etat.ecrit === true);
  check('le résumé dit que rien n’a été publié',
    core.etat.resume.includes("Rien n'a été publié"));
  check('le résumé montre la route retenue',
    core.etat.resume.includes('/repos/{owner}/{repo}/issues'));
  check('le résumé montre le corps qui serait publié',
    core.etat.resume.includes('FAIL /legal — aucun h1'));
  check('la valeur de retour nomme la répétition',
    r.action === 'repetition' && r.nomAppel === 'create');
}

// ── 4. Répétition avec une issue ouverte → c'est la route commentaire ──────
// La répétition doit suivre la branche que l'alerte réelle suivrait, sinon
// elle n'exerce que la moitié du code.
console.log('\n[4] répétition avec une issue ouverte → route commentaire');
{
  const github = faireClient([{ number: 900 }]);
  const core = faireCore();
  const r = await alerter({ github, context, core, repetition: true, cheminRapport: rapport });

  check('aucune écriture',
    github.appels.create.length === 0 && github.appels.createComment.length === 0);
  check('la route assemblée est celle du commentaire',
    github.appels.endpoint[0]?.nom === 'createComment');
  check('elle vise l’issue ouverte', github.appels.endpoint[0]?.p.issue_number === 900);
  check('la valeur de retour le dit', r.nomAppel === 'createComment');
}

// ── 5. Le défaut de ce code est d'alerter, jamais de se taire ──────────────
// Le piège de la testabilité : une valeur de répétition vague rendrait
// l'étape muette un matin d'échec planifié. Seul le booléen exact suspend.
console.log('\n[5] une valeur de répétition vague ne fait pas taire l’alerte');
for (const valeur of [undefined, false, '', 'false', 'true', 1, null]) {
  const github = faireClient([]);
  const core = faireCore();
  await alerter({ github, context, core, repetition: valeur, cheminRapport: rapport });
  check(`repetition=${JSON.stringify(valeur)} → l’issue est bien créée`,
    github.appels.create.length === 1);
}

// ── 6. Rapport introuvable → l'alerte part quand même ──────────────────────
// Le défaut que ce cas verrouille : le script inline lisait le rapport avec un
// `readFileSync` nu. Si l'audit échouait AVANT de l'écrire — `checkout` ou
// `setup-node` en échec —, `failure()` était vrai, l'étape partait, la lecture
// levait, et aucune issue n'était ouverte. La panne la plus brutale était la
// seule à n'alerter personne.
console.log('\n[6] rapport introuvable → l’alerte part quand même');
{
  const github = faireClient([]);
  const absent = path.join(tmp, 'ce-fichier-n-existe-pas.txt');
  await alerter({ github, context, cheminRapport: absent });

  check('une issue est tout de même créée', github.appels.create.length === 1);
  const body = github.appels.create[0]?.body || '';
  check('le corps dit que le rapport est introuvable', body.includes('rapport introuvable'));
  check('le corps renvoie vers le job pour la cause', body.includes('/actions/runs/'));
}

// ── 7. Rapport géant → tronqué sous la limite de GitHub ────────────────────
// Un corps d'issue est refusé au-delà de 65 536 caractères : sans troncature,
// l'alerte la plus grave — celle au rapport le plus long — serait la seule
// rejetée par l'API.
console.log('\n[7] rapport géant → tronqué sous la limite de GitHub');
{
  const github = faireClient([]);
  const enorme = path.join(tmp, 'enorme.txt');
  fs.writeFileSync(enorme, 'x'.repeat(200000));
  await alerter({ github, context, cheminRapport: enorme });

  const body = github.appels.create[0]?.body || '';
  const bloc = 'x'.repeat(alerter.TAILLE_MAX_RAPPORT);
  check('le rapport est tronqué à la taille annoncée',
    body.includes(bloc) && !body.includes(bloc + 'x'));
  check('le corps reste sous la limite de 65 536 caractères', body.length < 65536,
    `${body.length} caractères`);
}

fs.rmSync(tmp, { recursive: true, force: true });

if (failed) { console.error(`\n❌ sonde de l’alerte SEO : ${failed} échec(s)\n`); process.exit(1); }
console.log(`\n✅ sonde de l’alerte SEO : ${passed} vérifications OK\n`);
