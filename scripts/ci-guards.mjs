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

// ── 4. JSON config is valid ─────────────────────────────────────────────────
console.log('\n[4] JSON de config valide');
for (const j of ['vercel.json', 'package.json']) {
  if (!exists(j)) continue;
  try { JSON.parse(fs.readFileSync(j, 'utf8')); ok(`${j} valide`); }
  catch (e) { fail(`${j} invalide : ${e.message}`); }
}

console.log('');
if (fails) { console.error(`CI GUARDS: ${fails} problème(s) ✗`); process.exit(1); }
console.log('CI GUARDS: tout vert ✓');
