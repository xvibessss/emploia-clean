// GET /api/offre?id=… — le texte d'une offre envoyée dans une alerte, pour que
// /app?offre_id=… la colle dans le générateur. Ce sont des offres publiques,
// déjà publiées par leur source : la lecture ne demande pas de compte, mais
// elle est bornée en débit et l'identifiant est validé avant toute lecture.

export const config = { runtime: 'edge', regions: ['cdg1'] };

import { checkRateLimit } from './_lib/auth.js';
import { lireFiche, idOffreValide } from './_lib/alertes.js';

const H = { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' };

export default async function handler(req) {
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'offre', 60, 60);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: H });

  const id = new URL(req.url).searchParams.get('id') || '';
  if (!idOffreValide(id)) return new Response(JSON.stringify({ error: 'Identifiant invalide' }), { status: 400, headers: H });
  const fiche = await lireFiche(id);
  if (!fiche) return new Response(JSON.stringify({ error: 'Offre expirée' }), { status: 404, headers: H });
  return new Response(JSON.stringify({ texte: fiche.texte, url: fiche.url }), { status: 200, headers: H });
}
