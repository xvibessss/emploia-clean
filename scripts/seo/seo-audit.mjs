#!/usr/bin/env node
/**
 * Suite de régression SEO — audite un déploiement réel, en lecture seule.
 *
 * Reproduit automatiquement les contrôles faits à la main le 2026-10-06
 * (AUDIT-SEO-2026-10-06.md), qui avaient validé la bascule vers emploia.eu.
 * L'enjeu : une régression d'indexabilité est silencieuse. Rien ne casse,
 * rien n'alerte, et le trafic ne vient simplement jamais.
 *
 * Usage :
 *   node seo-audit.mjs [baseUrl] [--strict] [--json]
 *
 *   baseUrl   défaut https://emploia.eu
 *   --strict  les avertissements deviennent bloquants (pages trop courtes)
 *   --json    rapport machine sur stdout, à la place du rapport lisible
 *
 * Code de sortie : 0 si aucun échec, 1 sinon. Aucune dépendance externe.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const DEFAULT_BASE_URL = 'https://emploia.eu';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_CONCURRENCY = 8;
const LINK_SAMPLE_SIZE = 40;
const MIN_VISIBLE_WORDS = 300;
const ABANDONED_HOSTS = ['emploia.fr'];

// Le host de déploiement Vercel est légitime dans du contenu éditorial
// (un article cite « https://mon-projet.vercel.app » en exemple), mais pas
// dans une balise structurante. On ne le cherche donc que dans les métadonnées.
const DEPLOY_HOST = 'vercel.app';

/* ------------------------------------------------------------------ outils */

