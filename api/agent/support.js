export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, getCurrentUser } from '../_lib/auth.js';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';

const SYSTEM = `Tu es l'agent support d'Emploia, un copilote IA de recherche d'emploi 100% français.

PRODUCT KNOWLEDGE :
- Emploia génère des CV, lettres de motivation, emails de relance, analyses salariales, questions d'entretien, et profils LinkedIn optimisés ATS en 30 secondes
- Plan Free : 5 générations gratuites, sans carte bancaire
- Plan Pro : 9€/mois ou 79€/an — générations illimitées, accès Orion Chat, CV Vault, toutes les fonctionnalités
- Plan Intensif : 29€/mois ou 239€/an — tout Pro + priorité serveur + support dédié
- Pages principales : /app (générateur), /dashboard (suivi candidatures), /jobs (offres IA), /tools (outils avancés), /chat (Orion AI), /cv-builder (éditeur CV), /cv-vault (mes CVs)
- Orion est le nom de l'IA d'Emploia (basée sur Claude d'Anthropic)
- Les documents générés sont optimisés pour les ATS français (Talentsoft, SAP SuccessFactors, Workday)
- Support email : contact@emploia.fr
- Politique RGPD : données supprimables depuis /profil → "Supprimer mon compte"

INSTRUCTIONS :
- Réponds TOUJOURS en français, de façon bienveillante et concise (max 120 mots)
- Pour les questions techniques hors périmètre Emploia, réponds "Je suis spécialisé sur Emploia — pour ce sujet, écris-nous à contact@emploia.fr"
- Pour les demandes de remboursement ou litiges : "Écris-nous à contact@emploia.fr avec ton email d'inscription, on revient vers toi sous 24h"
- Ne promets jamais de fonctionnalité non existante
- Si tu ne sais pas : dis-le et dirige vers contact@emploia.fr`;

function getHeaders(req) {
  const origin = getAllowedOrigin(req);
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

export default async function handler(req) {
  const headers = getHeaders(req);
  const origin = getAllowedOrigin(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Vary': 'Origin',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers });
  }

  const bodyText = await req.text();
  if (bodyText.length > 2000) {
    return new Response(JSON.stringify({ error: 'Message trop long (max 2000 caractères)' }), { status: 413, headers });
  }

  let body;
  try { body = JSON.parse(bodyText); }
  catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers }); }

  const question = sanitizeString(String(body.question || ''), 1500).trim();
  if (!question) {
    return new Response(JSON.stringify({ error: 'question requise' }), { status: 400, headers });
  }

  // Rate limit: 10 req/hour per IP (anonymous), 30 for logged-in users
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const user = await getCurrentUser(req).catch(() => null);
  const limitKey = user ? `user:${user.email}` : `ip:${ip}`;
  const limit = user ? 30 : 10;

  const rl = await checkRateLimit(limitKey, 'support', limit, 3600);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: 'Trop de questions. Réessayez dans une heure ou écrivez-nous à contact@emploia.fr' }),
      { status: 429, headers: { ...headers, 'Retry-After': '3600' } }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Service temporairement indisponible' }), { status: 500, headers });
  }

  // Add user context to the message if available
  const contextNote = user
    ? `[Utilisateur connecté : plan ${user.plan || 'free'}, ${user.freeGenerations || 0}/5 générations utilisées]`
    : '[Utilisateur non connecté]';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: 'user',
          content: `${contextNote}\n\nQuestion : ${question}`,
        }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic error: ${res.status}`);
    }

    const data = await res.json();
    const answer = data.content?.[0]?.text || 'Je n\'ai pas pu générer une réponse. Écrivez-nous à contact@emploia.fr';

    return new Response(JSON.stringify({ answer, model: 'haiku' }), { status: 200, headers });

  } catch (e) {
    return new Response(
      JSON.stringify({ answer: 'Service momentanément indisponible. Pour toute question urgente : contact@emploia.fr', error: true }),
      { status: 200, headers }
    );
  }
}
