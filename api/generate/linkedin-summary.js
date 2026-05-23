export const config = { runtime: 'edge' };
import { checkRateLimit, sanitizeString, getAllowedOrigin, withTimeout, getCurrentUser, incrementGenerations, FREE_LIMIT, htmlEscape } from '../_lib/auth.js';

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

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'linkedin-summary', 20, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });
  const userRl = await checkRateLimit(`user:${user.email}`, 'linkedin-summary', 15, 3600);
  if (!userRl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  const bodyText = await req.text();
  if (bodyText.length > 8000) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers: H });
  let body;
  try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

  const profile     = sanitizeString(body.profile     || '', 4000);
  const targetRole  = sanitizeString(body.targetRole  || '', 200);
  const tone        = body.tone === 'expert' ? 'expert et sobre' : body.tone === 'creative' ? 'créatif et humain' : 'professionnel et accessible';

  if (!profile) return new Response(JSON.stringify({ error: 'Profil requis' }), { status: 400, headers: H });

  let freeNewCount = null;
  if (user.plan === 'free') {
    freeNewCount = await incrementGenerations(user);
    if (freeNewCount !== null && freeNewCount > FREE_LIMIT) {
      return new Response(JSON.stringify({ error: 'Limite gratuite atteinte' }), { status: 402, headers: H });
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Service indisponible' }), { status: 500, headers: H });

  const prompt = `Tu es un expert en personal branding et en optimisation de profils LinkedIn pour le marché français. Génère un profil LinkedIn percutant.

PROFIL / CV DU CANDIDAT :
${profile}
${targetRole ? `\nPOSTE CIBLE : ${targetRole}` : ''}
TON SOUHAITÉ : ${tone}

Règles LinkedIn :
- Section "À propos" : 3-4 paragraphes, max 2600 caractères, commence par une accroche forte (jamais "Je m'appelle")
- Titre LinkedIn : max 220 caractères, combine rôle + valeur ajoutée + mot-clé principal
- Compétences : les 10 plus recherchées par les recruteurs pour ce profil
- Mots-clés ATS LinkedIn : les termes que les recruteurs tapent vraiment dans la barre de recherche

Réponds UNIQUEMENT en JSON valide :
{
  "about": "Section À propos complète (3-4 paragraphes, accroche forte, expériences clés, valeur ajoutée, call-to-action de fin)",
  "headline": "Titre LinkedIn optimisé (≤220 car.)",
  "skills": ["Compétence 1", "Compétence 2", "Compétence 3", "Compétence 4", "Compétence 5", "Compétence 6", "Compétence 7", "Compétence 8", "Compétence 9", "Compétence 10"],
  "keywords": ["mot-clé recruteur 1", "mot-clé recruteur 2", "mot-clé recruteur 3", "mot-clé recruteur 4", "mot-clé recruteur 5"],
  "tips": ["Conseil pour optimiser davantage le profil 1", "Conseil 2"]
}`;

  try {
    const res = await withTimeout(fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: user.plan === 'free' ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6',
        max_tokens: user.plan === 'free' ? 1500 : 3000,
        system: [{ type: 'text', text: 'Tu es un expert LinkedIn et personal branding avec 10 ans d\'expérience sur le marché français. Tu maîtrises l\'algorithme LinkedIn et les comportements des recruteurs français. Tu génères des profils qui maximisent l\'index de recherche SSI, attirent les InMails et provoquent des clics. Accroche "À propos" mémorable, titre optimisé pour les recherches booléennes, compétences top 10 validées par le marché. Réponds uniquement en JSON valide.', cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: prompt }],
      }),
    }), 25000);

    if (!res.ok) return new Response(JSON.stringify({ error: 'Erreur API' }), { status: 502, headers: H });

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    let result;
    try { result = JSON.parse(text); }
    catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { result = JSON.parse(m[0]); } catch {} }

    if (!result?.about) return new Response(JSON.stringify({ error: 'Réponse invalide' }), { status: 500, headers: H });

    if (user.plan === 'free' && freeNewCount === FREE_LIMIT) {
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        const firstNameRaw = (user.name || '').replace(/[\r\n]/g, ' ').split(' ')[0] || '';
        const base = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';
        fetch('https://api.resend.com/emails', {
          method: 'POST', signal: AbortSignal.timeout(6000),
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Emploia <noreply@emploia.fr>',
            to: [user.email],
            subject: `${firstNameRaw ? firstNameRaw + ', v' : 'V'}ous avez utilisé vos 5 générations gratuites 🎯`,
            html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif"><div style="max-width:520px;margin:40px auto;padding:0 20px"><div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden"><div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px"><div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff">Emploia</div></div><div style="padding:32px"><h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 12px">Vos 5 générations gratuites sont épuisées 🎯</h1><p style="color:#475569;line-height:1.6;margin:0 0 20px">Passez Pro pour des générations illimitées — CV, lettre, résumé LinkedIn, score ATS, coaching entretien.</p><a href="${base}/#pricing" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none">Essai Pro gratuit 7 jours →</a></div></div><p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="${base}/api/newsletter?unsubscribe=${encodeURIComponent(user.email)}" style="color:#94a3b8">Se désabonner</a></p></div></body></html>`,
          }),
        }).catch(() => {});
      }
    }
    return new Response(JSON.stringify(result), { status: 200, headers: H });
  } catch {
    return new Response(JSON.stringify({ error: 'Erreur réseau' }), { status: 500, headers: H });
  }
}
