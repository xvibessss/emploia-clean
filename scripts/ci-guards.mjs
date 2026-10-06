#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   EmploiA — CI guards (fast, dependency-free static checks)
   Runs in CI on every PR to catch classes of bug the existing jobs miss:
   broken vercel.json rewrites (silent prod 404s), missing handler exports,
   and security-invariant regressions. Exit 0 = green.
   Run locally: node scripts/ci-guards.mjs
═══════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';

let fails = 0;
const fail = m => { console.error('  ✗ ' + m); fails++; };
const ok   = m => console.log('  ✓ ' + m);
const exists = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};

// ── 1. vercel.json rewrites all resolve to a real file/route ────────────────
console.log('\n[1] vercel.json rewrites → destinations existent');
try {
  const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const rw = v.rewrites || [];
  let broken = 0;
  for (const r of rw) {
    let d = (r.destination || '').split('?')[0];
    if (!d.startsWith('/') || d.includes(':')) continue; // external or param dest
    if (d.startsWith('/api/')) {
      const b = 'api/' + d.slice(5);
      if (exists(b + '.js') || exists(b + '/index.js') || exists(b)) continue;
    } else {
      const rel = d.slice(1);
      if (exists(rel) || exists(rel + '.html') || exists(rel + '/index.html')) continue;
    }
    fail(`rewrite cassé : ${r.source} → ${d}`); broken++;
  }
  if (!broken) ok(`${rw.length} rewrites, aucun cassé`);
} catch (e) { fail('vercel.json illisible : ' + e.message); }

// ── 2. every API handler exports a default ──────────────────────────────────
console.log('\n[2] chaque handler api/ a un export default');
const apiFiles = fs.existsSync('api') ? walk('api').filter(f => f.endsWith('.js')) : [];
let noDefault = 0;
for (const f of apiFiles) {
  const base = path.basename(f);
  if (base.startsWith('_') || f.includes('/_lib/')) continue; // libs, not handlers
  if (!/export\s+default/.test(fs.readFileSync(f, 'utf8'))) { fail(`pas d'export default : ${f}`); noDefault++; }
}
if (!noDefault) ok(`${apiFiles.length} fichiers api/ scannés, handlers OK`);

// ── 3. security invariants (regressions we never want back) ─────────────────
console.log('\n[3] invariants de sécurité');
const readAll = f => (exists(f) ? fs.readFileSync(f, 'utf8') : '');
const apiSrc = apiFiles.map(readAll).join('\n');
// no hardcoded fallback JWT secret
if (/JWT_SECRET\s*\|\|\s*['"]/.test(apiSrc + readAll('middleware.js'))) fail('secret JWT de repli en dur détecté (JWT_SECRET || "…")');
else ok('aucun secret JWT de repli en dur');
// chat persona not client-overridable
if (/system_override/.test(readAll('api/chat.js'))) fail('api/chat.js accepte system_override (persona détournable)');
else ok('chat : persona serveur figée');
// no committed .env
const envs = ['.env', '.env.local', '.env.production'].filter(exists);
if (envs.length) fail('fichier(s) secret(s) commités : ' + envs.join(', '));
else ok('aucun .env commité');

// ── 4. data locality: every function is pinned to Paris ─────────────────────
// La page /ecoles et /sous-traitants affirment à un acheteur institutionnel que
// le traitement applicatif s'exécute en France. Cette affirmation ne tient que
// si chaque fonction est effectivement épinglée, et elle se périmerait au
// premier handler ajouté sans y penser — d'où ce garde.
//
// Deux mécanismes distincts, et c'est le piège : la clé `regions` de
// vercel.json pilote les fonctions Serverless/Node, tandis qu'une fonction en
// runtime Edge s'exécute par défaut « dans la région la plus proche de la
// requête » et doit déclarer ses propres `regions` dans son export const
// config. Poser seulement la clé projet laisserait les 66 handlers Edge
// s'exécuter n'importe où, tout en ayant l'air réglé.
console.log('\n[4] localisation des données → toute fonction épinglée sur cdg1');
try {
  const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const projectRegions = v.regions || [];
  if (projectRegions.length === 1 && projectRegions[0] === 'cdg1') ok('vercel.json déclare regions: ["cdg1"]');
  else fail(`vercel.json doit déclarer regions: ["cdg1"] (actuel : ${JSON.stringify(projectRegions)})`);

  let unpinned = 0;
  for (const f of apiFiles) {
    const base = path.basename(f);
    if (base.startsWith('_') || f.includes('/_lib/')) continue; // libs, pas des handlers
    const src = readAll(f);
    const cfg = src.match(/export\s+const\s+config\s*=\s*\{[\s\S]*?\}\s*;/);
    // Un handler sans bloc config tourne en Node et hérite de la clé projet.
    if (!cfg) continue;
    if (!/runtime\s*:\s*['"]edge['"]/.test(cfg[0])) continue;
    if (!/regions\s*:\s*\[\s*['"]cdg1['"]\s*\]/.test(cfg[0])) {
      fail(`handler Edge non épinglé sur cdg1 : ${f} — ajouter regions: ['cdg1'] à son export const config`);
      unpinned++;
    }
  }
  if (!unpinned) ok(`tous les handlers Edge déclarent regions: ['cdg1']`);
} catch (e) { fail('contrôle de localisation impossible : ' + e.message); }

// ── 5. JSON config is valid ─────────────────────────────────────────────────
console.log('\n[5] JSON de config valide');
for (const j of ['vercel.json', 'package.json']) {
  if (!exists(j)) continue;
  try { JSON.parse(fs.readFileSync(j, 'utf8')); ok(`${j} valide`); }
  catch (e) { fail(`${j} invalide : ${e.message}`); }
}

console.log('');
if (fails) { console.error(`CI GUARDS: ${fails} problème(s) ✗`); process.exit(1); }
console.log('CI GUARDS: tout vert ✓');
