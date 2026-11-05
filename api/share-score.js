export const config = { runtime: 'nodejs' };

import { kvGet, kvSet, checkRateLimit } from './_lib/auth.js';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://emploia.eu';
const THIRTY_DAYS = 30 * 86400;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'POST') {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > 1024) return res.status(413).json({ error: 'Requête trop volumineuse' });

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch {
        return res.status(400).json({ error: 'JSON invalide' });
      }
    }

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const rl = await checkRateLimit(`ip:${ip}`, 'share-score', 10, 3600);
    if (!rl.allowed) return res.status(429).json({ error: 'Trop de partages. Réessayez dans 1 heure.' });

    const { score, jobTitle } = body || {};
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
      return res.status(400).json({ error: 'Le score doit être un nombre entre 0 et 100' });
    }

    // 12 caractères hexadécimaux (48 bits) au lieu de 8 : une page publique
    // indexable ne doit pas pouvoir être énumérée en balayant l'espace des jetons.
    // userId n'est plus stocké — rien ne le relisait, et la page est publique.
    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const title = typeof jobTitle === 'string' ? jobTitle.replace(/[\r\n<>]/g, ' ').trim().slice(0, 120) : '';
    await kvSet(`share:${token}`, { score: Math.round(score), jobTitle: title, createdAt: Date.now() }, THIRTY_DAYS);
    return res.status(201).json({ token, url: `${BASE_URL}/score/${token}` });
  }

  if (req.method === 'GET') {
    const { token } = req.query;
    if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Paramètre token manquant' });
    if (!/^(?:[0-9a-f]{8}|[0-9a-f]{12})$/.test(token)) return res.status(400).json({ error: 'Token invalide' });

    const data = await kvGet(`share:${token}`);
    if (!data) return res.status(404).json({ error: 'Score introuvable ou expiré' });
    return res.status(200).json({ score: data.score, jobTitle: data.jobTitle, createdAt: data.createdAt });
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
