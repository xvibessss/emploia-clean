export const config = { runtime: 'edge' };
import { getCurrentUser, claimFreeGeneration, FREE_LIMIT, sanitizeString, getAllowedOrigin, checkRateLimit, htmlEscape } from "../_lib/auth.js";

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H_JSON = { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Vary": "Origin" };
  const H_STREAM = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Vary": "Origin" };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...H_JSON, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Méthode non autorisée" }), { status: 405, headers: H_JSON });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'generate-lm', 20, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de générations. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H_JSON, 'Retry-After': '3600' } });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: H_JSON });

  const userRl = await checkRateLimit(`user:${user.email}`, 'generate-lm', 15, 3600);
  if (!userRl.allowed) return new Response(JSON.stringify({ error: 'Limite de génération atteinte. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H_JSON, 'Retry-After': '3600' } });

  const bodyText = await req.text();
  if (bodyText.length > 20000) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers: H_JSON });
  let body;
  try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400, headers: H_JSON }); }

  const jobOffer = sanitizeString(body.jobOffer, 8000);
  const profile = sanitizeString(body.profile, 8000);
  if (!jobOffer || !profile) return new Response(JSON.stringify({ error: "Offre et profil requis" }), { status: 400, headers: H_JSON });

  const profileHints = {
    'jeune-diplome': 'Le candidat est un jeune diplômé. Mets en avant sa formation, ses projets académiques et sa motivation.',
    'experience': 'Le candidat est en poste et cherche discrètement. Valorise ses réalisations chiffrées et son expertise.',
    'reconversion': 'Le candidat est en reconversion. Montre les compétences transférables et l\'enthousiasme pour le nouveau domaine.',
    'recherche': 'Le candidat est en recherche active. Optimise la lettre pour un impact maximum dès la première lecture.',
  };
  const profileHint = profileHints[body.profileType] || '';

  const gen = await claimFreeGeneration(user);
  if (!gen.allowed) return new Response(JSON.stringify({ error: "Limite gratuite atteinte" }), { status: 402, headers: H_JSON });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "Service temporairement indisponible" }), { status: 500, headers: H_JSON });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(40000),
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-beta": "prompt-caching-2024-07-31" },
      body: JSON.stringify({
        model: user.plan === 'free' ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6',
        max_tokens: user.plan === 'free' ? 4096 : 8192,
        stream: true,
        system: [{ type: 'text', text: "Tu es un expert senior en rédaction de lettres de motivation pour le marché français avec 15 ans d'expérience RH et cabinet de recrutement. Tu crées des lettres de motivation qui se distinguent : accroche mémorable (jamais générique), démonstration de valeur concrète avec chiffres, connaissance fine de l'entreprise, alignement parfait avec les termes exacts de l'offre. Règles absolues : entre 300 et 420 mots, vouvoiement, 3 paragraphes de fond (accroche/compétences alignées/motivation projet d'entreprise), formule de politesse professionnelle française. La lettre doit donner l'impression d'avoir été écrite spécifiquement pour CE recruteur et CE poste — jamais copier-coller.", cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: "user",
          content: user.plan === 'free'
            ? `OFFRE D'EMPLOI:\n${jobOffer}\n\nPROFIL DU CANDIDAT:\n${profile}${profileHint ? `\n\nCONTEXTE CANDIDAT: ${profileHint}` : ''}\n\nGénère une lettre de motivation professionnelle et personnalisée en français. Elle doit:\n- Commencer par les coordonnées du candidat, la date, les coordonnées de l'entreprise et l'objet\n- Avoir une accroche percutante qui montre que tu connais l'entreprise\n- Développer 3 arguments forts qui montrent pourquoi le candidat est parfait pour CE poste\n- Utiliser les termes exacts de l'offre d'emploi\n- Être authentique et ne pas ressembler à une lettre générique\n- Se terminer par une phrase de conclusion professionnelle et une signature\n- Faire entre 300 et 400 mots\n- Utiliser le vouvoiement\n\nCommence directement par la lettre, sans commentaires.`
            : `OFFRE D'EMPLOI:\n${jobOffer}\n\nPROFIL DU CANDIDAT:\n${profile}${profileHint ? `\n\nCONTEXTE CANDIDAT: ${profileHint}` : ''}\n\nGénère une lettre de motivation PREMIUM en français. Structure obligatoire :\n\n**EN-TÊTE** : Coordonnées candidat (prénom nom, ville, email, téléphone) | Date | Coordonnées entreprise | Objet percutant (pas "Candidature au poste de" — trouve quelque chose d'original)\n\n**ACCROCHE** (1 paragraphe, 2-3 phrases) : Commence par un fait, chiffre ou observation sur l'entreprise/secteur qui prouve que tu la connais. Pas "Je me permets de vous adresser". Incite à lire la suite.\n\n**CORPS** (2-3 paragraphes) : \n- Paragraphe 1 : Ta valeur ajoutée principale pour CE poste, avec réalisation chiffrée\n- Paragraphe 2 : Compétences clés alignées avec les 3 mots-clés critiques de l'offre\n- Paragraphe 3 : Motivation pour CETTE entreprise spécifiquement (culture, projet, ambition)\n\n**CONCLUSION** : Proposition d'entretien avec disponibilité, remerciement, formule de politesse complète\n\nContraintes : 320-400 mots. Vouvoiement. Aucun cliché ("dynamique", "motivé", "rigoureux"). Chaque phrase apporte de la valeur. Commence directement par la lettre.`,
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Cover letter error:", res.status, err.slice(0, 200));
      return new Response(JSON.stringify({ error: "Erreur lors de la génération" }), { status: 502, headers: H_JSON });
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                await writer.write(encoder.encode(`data: ${JSON.stringify({ chunk: parsed.delta.text })}\n\n`));
              }
              if (parsed.type === 'message_stop') {
                await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
                if (gen.count === FREE_LIMIT) {
                  const resendKey = process.env.RESEND_API_KEY;
                  if (resendKey) {
                    const firstNameRaw = (user.name || '').replace(/[\r\n]/g, ' ').split(' ')[0] || '';
                    const base = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';
                    fetch('https://api.resend.com/emails', {
                      method: 'POST',
                      signal: AbortSignal.timeout(6000),
                      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        from: 'Emploia <noreply@emploia.fr>',
                        to: [user.email],
                        subject: `${firstNameRaw ? firstNameRaw + ', v' : 'V'}ous avez utilisé vos 5 générations gratuites 🎯`,
                        html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif"><div style="max-width:520px;margin:40px auto;padding:0 20px"><div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden"><div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px"><div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff">Emploia</div></div><div style="padding:32px"><h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 12px">Vos 5 générations gratuites sont épuisées 🎯</h1><p style="color:#475569;line-height:1.6;margin:0 0 16px">Vous avez généré ${FREE_LIMIT} documents ATS-optimisés. C'est exactement ce que font les candidats qui décrochent 2× plus d'entretiens.</p><div style="background:#f8fafc;border-left:4px solid #6366f1;padding:16px;border-radius:0 10px 10px 0;margin-bottom:24px"><p style="font-size:14px;color:#0f172a;font-weight:700;margin:0 0 8px">Passez Pro et continuez sur votre lancée :</p><div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;align-items:center;gap:10px"><span style="color:#6366f1">♾️</span><span style="font-size:13px;color:#475569">Générations <strong>illimitées</strong> — CV, lettre, score ATS</span></div><div style="display:flex;align-items:center;gap:10px"><span style="color:#6366f1">🎤</span><span style="font-size:13px;color:#475569">Coaching entretien IA illimité</span></div><div style="display:flex;align-items:center;gap:10px"><span style="color:#6366f1">🔔</span><span style="font-size:13px;color:#475569">Alertes emploi avancées</span></div></div></div><a href="${base}/#pricing" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none">Démarrer l'essai Pro gratuit — 7 jours →</a><p style="font-size:12px;color:#94a3b8;margin:8px 0 0">0€ aujourd'hui · Annulation en 1 clic</p></div></div><p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="${base}/api/newsletter?unsubscribe=${encodeURIComponent(user.email)}" style="color:#94a3b8">Se désabonner</a></p></div></body></html>`,
                      }),
                    }).catch(() => {});
                  }
                }
              }
            } catch {}
          }
        }
      } catch (err) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ error: 'Erreur de génération' })}\n\n`)).catch(() => {});
      } finally {
        await writer.close().catch(() => {});
      }
    })();

    return new Response(readable, { status: 200, headers: H_STREAM });
  } catch (err) {
    console.error("Cover letter error:", err);
    return new Response(JSON.stringify({ error: "Erreur lors de la génération" }), { status: 500, headers: H_JSON });
  }
}
