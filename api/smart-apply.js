export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, withTimeout } from './_lib/auth.js';

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
  const rl = await checkRateLimit(`ip:${ip}`, 'smart-apply', 10, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes. Réessayez dans 1 heure.' }), { status: 429, headers: H });

  const bodyText = await req.text();
  if (bodyText.length > 30000) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers: H });
  let body;
  try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

  const jobTitle       = sanitizeString(body.jobTitle       || '', 200);
  const company        = sanitizeString(body.company        || '', 200);
  const jobDescription = sanitizeString(body.jobDescription || '', 4000);
  const userProfile    = sanitizeString(body.userProfile    || '', 3000);

  if (!jobTitle && !jobDescription) return new Response(JSON.stringify({ error: 'Offre requise' }), { status: 400, headers: H });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Service indisponible' }), { status: 500, headers: H });

  const prompt = `Tu es un expert RH et rédacteur professionnel spécialisé dans le marché français de l'emploi. Génère un pack candidature complet et personnalisé.

OFFRE D'EMPLOI :
Poste : ${jobTitle}
Entreprise : ${company || 'Non précisée'}
${jobDescription ? `Description : ${jobDescription}` : '(description non disponible)'}

PROFIL CANDIDAT :
${userProfile || 'Profil non renseigné — génère un contenu générique professionnel adapté au poste, à compléter par le candidat.'}

Réponds UNIQUEMENT en JSON valide sans markdown ni backtick ni commentaire :
{
  "coverLetter": "Lettre de motivation complète (3 paragraphes, ~200 mots, ton professionnel et chaleureux, style français, commence par 'Madame, Monsieur,' et termine par une formule de politesse complète)",
  "cvBullets": ["Réalisation ou compétence clé 1 (format: verbe d'action + résultat quantifié si possible)", "Réalisation 2", "Réalisation 3", "Réalisation 4"],
  "skills": ["Compétence technique 1 à mettre en avant", "Compétence 2", "Compétence 3", "Soft skill 1", "Soft skill 2"],
  "questions": [
    {"q": "Question d'entretien probable 1 ?", "a": "Réponse modèle en 3-4 phrases avec méthode STAR si applicable, adaptée au contexte français."},
    {"q": "Question difficile probable 2 ?", "a": "Réponse modèle structurée."},
    {"q": "Question sur la motivation 3 ?", "a": "Réponse modèle montrant l'alignement avec l'entreprise."}
  ],
  "pitch": "Pitch d'introduction percutant en 2 phrases pour débuter l'entretien, qui résume le profil et la valeur ajoutée."
}`;

  try {
    const res = await withTimeout(fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      }),
    }), 35000);

    if (!res.ok) return new Response(JSON.stringify({ error: 'Erreur API' }), { status: 502, headers: H });

    const data = await res.json();
    const text = data.content?.[0]?.text || '';

    let result;
    try { result = JSON.parse(text); }
    catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) try { result = JSON.parse(m[0]); } catch {}
    }

    if (!result?.coverLetter) return new Response(JSON.stringify({ error: 'Réponse invalide' }), { status: 500, headers: H });
    return new Response(JSON.stringify(result), { status: 200, headers: H });

  } catch (err) {
    console.error('smart-apply error:', err);
    return new Response(JSON.stringify({ error: 'Erreur réseau' }), { status: 500, headers: H });
  }
}
