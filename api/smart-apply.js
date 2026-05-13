export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, withTimeout, getCurrentUser } from './_lib/auth.js';

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

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: H });
  if (!user.plan || user.plan === 'free') return new Response(JSON.stringify({ error: 'Abonnement Pro requis' }), { status: 403, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'smart-apply', 10, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });
  const userRl = await checkRateLimit(`user:${user.email}`, 'smart-apply', 8, 3600);
  if (!userRl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

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

  const prompt = `Tu es un expert RH senior et rédacteur de candidatures pour le marché français. Ta mission : générer un pack candidature hyper-personnalisé qui maximise les chances d'obtenir un entretien.

═══ OFFRE ═══
Poste : ${jobTitle}
Entreprise : ${company || 'Non précisée'}
${jobDescription ? `Annonce :\n${jobDescription}` : '(description non disponible — génère un contenu adapté au poste)'}

═══ PROFIL ═══
${userProfile || 'Non renseigné — génère un contenu professionnel générique adapté au poste, avec des placeholders [À COMPLÉTER].'}

═══ RÈGLES ═══
- Lettre : 3 paragraphes clairs, ~220 mots, style professionnel français, sans flatteries inutiles
- Commence par "Madame, Monsieur," et termine par "Veuillez agréer, Madame, Monsieur, l'expression de mes salutations distinguées."
- Mentionne explicitement l'entreprise${company ? ` "${company}"` : ''} et le poste dans la lettre
- CV bullets : verbes d'action forts au présent/passé, résultats quantifiés si possible
- Questions d'entretien : les plus probables pour CE poste, réponses STAR concrètes
- Objet email : court, percutant, inclut le titre du poste
- Extrais les mots-clés ATS importants de l'offre dans atsKeywords

Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de backtick) :
{
  "coverLetter": "...",
  "cvBullets": ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5"],
  "skills": ["compétence 1", "compétence 2", "compétence 3", "soft skill 1", "soft skill 2"],
  "questions": [
    {"q": "...", "a": "..."},
    {"q": "...", "a": "..."},
    {"q": "...", "a": "..."},
    {"q": "...", "a": "..."}
  ],
  "pitch": "...",
  "emailSubject": "Candidature — ${jobTitle}${company ? ' chez ' + company : ''}",
  "atsKeywords": ["mot-clé 1", "mot-clé 2", "mot-clé 3", "mot-clé 4", "mot-clé 5"]
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
