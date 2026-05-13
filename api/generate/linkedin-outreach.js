export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, withTimeout, getCurrentUser } from '../_lib/auth.js';

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };

  if (req.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers: { ...H, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'linkedin-outreach', 15, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });
  const userRl = await checkRateLimit(`user:${user.email}`, 'linkedin-outreach', 12, 3600);
  if (!userRl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

  const company    = sanitizeString(body.company    || '', 200);
  const jobTitle   = sanitizeString(body.jobTitle   || '', 200);
  const senderName = sanitizeString(body.senderName || '', 100);
  const profile    = sanitizeString((body.profile   || '').slice(0, 500), 500);

  if (!company) return new Response(JSON.stringify({ error: 'Entreprise requise' }), { status: 400, headers: H });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Service indisponible' }), { status: 500, headers: H });

  const prompt = `Tu es un expert en networking professionnel sur le marché français.
Génère 2 messages de connexion LinkedIn pour approcher des employés chez ${company}.

CONTEXTE :
- Poste visé : ${jobTitle || 'un poste dans cette entreprise'}
- Candidat : ${senderName || 'un candidat motivé'}
- Profil résumé : ${profile || 'profil professionnel qualifié'}

RÈGLES :
- Max 300 caractères par message (contrainte LinkedIn)
- Naturel, humain, jamais générique
- Pas de "j'espère que ce message vous trouve bien"
- Message 1 : pour un RH ou recruteur (direct, met en avant la valeur)
- Message 2 : pour un employé du même domaine (curieux, cherche un échange d'expérience)

Réponds UNIQUEMENT en JSON valide :
{
  "direct": "Message pour RH/recruteur (≤300 car.)",
  "indirect": "Message pour employé du domaine (≤300 car.)",
  "tip": "Un conseil pratique pour maximiser les chances de réponse sur LinkedIn"
}`;

  try {
    const res = await withTimeout(fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    }), 15000);

    if (!res.ok) throw new Error('api_error');
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    let result;
    try { result = JSON.parse(text); }
    catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { result = JSON.parse(m[0]); } catch {} }

    if (!result?.direct) return new Response(JSON.stringify({ error: 'Réponse invalide' }), { status: 500, headers: H });
    return new Response(JSON.stringify(result), { status: 200, headers: H });
  } catch {
    return new Response(JSON.stringify({ error: 'Erreur réseau' }), { status: 500, headers: H });
  }
}
