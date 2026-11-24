export const config = { runtime: 'nodejs' };

import { checkRateLimit } from './_lib/auth.js';
import { trackEvent, CLIENT_EVENTS } from './_lib/track.js';

// Endpoint public : seuls les événements nés dans le navigateur. Les autres
// (inscription, génération, paiement) sont comptés par le serveur lui-même via
// _lib/track.js — voir la note en tête de ce fichier pour la raison.
const MAX_BODY_SIZE = 1024;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_BODY_SIZE) return res.status(413).json({ error: 'Payload too large' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'track', 60, 3600);
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { event, props } = body || {};
  if (!event || typeof event !== 'string') return res.status(400).json({ error: 'Missing or invalid event' });
  // Un événement inconnu (cv_vault_view…) est ignoré sans erreur : le client
  // l'envoie aussi à Plausible, et un 400 ne servirait qu'à remplir la console.
  if (!CLIENT_EVENTS.includes(event)) return res.status(202).json({ ok: true, ignored: true });

  try {
    await trackEvent(event, props);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[track] KV error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
