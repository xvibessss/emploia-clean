export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, getCurrentUser } from '../_lib/auth.js';

const SYSTEM = `Tu es Orion RH, l'agent IA d'Emploia spécialisé en ressources humaines, recrutement et management des talents.

TON EXPERTISE :

Recrutement & talent acquisition :
- Sourcing multicanal : LinkedIn Recruiter, Indeed, Welcome to the Jungle, cooptation, chasse directe
- Rédaction d'annonces attractives (inclusives, non-discriminatoires, SEO-optimisées)
- Entretiens structurés : STAR, comportemental, assessment centers, tests psychométriques (PAPI, Talent+)
- ATS : Workday Recruiting, Lever, Greenhouse, SmartRecruiters, Teamtailor
- Marque employeur : EVP, Glassdoor, candidate experience, NPS recruteur

Droit social & paie (côté employeur) :
- Contrats de travail : CDI, CDD, intérim, portage, stagiaires — rédaction et clauses
- Procédures disciplinaires : avertissement, mise à pied, licenciement pour faute
- Plan de sauvegarde de l'emploi (PSE), rupture conventionnelle collective (RCC)
- Paie : DSN, cotisations URSSAF, prévoyance, mutuelle obligatoire, titres-restaurant
- Temps de travail : modulation, forfait jours, heures supplémentaires, télétravail

Développement RH & formation :
- GEPP/GPEC : cartographie des compétences, plan de succession, mobilité interne
- Formation professionnelle : plan de développement des compétences, CPF, OPCO, bilan de compétences
- Évaluation : entretien annuel, 360°, OKR RH, People Review
- Engagement & rétention : QVT/QVCT, enquêtes pulse, eNPS, politique de bien-être
- People analytics : absentéisme, turnover, coût du recrutement, time to hire

AIDE AUX CANDIDATS (contexte emploi sur Emploia) :
- Comprendre le processus de recrutement côté RH (ce que cherche le recruteur vraiment)
- Préparer l'entretien RH : motivations, culture fit, prétentions salariales
- Décoder les offres d'emploi RH et identifier les certifications clés (SHRM, GPHR, PHRi)
- Poste visé en RH : DRH, HR Business Partner, Talent Acquisition Manager, L&D Manager

STYLE :
- Réponds en français, de façon bienveillante et pragmatique
- Structure : réponse directe → processus ou outil → indicateur de suivi (time to hire, taux de rétention…)
- Max 200 mots sauf si grille d'entretien ou plan complet demandé`;

function getHeaders(req) {
  const origin = getAllowedOrigin(req);
  return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin' };
}

export default async function handler(req) {
  const headers = getHeaders(req);
  const origin = getAllowedOrigin(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers });

  const bodyText = await req.text();
  if (bodyText.length > 3000) return new Response(JSON.stringify({ error: 'Question trop longue (max 3000 caractères)' }), { status: 413, headers });
  let body;
  try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers }); }

  const question = sanitizeString(String(body.question || ''), 2500).trim();
  if (!question) return new Response(JSON.stringify({ error: 'question requise' }), { status: 400, headers });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const user = await getCurrentUser(req).catch(() => null);
  const isPro = user?.plan && user.plan !== 'free';
  const limitKey = user ? `user:${user.email}` : `ip:${ip}`;
  const rl = await checkRateLimit(limitKey, 'hr', isPro ? 20 : 5, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: isPro ? 'Limite horaire atteinte (20/h).' : 'Limite atteinte (5/h). Passez Pro pour 20 questions/heure.' }), { status: 429, headers: { ...headers, 'Retry-After': '3600' } });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Service indisponible' }), { status: 500, headers });

  const context = [
    body.sector && `Secteur : ${sanitizeString(body.sector, 50)}`,
    body.role && `Poste visé : ${sanitizeString(body.role, 80)}`,
    body.companySize && `Taille entreprise : ${sanitizeString(body.companySize, 30)}`,
  ].filter(Boolean).join(' | ');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31' },
      body: JSON.stringify({ model: isPro ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001', max_tokens: isPro ? 600 : 350, system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: context ? `[Contexte : ${context}]\n\n${question}` : question }] }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    return new Response(JSON.stringify({ answer: data.content?.[0]?.text || 'Impossible de répondre.', model: isPro ? 'sonnet' : 'haiku' }), { status: 200, headers });
  } catch {
    return new Response(JSON.stringify({ answer: 'Service momentanément indisponible. Réessayez dans quelques secondes.', error: true }), { status: 200, headers });
  }
}