const asList = (value) => (Array.isArray(value) ? value : [value]);

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'emploia-seo-audit/1.0' },
    });
    const body = response.ok ? await response.text() : '';
    // L'en-tête compte autant que la balise : un X-Robots-Tag désindexe une
    // page dont le HTML paraît parfaitement indexable.
    const robotsHeader = response.headers.get('x-robots-tag') ?? '';
    return { ok: response.ok, status: response.status, url: response.url, body, robotsHeader };
  } catch (error) {
    return { ok: false, status: 0, url, body: '', error: String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchStatus(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    return { url, status: response.status };
  } catch (error) {
    return { url, status: 0, error: String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

/** Exécute `worker` sur chaque entrée, MAX_CONCURRENCY en vol à la fois. */
async function mapLimited(items, worker) {
  const results = [];
  const queue = [...items];
  const runners = Array.from({ length: Math.min(MAX_CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      results.push(await worker(item));
    }
  });
  await Promise.all(runners);
  return results;
}

/** Retire scripts et styles. Indispensable avant toute analyse du document :
 *  sans ça le JS inline est compté comme du contenu (l'erreur qui avait
 *  annoncé 1 300 mots au lieu de 400), et les gabarits JS qui construisent des
 *  URL — `href="/blog/${slug}"` — sont pris pour de vrais liens cassés. */
function stripCode(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
}

function visibleWordCount(html) {
  const text = stripCode(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.split(' ').length : 0;
}

function extractCanonical(html) {
  const tag = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0];
  return tag?.match(/href=["']([^"']+)["']/i)?.[1] ?? null;
}

/** Une page listée au sitemap et marquée noindex est une contradiction : on
 *  demande à Google de la parcourir puis de l'ignorer. Gaspillage de budget de
 *  crawl, et surtout signe que deux décisions ont été prises séparément. */
function isNoindex(html, robotsHeader) {
  if (/noindex/i.test(robotsHeader)) return true;
  const meta = html.match(/<meta[^>]+name=["']robots["'][^>]*>/i)?.[0] ?? '';
  return /noindex/i.test(meta);
}

function extractMetaUrls(html) {
  const metas = html.match(/<(?:link|meta)[^>]*>/gi) ?? [];
  return metas.flatMap((tag) => asList(tag.match(/(?:href|content)=["'](https?:\/\/[^"']+)["']/i)?.[1] ?? []));
}

function extractInternalPaths(html) {
  const hrefs = stripCode(html).match(/href=["']\/[^"'#?]*["']/g) ?? [];
  // Un `${` résiduel signale un gabarit non rendu hors script : à ignorer ici,
  // c'est le rôle d'un autre contrôle que de le signaler.
  return [...new Set(hrefs.map((h) => h.slice(6, -1)).filter((p) => !p.includes('${')))];
}

const normalise = (url) => url.replace(/\/$/, '');

/** Empreinte du contenu visible, pour reconnaître deux URL qui servent le même
 *  document. Le texte, pas le HTML brut : deux rendus identiques peuvent
 *  différer sur une balise de date ou un jeton de cache. */
const fingerprint = (html) => createHash('sha1')
  .update(stripCode(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  .digest('hex');

/* ----------------------------------------------------------------- épreuves */

async function checkRobots(baseUrl, report) {
  const robots = await fetchText(`${baseUrl}/robots.txt`);
  if (!robots.ok) {
    report.fail('robots', `robots.txt inaccessible (HTTP ${robots.status})`);
    return;
  }
  if (/^\s*Disallow:\s*\/\s*$/im.test(robots.body)) {
    report.fail('robots', 'robots.txt contient « Disallow: / » — le site entier est bloqué');
  }
  if (!/^\s*Sitemap:\s*http/im.test(robots.body)) {
    report.fail('robots', 'robots.txt ne déclare aucun Sitemap');
  }
  report.pass('robots', 'robots.txt présent, site autorisé, sitemap déclaré');
}

async function loadSitemapUrls(baseUrl, report) {
  const sitemap = await fetchText(`${baseUrl}/sitemap.xml`);
  if (!sitemap.ok) {
    report.fail('sitemap', `sitemap.xml inaccessible (HTTP ${sitemap.status})`);
    return [];
  }
  const urls = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  if (urls.length === 0) {
    report.fail('sitemap', 'sitemap.xml ne contient aucune URL');
    return [];
  }

  const foreign = urls.filter((u) => !u.startsWith(baseUrl));
  if (foreign.length > 0) {
    report.fail('sitemap', `${foreign.length} URL hors du domaine audité, ex. ${foreign[0]}`);
  }
  report.pass('sitemap', `${urls.length} URL, toutes sur ${baseUrl}`);
  return urls;
}

async function checkStatuses(urls, report) {
  const results = await mapLimited(urls, fetchStatus);
  const broken = results.filter((r) => r.status !== 200);
  if (broken.length > 0) {
    for (const { url, status } of broken.slice(0, 10)) report.fail('statuts', `HTTP ${status} — ${url}`);
    if (broken.length > 10) report.fail('statuts', `… et ${broken.length - 10} autres`);
    return;
  }
  report.pass('statuts', `${urls.length} URL répondent 200`);
}

/** Récupère chaque page une fois et dérive tous les contrôles de contenu. */
async function checkPages(urls, report, { strict }) {
  const pages = await mapLimited(urls, async (url) => ({ url, ...(await fetchText(url)) }));
  const usable = pages.filter((p) => p.ok && p.body);

  const canonicalIssues = [];
  const domainIssues = [];
  const thinPages = [];
  const noindexed = [];

  // Un canonical qui pointe ailleurs n'est pas forcément une erreur : quand
  // plusieurs URL servent le MÊME document — /legal, /legal/privacy et
  // /legal/cgu sont réécrits vers un seul fichier — les consolider est la
  // bonne pratique. On ne signale donc que les cibles au contenu différent.
  const fingerprints = new Map(usable.map((p) => [normalise(p.url), fingerprint(p.body)]));

  for (const page of usable) {
    const canonical = extractCanonical(page.body);
    if (!canonical) {
      canonicalIssues.push(`${page.url} — canonical absent`);
    } else if (normalise(canonical) !== normalise(page.url)) {
      // Deux échecs distincts, et la distinction compte : une cible au contenu
      // différent est une consolidation abusive, une cible qui n'existe pas est
      // bien pire — Google est instruit de reporter les signaux sur une page
      // absente, donc la vraie page peut quitter l'index.
      const known = fingerprints.get(normalise(canonical));
      if (known !== undefined) {
        if (known !== fingerprint(page.body)) {
          canonicalIssues.push(`${page.url} — canonical pointe sur ${canonical}, au contenu différent`);
        }
      } else {
        const fetched = await fetchText(canonical);
        if (!fetched.ok) {
          canonicalIssues.push(`${page.url} — canonical pointe sur ${canonical}, qui répond HTTP ${fetched.status}`);
        } else if (fingerprint(fetched.body) !== fingerprint(page.body)) {
          canonicalIssues.push(`${page.url} — canonical pointe sur ${canonical}, au contenu différent`);
        }
      }
    }

    const metaUrls = extractMetaUrls(page.body);
    const stale = metaUrls.filter((u) => [...ABANDONED_HOSTS, DEPLOY_HOST].some((h) => u.includes(h)));
    if (stale.length > 0) domainIssues.push(`${page.url} — métadonnée vers ${stale[0]}`);

    if (isNoindex(page.body, page.robotsHeader)) noindexed.push(page.url);

    const words = visibleWordCount(page.body);
    if (words < MIN_VISIBLE_WORDS) thinPages.push(`${page.url} — ${words} mots visibles`);
  }

  if (noindexed.length > 0) {
    report.fail('indexabilite', `${noindexed.length} URL du sitemap sont en noindex — contradictoire`);
    for (const url of noindexed.slice(0, 10)) report.fail('indexabilite', url);
  } else {
    report.pass('indexabilite', 'aucune URL du sitemap n\'est marquée noindex');
  }

  if (canonicalIssues.length > 0) {
    for (const issue of canonicalIssues.slice(0, 10)) report.fail('canonical', issue);
  } else {
    report.pass('canonical', `${usable.length} canonicals valides — auto-référents, ou consolidant un document servi à plusieurs URL`);
  }

  if (domainIssues.length > 0) {
    for (const issue of domainIssues.slice(0, 10)) report.fail('domaine', issue);
  } else {
    report.pass('domaine', 'aucune métadonnée vers un domaine abandonné');
  }

  const noteThin = strict ? report.fail : report.warn;
  if (thinPages.length > 0) {
    noteThin.call(report, 'contenu', `${thinPages.length} pages sous ${MIN_VISIBLE_WORDS} mots visibles`);
    for (const page of thinPages.slice(0, 5)) noteThin.call(report, 'contenu', page);
  } else {
    report.pass('contenu', `toutes les pages dépassent ${MIN_VISIBLE_WORDS} mots visibles`);
  }

  return usable;
}

async function checkInternalLinks(baseUrl, pages, report) {
  const sample = pages.slice(0, LINK_SAMPLE_SIZE);
  const paths = [...new Set(sample.flatMap((p) => extractInternalPaths(p.body)))];
  const results = await mapLimited(paths, (path) => fetchStatus(`${baseUrl}${path}`));
  const broken = results.filter((r) => r.status !== 200);

  if (broken.length > 0) {
    for (const { url, status } of broken.slice(0, 10)) report.fail('liens', `HTTP ${status} — ${url}`);
    return;
  }
  report.pass('liens', `${paths.length} liens internes testés, aucun cassé`);
}

/* ------------------------------------------------------------------ rapport */

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

function printHuman(report, baseUrl) {
  const icon = { pass: '  ok ', warn: 'warn ', fail: 'FAIL ' };
  console.log(`\nAudit SEO — ${baseUrl}\n`);
  for (const { level, check, message } of report.entries) {
    console.log(`${icon[level]} [${check}] ${message}`);
  }
  const { failures, warnings } = report;
  console.log(
    failures.length === 0
      ? `\n✅ Aucun échec${warnings.length > 0 ? ` — ${warnings.length} avertissement(s)` : ''}\n`
      : `\n❌ ${failures.length} échec(s), ${warnings.length} avertissement(s)\n`,
  );
}

/* --------------------------------------------------------------------- main */

/**
 * Les pages que le sitemap ne peut pas déclarer.
 *
 * Raison d'être, et elle est concrète : `score.html` est servi sur
 * `/score/:token`. Une page par jeton ne figure jamais dans un sitemap, donc
 * cet audit — qui n'énumérait que les `<loc>` — ne l'a jamais testée. Son
 * canonical désignait `/score`, qui répond 404 : chaque page de score partagé
 * disait à Google que sa page canonique n'existait pas. Trouvé le 2026-10-11
 * par un garde côté dépôt, pas par ce script.
 *
 * On lit donc `vercel.json` sur le disque — l'audit tourne depuis le dépôt en
 * CI. Absent, on le signale sans échouer : l'audit reste utilisable contre une
 * production depuis n'importe où.
 *
 * Le jeton de sonde est arbitraire : la réécriture sert le même fichier quelle
 * que soit sa valeur, et les métadonnées qu'on vérifie sont statiques.
 */
const PROBE_TOKEN = 'sonde-audit-seo';

async function loadRewritePages(baseUrl, report) {
  let raw;
  try {
    raw = await readFile('vercel.json', 'utf8');
  } catch {
    report.warn('reecritures', 'vercel.json introuvable — pages paramétrées non auditées');
    return [];
  }

  let rewrites;
  try {
    rewrites = JSON.parse(raw).rewrites ?? [];
  } catch (error) {
    report.fail('reecritures', `vercel.json illisible : ${error.message}`);
    return [];
  }

  const parametrees = rewrites.filter(
    (r) => typeof r.source === 'string'
      && typeof r.destination === 'string'
      && r.source.includes(':')
      && r.destination.endsWith('.html'),
  );

  if (parametrees.length === 0) {
    report.pass('reecritures', 'aucune réécriture paramétrée vers une page HTML');
    return [];
  }

  return parametrees.map((r) => ({
    url: baseUrl + r.source.replace(/:[A-Za-z0-9_]+\*?/g, PROBE_TOKEN),
    source: r.source,
  }));
}

async function checkRewritePages(sondes, report) {
  for (const { url, source } of sondes) {
    const page = await fetchText(url);
    if (!page.ok) {
      report.fail('reecritures', `${source} — ${url} répond HTTP ${page.status}`);
      continue;
    }

    const canonical = extractCanonical(page.body);
    if (canonical) {
      const cible = await fetchStatus(canonical);
      if (cible.status >= 400) {
        report.fail('reecritures', `${source} — canonical ${canonical} répond HTTP ${cible.status}`);
      } else {
        report.pass('reecritures', `${source} — canonical ${canonical} résout en ${cible.status}`);
      }
    } else {
      report.pass('reecritures', `${source} — aucun canonical, correct pour une page par jeton`);
    }

    // Une page dont le contenu dépend d'un jeton n'a rien à faire dans l'index :
    // chaque jeton créerait une URL distincte au contenu quasi identique.
    if (!isNoindex(page.body, page.robotsHeader)) {
      report.warn('reecritures', `${source} — indexable alors que son contenu dépend d'un jeton`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const baseUrl = normalise(args.find((a) => !a.startsWith('--')) ?? DEFAULT_BASE_URL);
  const strict = args.includes('--strict');
  const asJson = args.includes('--json');

  const report = createReport();

  await checkRobots(baseUrl, report);
  const urls = await loadSitemapUrls(baseUrl, report);

  if (urls.length > 0) {
    await checkStatuses(urls, report);
    const pages = await checkPages(urls, report, { strict });
    await checkInternalLinks(baseUrl, pages, report);
  }

  // Indépendant du sitemap, et c'est tout l'intérêt.
  const sondes = await loadRewritePages(baseUrl, report);
  if (sondes.length > 0) await checkRewritePages(sondes, report);

  if (asJson) console.log(JSON.stringify({ baseUrl, entries: report.entries }, null, 2));
  else printHuman(report, baseUrl);

  process.exit(report.failures.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`Audit interrompu : ${error?.stack ?? error}`);
  process.exit(1);
});
