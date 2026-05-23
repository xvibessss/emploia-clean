export const config = { runtime: 'edge' };
import { getCurrentUser, incrementGenerations, FREE_LIMIT, sanitizeString, getAllowedOrigin, checkRateLimit, withTimeout, htmlEscape } from "../_lib/auth.js";

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Vary": "Origin" };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...H, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Méthode non autorisée" }), { status: 405, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'generate-ats', 20, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de générations. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: H });

  const userRl = await checkRateLimit(`user:${user.email}`, 'generate-ats', 15, 3600);
  if (!userRl.allowed) return new Response(JSON.stringify({ error: 'Limite de génération atteinte. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  const bodyText = await req.text();
  if (bodyText.length > 20000) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers: H });
  let body;
  try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400, headers: H }); }

  const cvText = sanitizeString(body.cvText, 8000);
  const jobOffer = sanitizeString(body.jobOffer, 8000);
  if (!cvText || !jobOffer) {
    return new Response(JSON.stringify({ error: "CV et offre requis" }), { status: 400, headers: H });
  }

  let freeNewCount = null;
  if (user.plan === "free") {
    freeNewCount = await incrementGenerations(user);
    if (freeNewCount !== null && freeNewCount > FREE_LIMIT) {
      return new Response(JSON.stringify({ error: "Limite gratuite atteinte" }), { status: 402, headers: H });
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "Service temporairement indisponible" }), { status: 500, headers: H });

  try {
    const res = await withTimeout(fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: user.plan === 'free' ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6',
        max_tokens: user.plan === 'free' ? 1200 : 2500,
        system: [{ type: "text", text: "Tu es un expert ATS certifié et recruteur senior avec 15 ans d'expérience dans les grandes entreprises françaises. Tu maîtrises SAP SuccessFactors, Talentsoft, Workday, iCIMS et Greenhouse. Tu analyses en profondeur la compatibilité CV/offre selon 5 axes : correspondance mots-clés (orthographe exacte), structure et format ATS-friendly, pertinence des expériences, formation et certifications, softs skills implicites. Tes recommandations sont chirurgicales et actionnables en moins de 10 minutes. Réponds uniquement en JSON valide.", cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          content: user.plan === 'free'
            ? `OFFRE D'EMPLOI:\n${jobOffer}\n\nCV DU CANDIDAT:\n${cvText}\n\nAnalyse ce CV par rapport à cette offre. Réponds UNIQUEMENT en JSON valide (sans markdown, sans backtick) :
{
  "score": 72,
  "bars": [
    {"name": "Mots-clés", "val": 68},
    {"name": "Format", "val": 90},
    {"name": "Expérience", "val": 75},
    {"name": "Compétences", "val": 65},
    {"name": "Lisibilité", "val": 85}
  ],
  "recommendations": ["Intégrez les mots-clés exacts de l'offre", "Quantifiez vos résultats avec des chiffres", "Ajoutez des verbes d'action forts"],
  "keywords": ["mot-clé manquant 1", "mot-clé manquant 2", "mot-clé manquant 3"],
  "strengths": ["Point fort 1", "Point fort 2"],
  "improvements": ["Amélioration 1", "Amélioration 2"]
}

Règles : score entre 40 et 97. recommendations: tableau de 3-5 strings en texte simple (sans HTML). 3-5 items par liste.`
            : `OFFRE D'EMPLOI:\n${jobOffer}\n\nCV DU CANDIDAT:\n${cvText}\n\nAnalyse approfondie de ce CV par rapport à cette offre. Réponds UNIQUEMENT en JSON valide (sans markdown, sans backtick) :
{
  "score": 72,
  "bars": [
    {"name": "Mots-clés", "val": 68},
    {"name": "Format ATS", "val": 90},
    {"name": "Expérience", "val": 75},
    {"name": "Compétences", "val": 65},
    {"name": "Lisibilité", "val": 85}
  ],
  "recommendations": ["Action précise et immédiate à faire — avec le mot-clé exact à ajouter ou la reformulation à effectuer", "Recommandation 2", "Recommandation 3", "Recommandation 4"],
  "keywords": ["mot-clé de l'offre absent du CV 1", "mot-clé 2", "mot-clé 3", "mot-clé 4", "mot-clé 5"],
  "keywordsPresent": ["mot-clé de l'offre présent dans le CV 1", "mot-clé présent 2"],
  "strengths": ["Point fort spécifique 1 — ce qui est bien dans CE CV pour CE poste", "Point fort 2", "Point fort 3"],
  "improvements": ["Amélioration concrète 1 avec exemple de formulation", "Amélioration 2", "Amélioration 3"],
  "atsRisk": ["Risque ATS détecté 1 (ex: tableau, colonne, image)", "Risque 2"],
  "verdict": "Verdict expert en 2 phrases sur les chances réelles de passer le filtre ATS pour ce poste"
}

Règles : score entre 40 et 97. Tous les champs en texte simple sans HTML. Sois chirurgical et spécifique — pas de généralités.`,
        }],
      }),
    }), 30000);

    if (!res.ok) {
      console.error("ATS score error:", res.status);
      return new Response(JSON.stringify({ error: "Erreur lors de la génération" }), { status: 502, headers: H });
    }

    const data = await res.json();
    const text = data.content?.[0]?.type === "text" ? data.content[0].text : "";

    let result;
    try { result = JSON.parse(text); }
    catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { result = JSON.parse(m[0]); } catch {} }

    if (result?.score == null) return new Response(JSON.stringify({ error: "Réponse invalide" }), { status: 500, headers: H });

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
            html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif"><div style="max-width:520px;margin:40px auto;padding:0 20px"><div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden"><div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px"><div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff">Emploia</div></div><div style="padding:32px"><h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 12px">Vos 5 générations gratuites sont épuisées 🎯</h1><p style="color:#475569;line-height:1.6;margin:0 0 20px">Passez Pro pour des générations illimitées — CV, lettre, score ATS, coaching entretien.</p><a href="${base}/#pricing" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none">Essai Pro gratuit 7 jours →</a></div></div><p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="${base}/api/newsletter?unsubscribe=${encodeURIComponent(user.email)}" style="color:#94a3b8">Se désabonner</a></p></div></body></html>`,
          }),
        }).catch(() => {});
      }
    }
    return new Response(JSON.stringify(result), { status: 200, headers: H });
  } catch (err) {
    console.error("ATS score error:", err);
    return new Response(JSON.stringify({ error: "Erreur lors de la génération" }), { status: 500, headers: H });
  }
}
