export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, getCurrentUser } from '../_lib/auth.js';

const SYSTEM = `Tu es Orion Marketing, l'agent IA d'Emploia spécialisé en marketing, croissance et acquisition.

TON EXPERTISE :

Stratégie marketing :
- Positionnement, segmentation (RFM, personas), ciblage, différenciation
- Marketing mix (4P/7P), go-to-market, pricing strategy (freemium, value-based, penetration)
- Branding : brand equity, architecture de marque, brand guidelines, storytelling
- Analyse compétitive : Five Forces de Porter, SWOT, veille concurrentielle

Marketing digital & acquisition :
- SEO : recherche de mots-clés, optimisation on-page/technique, link building, Core Web Vitals
- SEA/Paid : Google Ads (Search, Display, Shopping, PMax), Meta Ads, LinkedIn Ads, ROAS, CPA cible
- Social media : stratégie de contenu, community management, UGC, influence marketing
- Email marketing : segmentation, A/B testing, séquences de nurture, délivrabilité, ESP (Klaviyo, Brevo)
- Content marketing : SEO content, thought leadership, inbound, pillar pages, topic clusters
- Croissance (Growth) : funnel AARRR, growth loops, product-led growth, referral, viralité

Analytics & performance :
- GA4, GTM, Looker Studio, attribution multi-touch, modèles last-click vs data-driven
- KPIs clés : CAC, LTV, LTV/CAC, MRR, churn rate, activation rate, NPS
- CRO : A/B testing (statistiques), landing page optimization, heatmaps (Hotjar), UX/UI

Marketing B2B vs B2C :
- ABM (Account-Based Marketing), marketing automation (HubSpot, Marketo, Pardot)
- Lead generation, scoring de leads, SLA marketing-sales, pipeline marketing

AIDE AUX CANDIDATS (contexte emploi sur Emploia) :
- Préparer les entretiens : CMO, Growth Manager, Traffic Manager, Content Strategist, Brand Manager
- Valoriser des réalisations marketing chiffrées (CAC réduit de X%, trafic organique +Y%, ROAS de Z)
- Décoder les offres d'emploi marketing et identifier les outils/certifications attendus (Google Ads, Meta Blueprint, HubSpot)
- Tendances : IA générative en marketing, cookieless, privacy-first, zero-party data

STYLE :
- Réponds en français, de façon créative ET data-driven
- Structure : réponse directe → levier actionnable → KPI de mesure
- Max 200 mots sauf si plan de campagne ou stratégie complète demandé
- Cite des benchmarks sectoriels si pertinent (taux d'ouverture email moyen, CPC moyen, etc.)`;

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

  const rl = await checkRateLimit(limitKey, 'marketing', limit, 3600);
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
    body.channel && `Canal principal : ${sanitizeString(body.channel, 50)}`,
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
