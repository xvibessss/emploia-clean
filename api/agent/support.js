export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, getCurrentUser } from '../_lib/auth.js';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://emploia.eu';

const SYSTEM = `Tu es l'agent support d'Emploia, un copilote IA de recherche d'emploi 100% français.

PRODUCT KNOWLEDGE :
- Emploia génère des CV, lettres de motivation, emails de relance, analyses salariales, questions d'entretien, et profils LinkedIn optimisés ATS en 30 secondes
- Plan Free : 5 générations gratuites à vie, sans carte bancaire
- Pack Campagne : 59€ les 3 mois — PAIEMENT UNIQUE, non reconductible, sans essai. Donne tout Pro pendant 90 jours. C'est l'offre la moins chère au mois (19,67€/mois) et il n'y a aucun abonnement à résilier. C'est l'offre à recommander par défaut, car une recherche d'emploi dure en moyenne 3 mois
- Plan Pro : 24€/mois — abonnement avec 7 jours d'essai gratuit (carte requise), générations illimitées, accès Orion Chat, CV Vault, toutes les fonctionnalités. Pour qui préfère payer au mois plutôt que 59€ d'un coup
- Codes promo : certains créateurs de contenu partagent un code qui donne 10€ de réduction sur le Pack Campagne (59€ → 49€). Le code se saisit sur la page de paiement. Un seul code par commande, et il ne s'applique qu'au Pack Campagne, pas à l'abonnement Pro
- Il n'y a PAS d'abonnement annuel, PAS de plan Intensif (retiré de la vente le 30/09/2026), et PAS de coaching humain : l'accompagnement est entièrement logiciel (IA). Si un client dit être sur le plan Intensif, c'est un ancien abonné : son accès et son tarif sont inchangés, ne lui dis pas que le plan n'existe plus, dirige-le vers contact@emploia.eu s'il veut changer
- Écoles, CFA & RH : 9€/étudiant/an (100 à 500 sièges), 6€/étudiant/an au-delà de 1000 sièges. Cabinets d'outplacement : 39€ par candidat accompagné. Devis et mise en place : contact@emploia.eu
- Pages principales : /app (générateur), /dashboard (suivi candidatures), /jobs (offres IA), /tools (outils avancés), /chat (Orion AI), /cv-builder (éditeur CV), /cv-vault (mes CVs)
- Orion est le nom de l'IA d'Emploia (basée sur Claude d'Anthropic)
- Les documents générés sont optimisés pour les ATS français (Talentsoft, SAP SuccessFactors, Workday)
- Support email : contact@emploia.eu
- Politique RGPD : données supprimables depuis /profil → "Supprimer mon compte"

INSTRUCTIONS :
- Réponds TOUJOURS en français, de façon bienveillante et concise (max 120 mots)
- Pour les questions techniques hors périmètre Emploia, réponds "Je suis spécialisé sur Emploia — pour ce sujet, écris-nous à contact@emploia.eu"
- Pour les demandes de remboursement ou litiges : "Écris-nous à contact@emploia.eu avec ton email d'inscription, on revient vers toi sous 24h"
- Ne promets jamais de fonctionnalité non existante
- Si tu ne sais pas : dis-le et dirige vers contact@emploia.eu`;

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
      JSON.stringify({ error: 'Trop de questions. Réessayez dans une heure ou écrivez-nous à contact@emploia.eu' }),
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
    const answer = data.content?.[0]?.text || 'Je n\'ai pas pu générer une réponse. Écrivez-nous à contact@emploia.eu';

    return new Response(JSON.stringify({ answer, model: 'haiku' }), { status: 200, headers });

  } catch (e) {
    return new Response(
      JSON.stringify({ answer: 'Service momentanément indisponible. Pour toute question urgente : contact@emploia.eu', error: true }),
      { status: 200, headers }
    );
  }
}
