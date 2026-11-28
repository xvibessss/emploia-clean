export const config = { runtime: 'edge', regions: ['cdg1'] };
import { kvGet, kvSet, getAllowedOrigin, checkRateLimit } from './_lib/auth.js';
import { competencesDe, nomDe } from './_lib/competences.js';
import { analyser, MIN_OFFRES } from './_lib/filtre-ats.js';
import jobsHandler from './jobs.js';
import { trackEvent } from './_lib/track.js';

// Simulateur de filtre ATS (page /filtre-ats). Public : pas de compte requis.
// Le CV envoyé n'est ni stocké ni journalisé — seules les compétences qu'il
// cite servent au calcul, et elles repartent dans la réponse.

const PAGES = 4;            // 4 × 50 offres au plus, par le moteur de /jobs
const TTL_OFFRES = 6 * 3600; // les offres d'un métier changent peu en 6 h

async function empreinte(texte) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return [...new Uint8Array(buf)].slice(0, 10).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Les offres réelles du métier, réduites à ce que le calcul lit. */
async function offresDuMetier(metier, ville, base) {
  const cle = `filtreats:v1:${await empreinte(`${metier.toLowerCase()}|${ville.toLowerCase()}`)}`;
  const cache = await kvGet(cle);
  if (Array.isArray(cache)) return cache;
  // Les pages partent EN PARALLÈLE : à la suite, quatre recherches qui
  // interrogent chacune plusieurs sources approcheraient les 25 s d'une
  // fonction Edge.
  const pages = await Promise.all([...Array(PAGES).keys()].map(async (page) => {
    const p = new URLSearchParams({ q: metier, limit: '50', page: String(page) });
    if (ville) p.set('location', ville);
    try {
      const r = await jobsHandler(new Request(`${base}/api/jobs?${p}`, { headers: { 'x-forwarded-for': `filtre-ats-${cle.slice(-12)}-${page}` } }));
      if (!r.ok) return [];
      const d = await r.json();
      return d.demo || d.filtre === 'abandonne' || !Array.isArray(d.jobs) ? [] : d.jobs;
    } catch { return []; }
  }));
  const vus = new Set();
  const offres = [];
  for (const j of pages.flat()) {
    if (!j?.id || vus.has(j.id) || !j.title) continue;
    vus.add(j.id);
    // Les collecteurs ATS ont lu la description complète ; les autres
    // sources n'en servent que 300 caractères, qu'on lit à défaut.
    const k = Array.isArray(j.competences) && j.competences.length
      ? j.competences
      : competencesDe(`${j.title} ${j.description || ''}`, 12, j.company || '');
    if (k.length) offres.push({ t: String(j.title).slice(0, 120), c: String(j.company || '').slice(0, 80), k });
  }
  if (offres.length) await kvSet(cle, offres, TTL_OFFRES).catch(() => {});
  return offres;
}

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' };
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: H });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'inconnue';
  const rl = await checkRateLimit(`ip:${ip}`, 'filtre-ats', 30, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de simulations. Réessaie dans une heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  const texte = await req.text();
  if (texte.length > 25000) return json({ error: 'CV trop long' }, 413);
  let body;
  try { body = JSON.parse(texte); } catch { return json({ error: 'JSON invalide' }, 400); }
  const metier = String(body.metier || '').trim().slice(0, 80);
  const ville = String(body.ville || '').trim().slice(0, 60);
  const cvTexte = String(body.cv || '').slice(0, 20000);
  if (metier.length < 2) return json({ error: 'Indique un métier' }, 400);
  if (cvTexte.trim().length < 80) return json({ error: 'Colle ton CV (quelques lignes au moins)' }, 400);

  const offres = await offresDuMetier(metier, ville, new URL(req.url).origin);
  const cv = competencesDe(cvTexte, 60);
  if (offres.length < MIN_OFFRES) {
    return json({ insuffisant: true, nbOffres: offres.length, metier, ville, cv, noms: Object.fromEntries(cv.map((id) => [id, nomDe(id)])) });
  }
  const r = analyser(offres, cv);
  trackEvent('ats_filter_simulated', { offres: r.nbOffres }).catch(() => {});
  const ids = new Set([...cv, ...r.offres.flatMap((o) => o.e), ...r.manquantes.map((m) => m.id)]);
  return json({ metier, ville, cv, ...r, noms: Object.fromEntries([...ids].map((id) => [id, nomDe(id)])) });
}
