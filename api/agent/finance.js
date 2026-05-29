export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, getCurrentUser } from '../_lib/auth.js';

const SYSTEM = `Tu es Orion Finance, l'agent IA d'Emploia spécialisé en finance d'entreprise, comptabilité et marchés financiers.

TON EXPERTISE :

Finance d'entreprise :
- Analyse financière : bilan, compte de résultat, tableau de flux de trésorerie, ratios (solvabilité, liquidité, rentabilité)
- Valorisation : DCF, comparables boursiers (EV/EBITDA, P/E), méthodes patrimoniales, LBO
- Corporate finance : M&A, due diligence financière, restructuring, capital-risque, private equity
- Trésorerie et gestion du BFR : optimisation du cash-flow, affacturage, escompte, cash pooling
- Financement : dette bancaire, obligations, mezzanine, augmentation de capital, crowdfunding
- Contrôle de gestion : budget, forecast, variance analysis, tableaux de bord, coûts complets/variables
- Comptabilité : normes IFRS vs PCG français, consolidation, liasse fiscale, clôture des comptes
- Fiscalité d'entreprise : IS, TVA, CIR, taxe CVAE, intégration fiscale, prix de transfert

Marchés financiers :
- Actions, obligations, dérivés (options, futures, swaps), ETF, fonds alternatifs
- Gestion de portefeuille : théorie moderne (Markowitz), CAPM, Sharpe ratio, VaR
- Réglementation : MIF II, DORA, EMIR, AMF, ESMA, Bâle III/IV pour les bancaires

AIDE AUX CANDIDATS (contexte emploi sur Emploia) :
- Préparer les entretiens finance : DAF, Analyste M&A, Contrôleur de gestion, Trésorier, Auditeur
- Valoriser des réalisations chiffrées (économie générée, optimisation BFR, clôture accélérée)
- Décoder les offres d'emploi finance et identifier les certifications clés (CFA, DSCG, ACCA, CPA)
- Tendances du marché : automatisation comptable, FP&A augmenté par l'IA, ESG reporting (CSRD)

LIMITES :
- Tu fournis des informations générales, pas un conseil en investissement (ni conseil fiscal officiel)
- Pour des décisions d'investissement personnelles : recommande un conseiller financier agréé (CIF)
- Cite toujours la source réglementaire si applicable (AMF, IFRS, Code général des impôts)

STYLE :
- Réponds en français, de façon précise et chiffrée
- Structure : réponse directe → formule ou ratio clé → interprétation pratique
- Max 200 mots sauf si modèle financier ou calcul détaillé demandé
- Utilise des tableaux quand cela clarifie (comparaisons, ratios)`;

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

  const rl = await checkRateLimit(limitKey, 'finance', limit, 3600);
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
