export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin } from './_lib/auth.js';

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

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'match', 20, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes. Réessayez dans 1 heure.' }), { status: 429, headers: H });

  const bodyText = await req.text();
  if (bodyText.length > 20000) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers: H });
  let body;
  try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

  const jobTitle       = sanitizeString(body.jobTitle       || '', 200);
  const jobDescription = sanitizeString(body.jobDescription || '', 3000);
  const userProfile    = sanitizeString(body.userProfile    || '', 2000);

  if (!jobTitle && !jobDescription) return new Response(JSON.stringify({ error: 'Offre requise' }), { status: 400, headers: H });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Service indisponible' }), { status: 500, headers: H });

  const prompt = `Tu es un expert RH. Analyse la compatibilité entre ce profil candidat et cette offre d'emploi.

OFFRE :
Poste : ${jobTitle}
${jobDescription ? `Description : ${jobDescription}` : ''}

PROFIL CANDIDAT :
${userProfile || 'Aucun profil renseigné — analyse le poste uniquement et donne un score neutre entre 60 et 75.'}

Réponds UNIQUEMENT en JSON valide sans markdown ni backtick :
{"score":82,"verdict":"Bon profil","pros":["Compétence alignée","Expérience pertinente"],"cons":["Point à renforcer"],"tip":"Conseil actionnable en une phrase courte"}

Règles : score entre 50 et 97. verdict parmi : "Excellent match", "Bon profil", "Profil partiel", "Profil éloigné".`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) return new Response(JSON.stringify({ error: 'Erreur API' }), { status: 502, headers: H });

    const data = await res.json();
    const text = data.content?.[0]?.text || '';

    let result;
    try { result = JSON.parse(text); }
    catch {
      const m = text.match(/\{[\s\S]*?\}/);
      if (m) try { result = JSON.parse(m[0]); } catch {}
    }

    if (!result?.score) return new Response(JSON.stringify({ error: 'Réponse invalide' }), { status: 500, headers: H });
    return new Response(JSON.stringify(result), { status: 200, headers: H });

  } catch (err) {
    console.error('match-score error:', err);
    return new Response(JSON.stringify({ error: 'Erreur réseau' }), { status: 500, headers: H });
  }
}
