#!/usr/bin/env node
/**
 * Contrôle de rendu — ouvre les pages dans un vrai navigateur.
 *
 * Raison d'être, et elle est concrète : du 2026-05-26 au 2026-10-06, /legal a
 * servi un HTML parfaitement valide tout en affichant une page vide. Un script
 * de pied de page plantait sur un élément supprimé par une migration de thème,
 * avant d'appeler la fonction qui révèle les sections, masquées par défaut en
 * CSS. Cinq mois de mentions légales inaccessibles, invisibles en curl comme
 * en md5 — les octets étaient corrects, le rendu ne l'était pas.
 *
 * `seo-audit.mjs` vérifie ce que le serveur envoie. Ce script-ci vérifie ce
 * qu'un humain voit. Les deux sont nécessaires, aucun ne remplace l'autre.
 *
 * Le signal décisif est `pageerror` : une exception JS non capturée. C'est
 * elle, et elle seule, qui aurait attrapé la panne de /legal.
 *
 * Usage :
 *   node render-check.mjs [baseUrl] [--json]
 *
 * Dépendance : playwright. En CI, `npx playwright install --with-deps chromium`.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const DEFAULT_BASE_URL = 'https://emploia.eu';
const NAV_TIMEOUT_MS = 20_000;
const SETTLE_MS = 1_200;
const MIN_RENDERED_WORDS = 120;
const SHOTS_DIR = 'render-failures';

// Le contenu de plusieurs pages arrive en asynchrone : d'un passage à l'autre,
// /jobs a mesuré 261 puis 2448 mots. Une mesure sous le seuil est donc d'abord
// suspectée d'être prématurée, et refaite après une attente plus longue. Sans
// ça, un job quotidien ouvre des issues fausses — et une alerte qui crie à tort
// cesse d'être lue, ce qui nous ramène au problème qu'on essaie de résoudre.
const RETRY_SETTLE_MS = 5_000;

/**
 * Pages à fort enjeu. Volontairement une douzaine, pas les 171 : un rendu
 * complet serait lent et bruyant, et ces pages couvrent chaque gabarit.
 */
const PAGES = [
  '/',
  '/legal',
  '/legal/mentions',
  '/legal/privacy',
  '/legal/cgu',
  '/ecoles',
  '/employeurs',
  '/tarifs',
  '/jobs',
  '/cv-builder',
  '/emploi/paris',
  '/metier/mecanicien',
  '/blog',
];

/**
 * Bruit réseau connu et sans conséquence. Tout le reste est signalé.
 * `/api/auth/me` répond 401 quand personne n'est connecté : c'est le
 * fonctionnement normal de la vérification de session, pas une panne.
 */
const BENIGN_CONSOLE = [
  /\/api\/auth\/me/,
  /favicon\.ico/,
];

const isBenign = (text) => BENIGN_CONSOLE.some((pattern) => pattern.test(text));

/** Texte réellement rendu, tel qu'un lecteur le voit. */
function renderedWords(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText ?? '';
    return text.trim().split(/\s+/).filter(Boolean).length;
  });
}

