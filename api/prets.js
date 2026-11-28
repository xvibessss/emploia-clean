export const config = { runtime: 'edge', regions: ['cdg1'] };
import { getCurrentUser, kvGet, kvSet, getAllowedOrigin, checkRateLimit } from './_lib/auth.js';
import {
  MAX_CV, MAX_LETTRE, STATUTS, normaliserOffre, separerAPreciser, motsAjoutes,
  nbACompleter, texteOffre, ajouterPret,
} from './_lib/prets.js';

// « Prêts à postuler » de /decouvrir : un CV adapté par offre, sa lettre
// éventuelle, et ce qui a été adapté. Clé `prets:{email}`, la session seule
// décide de qui lit quoi.

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: H });

  if (req.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers: { ...H, 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) return json({ error: 'Méthode non autorisée' }, 405);

  const user = await getCurrentUser(req);
  if (!user) return json({ error: 'Non authentifié' }, 401);

  const rl = await checkRateLimit(`user:${user.email}`, 'prets', 60, 60);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '60' } });

  const key = `prets:${user.email}`;
  const liste = (await kvGet(key)) || [];

  if (req.method === 'GET') return json({ prets: Array.isArray(liste) ? liste : [] });

  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json({ error: 'id requis' }, 400);
    await kvSet(key, liste.filter((p) => p.id !== id));
    return json({ ok: true });
  }

  const texte = await req.text();
  if (texte.length > 40000) return json({ error: 'Requête trop longue' }, 413);
  let body;
  try { body = JSON.parse(texte); } catch { return json({ error: 'JSON invalide' }, 400); }

  if (req.method === 'PATCH') {
    const i = liste.findIndex((p) => p.id === body.id);
    if (i < 0) return json({ error: 'Introuvable' }, 404);
    if (typeof body.lettre === 'string') liste[i].lettre = body.lettre.slice(0, MAX_LETTRE);
    // CV affiné dans /adapter : même nettoyage qu'à la création.
    if (typeof body.cv === 'string' && body.cv.trim().length >= 200) liste[i].cv = separerAPreciser(body.cv).cv.slice(0, MAX_CV);
    if (STATUTS.includes(body.statut)) {
      liste[i].statut = body.statut;
      if (body.statut === 'postule') liste[i].postuleLe = new Date().toISOString();
    }
    await kvSet(key, liste);
    return json({ pret: liste[i] });
  }

  // POST — un CV adapté vient d'être généré pour cette offre.
  const offre = normaliserOffre(body.offre);
  const brut = String(body.cv || '').slice(0, MAX_CV + 4000);
  if (!offre.title || brut.trim().length < 200) return json({ error: 'Offre et CV requis' }, 400);
  const { cv, aPreciser } = separerAPreciser(brut);
  const profil = String(body.profil || '').slice(0, 8000);
  const pret = {
    id: crypto.randomUUID(),
    offre,
    description: String(body.description || '').slice(0, 4000),
    cv: cv.slice(0, MAX_CV),
    aPreciser: aPreciser.slice(0, 3000),
    ajoutes: motsAjoutes(texteOffre(offre, body.description), cv, profil),
    aCompleter: nbACompleter(cv),
    lettre: '',
    statut: 'pret',
    cree: new Date().toISOString(),
  };
  await kvSet(key, ajouterPret(liste, pret));
  return json({ pret }, 201);
}
