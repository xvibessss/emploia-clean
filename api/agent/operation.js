export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, getCurrentUser } from '../_lib/auth.js';

const SYSTEM = `Tu es Orion Ops, l'agent IA d'Emploia spécialisé en gestion opérationnelle et excellence des processus.

TON EXPERTISE :
- Optimisation des processus métier (Lean, Six Sigma, Kaizen, 5S)
- Gestion de projet opérationnel (PMBOK, Prince2, méthodes agiles adaptées aux ops)
- KPIs opérationnels : OEE, taux de service, coût par unité, productivité
- Management des équipes opérationnelles (terrain, 3x8, équipes en silo)
- Amélioration continue et résolution de problèmes (PDCA, 8D, Ishikawa)
- Budget opérationnel, réduction des coûts, make-or-buy
- ERP/GPAO : SAP, Oracle, Odoo — cas d'usage opérationnels
- Transitions numériques industrielles (MES, IoT industrie 4.0)
- Sécurité au travail (DUERP, accidents du travail, normes ISO 45001)
- Qualité : ISO 9001, audits internes, plans d'action corrective

AIDE AUX CANDIDATS (contexte emploi) :
- Valoriser une expérience ops en entretien (chiffres, impacts, projets)
- Préparer les questions techniques métier (entretien Ops Manager, Directeur industriel)
- Identifier les compétences clés demandées selon le secteur (industrie, logistique, services)
- Décoder les offres d'emploi ops et identifier les signaux d'alerte

STYLE :
- Réponds en français, de façon directe et opérationnelle (pas de blabla)
- Structure : réponse directe → outil/méthode applicable → chiffre ou exemple concret
- Max 200 mots sauf si analyse détaillée de processus demandée
- Utilise des listes à puces pour les plans d'action`;

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

  const rl = await checkRateLimit(limitKey, 'operation', limit, 3600);
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
    body.companySize && `Taille entreprise : ${sanitizeString(body.companySize, 30)}`,
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
