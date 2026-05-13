export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, withTimeout, getCurrentUser } from './_lib/auth.js';

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
  };

  if (req.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers: { ...H, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'company-insights', 15, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });
  const userRl = await checkRateLimit(`user:${user.email}`, 'company-insights', 10, 3600);
  if (!userRl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  const bodyText = await req.text();
  if (bodyText.length > 20000) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers: H });
  let body;
  try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

  const company     = sanitizeString(body.company     || '', 200);
  const jobTitle    = sanitizeString(body.jobTitle    || '', 200);
  const jobDesc     = sanitizeString(body.jobDescription || '', 3000);

  if (!company && !jobDesc) return new Response(JSON.stringify({ error: 'Entreprise ou description requise' }), { status: 400, headers: H });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Service indisponible' }), { status: 500, headers: H });

  const prompt = `Tu es un expert en veille entreprise et conseil RH en France. Analyse cette entreprise et ce poste et fournis des insights actionnables pour un candidat.

ENTREPRISE : ${company || 'Non précisée'}
POSTE : ${jobTitle || 'Non précisé'}
${jobDesc ? `ANNONCE :\n${jobDesc}` : ''}

Réponds UNIQUEMENT en JSON valide (sans markdown, sans backtick) :
{
  "cultureType": "startup agile | scale-up en croissance | grand groupe corporate | PME familiale | ESN/cabinet conseil | autre",
  "cultureDesc": "Description de la culture en 1-2 phrases — déduite de l'annonce et du type d'entreprise.",
  "interviewStyle": "technique | comportemental | cas pratique | mixte | RH classique",
  "interviewProcess": "Processus probable en 2-4 étapes (ex: 'Appel RH 30min → Entretien technique → Entretien manager')",
  "toResearch": ["Point à connaître sur l'entreprise avant l'entretien", "Actualité ou produit récent", "Concurrent ou positionnement marché"],
  "questionsToAsk": ["Question pertinente à poser au recruteur 1", "Question sur l'équipe ou le projet", "Question sur les perspectives d'évolution"],
  "redFlags": ["Signal d'alerte potentiel 1 (optionnel — ne liste que si clairement détectable dans l'annonce)", "Red flag 2"],
  "talkingPoints": ["Point fort à valoriser dans l'entretien pour ce type d'entreprise", "Angle différenciant à mettre en avant"],
  "salaryContext": "Fourchette salariale typique pour ce poste dans ce type d'entreprise en France (ex: '42–55k€ selon expérience'), ou 'Non estimable' si trop peu d'infos."
}`;

  try {
    const res = await withTimeout(fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    }), 25000);

    if (!res.ok) return new Response(JSON.stringify({ error: 'Erreur API' }), { status: 502, headers: H });

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    let result;
    try { result = JSON.parse(text); }
    catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { result = JSON.parse(m[0]); } catch {} }

    if (!result) return new Response(JSON.stringify({ error: 'Réponse invalide' }), { status: 500, headers: H });
    return new Response(JSON.stringify(result), { status: 200, headers: H });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erreur réseau' }), { status: 500, headers: H });
  }
}