async function inspect(browser, baseUrl, path) {
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const badResponses = [];

  // Une exception non capturée est le signal décisif : elle interrompt le
  // script, donc tout ce qui devait s'exécuter après ne s'exécute pas.
  page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)));

  // Les ressources en échec se suivent sur les réponses, pas sur la console :
  // le message console d'une ressource en échec ne contient pas son URL, ce
  // qui le rend infiltrable et inexploitable.
  page.on('response', (response) => {
    const status = response.status();
    if (status < 400) return;
    const target = response.url();
    if (!isBenign(target)) badResponses.push({ url: target, status });
  });

  page.on('console', (message) => {
    const text = message.text();
    if (message.type() !== 'error') return;
    if (/Failed to load resource/i.test(text)) return; // couvert par `response`
    if (!isBenign(text)) consoleErrors.push(text);
  });

  const url = `${baseUrl}${path}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(SETTLE_MS);
    let words = await renderedWords(page);

    // Deuxième chance avant de crier au feu — mais seulement sur le compte de
    // mots. Une exception JS, elle, reste un échec immédiat : c'est le signal
    // qui a attrapé /legal, et le retarder n'y changerait rien.
    if (words < MIN_RENDERED_WORDS && pageErrors.length === 0) {
      await page.waitForTimeout(RETRY_SETTLE_MS);
      words = await renderedWords(page);
    }

    // L'URL d'arrivée, pas celle demandée. Playwright suit les redirections en
    // silence : /tarifs répond 307 vers /#pricing, donc sans ce contrôle la
    // sonde mesure l'accueil une seconde fois tout en affichant « ok /tarifs ».
    // Un gabarit non testé passerait pour testé — le défaut même qu'on traque.
    const landed = page.url();
    const failed = pageErrors.length > 0 || words < MIN_RENDERED_WORDS;
    const screenshot = failed ? await page.screenshot({ fullPage: false }) : null;
    return { path, url, landed, words, pageErrors, consoleErrors, badResponses, screenshot };
  } catch (error) {
    const message = String(error?.message ?? error);
    return { path, url, landed: url, words: 0, pageErrors: [message], consoleErrors, badResponses, screenshot: null };
  } finally {
    await page.close();
  }
}

function createReport() {
  const entries = [];
  return {
    entries,
    pass(check, message) { entries.push({ level: 'pass', check, message }); },
    warn(check, message) { entries.push({ level: 'warn', check, message }); },
    fail(check, message) { entries.push({ level: 'fail', check, message }); },
    get failures() { return entries.filter((e) => e.level === 'fail'); },
    get warnings() { return entries.filter((e) => e.level === 'warn'); },
  };
}

function record(report, result) {
  const { path, url, landed, words, pageErrors, consoleErrors } = result;

  for (const error of pageErrors) {
    report.fail('exception', `${path} — ${error}`);
  }

  if (words < MIN_RENDERED_WORDS) {
    report.fail('rendu', `${path} — ${words} mots rendus, page probablement vide`);
  }

  // Une redirection n'est pas une panne, mais elle rend le « ok » trompeur :
  // la sonde a mesuré un autre document que celui annoncé. On le dit, pour que
  // personne ne croie ce gabarit couvert sur la foi d'une ligne verte.
  if (landed && landed !== url) {
    report.warn('redirection', `${path} — redirige vers ${landed} ; ce gabarit n'est pas testé`);
  }

  for (const error of consoleErrors.slice(0, 3)) {
    report.warn('console', `${path} — ${error}`);
  }

  // Une 5xx est une panne serveur, pas du bruit : elle passe en échec.
  for (const { url: target, status } of result.badResponses.slice(0, 5)) {
    const note = `${path} — HTTP ${status} sur ${target}`;
    if (status >= 500) report.fail('ressource', note);
    else report.warn('ressource', note);
  }

  if (pageErrors.length === 0 && words >= MIN_RENDERED_WORDS) {
    const where = landed && landed !== url ? ` (contenu de ${landed})` : '';
    report.pass('rendu', `${path} — ${words} mots rendus, aucune exception${where}`);
  }
}

async function saveScreenshots(results) {
  const failures = results.filter((r) => r.screenshot);
  if (failures.length === 0) return;

  await mkdir(SHOTS_DIR, { recursive: true });
  for (const { path, screenshot } of failures) {
    const name = (path === '/' ? 'accueil' : path.replace(/^\//, '').replace(/\//g, '-')) + '.png';
    await writeFile(`${SHOTS_DIR}/${name}`, screenshot);
  }
  console.log(`\n${failures.length} capture(s) dans ${SHOTS_DIR}/`);
}

function printHuman(report, baseUrl) {
  const icon = { pass: '  ok ', warn: 'warn ', fail: 'FAIL ' };
  console.log(`\nContrôle de rendu — ${baseUrl}\n`);
  for (const { level, check, message } of report.entries) {
    console.log(`${icon[level]} [${check}] ${message}`);
  }
  const { failures, warnings } = report;
  console.log(
    failures.length === 0
      ? `\n✅ Toutes les pages rendent${warnings.length > 0 ? ` — ${warnings.length} avertissement(s)` : ''}\n`
      : `\n❌ ${failures.length} échec(s), ${warnings.length} avertissement(s)\n`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const baseUrl = (args.find((a) => !a.startsWith('--')) ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const asJson = args.includes('--json');

  const browser = await chromium.launch();
  const report = createReport();
  const results = [];

  try {
    // En série : une douzaine de pages, et le parallélisme rendrait les
    // journaux illisibles pour un gain de quelques secondes.
    for (const path of PAGES) {
      const result = await inspect(browser, baseUrl, path);
      results.push(result);
      record(report, result);
    }
  } finally {
    await browser.close();
  }

  if (asJson) console.log(JSON.stringify({ baseUrl, entries: report.entries }, null, 2));
  else printHuman(report, baseUrl);

  await saveScreenshots(results);
  process.exit(report.failures.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`Contrôle de rendu interrompu : ${error?.stack ?? error}`);
  process.exit(1);
});
