export const config = { runtime: 'nodejs' };

import { kvGet, kvSet } from './_lib/auth.js';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';
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

    const { score, jobTitle, userId } = body || {};
    if (typeof score !== 'number' || score < 0 || score > 100) {
      return res.status(400).json({ error: 'Le score doit être un nombre entre 0 et 100' });
    }

    const token = crypto.randomUUID().slice(0, 8);
    await kvSet(`share:${token}`, { score, jobTitle: jobTitle || '', userId: userId || '', createdAt: Date.now() }, THIRTY_DAYS);
    return res.status(201).json({ token, url: `${BASE_URL}/score/${token}` });
  }

  if (req.method === 'GET') {
    const { token } = req.query;
    if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Paramètre token manquant' });
    if (!/^[0-9a-f]{8}$/.test(token)) return res.status(400).json({ error: 'Token invalide' });

    const data = await kvGet(`share:${token}`);
    if (!data) return res.status(404).json({ error: 'Score introuvable ou expiré' });
    return res.status(200).json({ score: data.score, jobTitle: data.jobTitle, createdAt: data.createdAt });
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
