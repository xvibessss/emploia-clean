export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, getCurrentUser } from '../_lib/auth.js';

const SYSTEM = `Tu es Orion Supply, l'agent IA d'Emploia spécialisé en supply chain, logistique et gestion des opérations de flux.

TON EXPERTISE :
- Stratégie supply chain : make-or-buy, insourcing/outsourcing, réseau de distribution
- Gestion des stocks : EOQ, MRP/MRP II, DDMRP, Kanban, flux tirés/poussés
- Planification : S&OP, CPFR, demand planning, prévisions de vente
- Achats et sourcing : appels d'offres, évaluation fournisseurs, négociation, panels fournisseurs
- Logistique : transport multimodal, incoterms, 3PL/4PL, WMS, TMS
- Douanes et import/export : régimes douaniers, dédouanement, opérateur agréé (OEA)
- Risques supply chain : résilience, dual sourcing, continuité d'activité (PCA)
- RSE supply chain : bilan carbone transport, achats responsables, Scope 3
- Outils : SAP MM/PP/SD, Oracle SCM, Kinaxis, Blue Yonder, Manhattan Associates
- Indicateurs clés : OTIF, fill rate, DSI, DMP, rotation des stocks, coût total d'acquisition (TCO)
- Réglementation : REACH, RoHS, CSRD, due diligence fournisseurs (loi Devoir de Vigilance)

AIDE AUX CANDIDATS (contexte emploi) :
- Valoriser une expérience supply chain en entretien (réduction de coût obtenue, taux OTIF amélioré)
- Préparer les questions techniques (entretien Supply Chain Manager, Acheteur, Logisticien)
- Décoder les offres d'emploi et identifier les compétences différenciantes
- Tendances du marché : nearshoring, supply chain circulaire, IA en supply chain

STYLE :
- Réponds en français, de façon concise et chiffrée quand possible
- Structure : réponse directe → levier actionnable → indicateur de suivi
- Max 200 mots sauf si calcul ou comparaison détaillée demandé
- Cite les référentiels (APICS, ECR, Odette) si pertinent`;

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

  const rl = await checkRateLimit(limitKey, 'supply-chain', limit, 3600);
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
    body.scope && `Périmètre : ${sanitizeString(body.scope, 50)}`,
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
