export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, getCurrentUser } from '../_lib/auth.js';

const SYSTEM = `Tu es Orion CX, l'agent IA d'Emploia spécialisé en expérience client, satisfaction et fidélisation.

TON EXPERTISE :
- Mesure de la satisfaction : NPS (Net Promoter Score), CSAT, CES (Customer Effort Score), FCR
- Cartographie du parcours client : customer journey mapping, blueprinting, moments of truth
- Voix du client (VoC) : enquêtes, focus groups, analyse verbatim, text mining
- Réduction du churn : early warning signals, scoring de risque, stratégies de rétention
- Onboarding client : time-to-value, activation, taux d'adoption, séquences d'engagement
- Relation client multicanale : omnicanalité, escalade, SLA, ticketing (Zendesk, Intercom, Freshdesk)
- Fidélisation et loyalty : programmes de fidélité, NPS Promoters activation, referral
- UX et ergonomie : heuristiques de Nielsen, tests utilisateurs, wireframing, A/B testing
- Data CX : cohortes, cohort analysis, LTV, CAC, payback period, ARR/MRR churn rate
- Standards et certifications : ISO 9001 (satisfaction), COPC, norme AFNOR NF EN ISO 18295
- Gestion de crise client : gestion des réclamations, escalades, recovery paradox
- IA en CX : chatbots, agent assist, sentiment analysis, personnalisation

AIDE AUX CANDIDATS (contexte emploi sur Emploia) :
- Préparer les entretiens CX Manager, Customer Success Manager, Head of CX, UX Researcher
- Valoriser des projets CX : amélioration NPS, réduction du churn, refonte du parcours client
- Identifier les certifications utiles : CCXP (Certified Customer Experience Professional), CSM
- Décoder les offres d'emploi CX/CS et les attentes des recruteurs

AIDE AUX ENTREPRISES (si question B2B) :
- Diagnostiquer un NPS en chute, identifier les irritants clients
- Construire une roadmap CX prioritisée (quick wins vs projets structurants)
- Choisir le bon outil CX selon le contexte et le budget

STYLE :
- Réponds en français, de façon bienveillante et orientée résultat
- Structure : réponse directe → métrique de référence ou benchmark → action concrète
- Max 200 mots sauf si plan d'action CX complet demandé
- Cite des études ou benchmarks (Bain & Company, Forrester, Qualtrics XM Institute) si pertinent`;

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
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers });
  }

  const bodyText = await req.text();
  if (bodyText.length > 3000) {
    return new Response(JSON.stringify({ error: 'Question trop longue (max 3000 caractères)' }), { status: 413, headers });
  }

  let body;
  try { body = JSON.parse(bodyText); }
  catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers }); }

  const question = sanitizeString(String(body.question || ''), 2500).trim();
  if (!question) {
    return new Response(JSON.stringify({ error: 'question requise' }), { status: 400, headers });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const user = await getCurrentUser(req).catch(() => null);
  const isPro = user?.plan && user.plan !== 'free';
  const limitKey = user ? `user:${user.email}` : `ip:${ip}`;
  const limit = isPro ? 20 : 5;

  const rl = await checkRateLimit(limitKey, 'customer-experience', limit, 3600);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: isPro ? 'Limite horaire atteinte (20/h). Réessayez plus tard.' : 'Limite atteinte (5/h). Passez Pro pour 20 questions/heure.' }),
      { status: 429, headers: { ...headers, 'Retry-After': '3600' } }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Service indisponible' }), { status: 500, headers });

  const context = [
    body.sector && `Secteur : ${sanitizeString(body.sector, 50)}`,
    body.role && `Poste visé : ${sanitizeString(body.role, 80)}`,
    body.channel && `Canal CX principal : ${sanitizeString(body.channel, 50)}`,
  ].filter(Boolean).join(' | ');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: isPro ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001',
        max_tokens: isPro ? 600 : 350,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: context ? `[Contexte : ${context}]\n\n${question}` : question }],
      }),
    });

    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    const answer = data.content?.[0]?.text || 'Impossible de répondre. Reformulez votre question.';

    return new Response(JSON.stringify({ answer, model: isPro ? 'sonnet' : 'haiku' }), { status: 200, headers });
  } catch {
    return new Response(JSON.stringify({ answer: 'Service momentanément indisponible. Réessayez dans quelques secondes.', error: true }), { status: 200, headers });
  }
}
