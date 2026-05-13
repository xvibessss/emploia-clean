export const config = { runtime: 'edge' };
import { getCurrentUser, incrementGenerations, getGenerationsUsed, FREE_LIMIT, sanitizeString, getAllowedOrigin, checkRateLimit, htmlEscape } from "../_lib/auth.js";

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H_JSON = { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Vary": "Origin" };
  const H_STREAM = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Vary": "Origin" };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...H_JSON, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Méthode non autorisée" }), { status: 405, headers: H_JSON });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'generate-cv', 20, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de générations. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H_JSON, 'Retry-After': '3600' } });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: H_JSON });

  const userRl = await checkRateLimit(`user:${user.email}`, 'generate-cv', 15, 3600);
  if (!userRl.allowed) return new Response(JSON.stringify({ error: 'Limite de génération atteinte. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H_JSON, 'Retry-After': '3600' } });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400, headers: H_JSON }); }

  const jobOffer = sanitizeString(body.jobOffer, 8000);
  const profile = sanitizeString(body.profile, 8000);
  if (!jobOffer || !profile) return new Response(JSON.stringify({ error: "Offre et profil requis" }), { status: 400, headers: H_JSON });

  if (user.plan === "free") {
    const freshCount = await getGenerationsUsed(user.email);
    const used = freshCount !== null ? freshCount : user.generationsUsed;
    if (used >= FREE_LIMIT) return new Response(JSON.stringify({ error: "Limite gratuite atteinte" }), { status: 402, headers: H_JSON });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "Service temporairement indisponible" }), { status: 500, headers: H_JSON });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(40000),
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        stream: true,
        messages: [{
          role: "user",
          content: `Tu es un expert en rédaction de CV professionnels en France.

OFFRE D'EMPLOI:
${jobOffer}

PROFIL DU CANDIDAT:
${profile}

Génère un CV complet et professionnel en français, parfaitement adapté à cette offre. Le CV doit:
- Utiliser les mots-clés exacts de l'offre pour passer les filtres ATS
- Mettre en avant les compétences les plus pertinentes pour le poste
- Être structuré avec ces sections: En-tête (nom, email, téléphone, LinkedIn), Profil/Résumé (3-4 lignes), Expériences professionnelles, Formation, Compétences, Langues
- Utiliser des verbes d'action forts
- Être concis et percutant

Format: texte structuré clair avec des tirets et des sections bien délimitées.`,
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("CV generation error:", res.status, err.slice(0, 200));
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
                const newCount = await incrementGenerations(user);
                await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
                // Send upgrade nudge when free user reaches their last generation
                if (user.plan === 'free' && newCount === FREE_LIMIT) {
                  const resendKey = process.env.RESEND_API_KEY;
                  if (resendKey) {
                    const firstName = htmlEscape((user.name || '').split(' ')[0] || '');
                    const base = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';
                    fetch('https://api.resend.com/emails', {
                      method: 'POST',
                      signal: AbortSignal.timeout(6000),
                      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        from: 'Emploia <noreply@emploia.fr>',
                        to: [user.email],
                        subject: `${firstName ? firstName + ', v' : 'V'}ous avez utilisé vos 5 générations gratuites 🎯`,
                        html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif"><div style="max-width:520px;margin:40px auto;padding:0 20px"><div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden"><div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px"><div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff">Emploia</div></div><div style="padding:32px"><h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 12px">Vos 5 générations gratuites sont épuisées 🎯</h1><p style="color:#475569;line-height:1.6;margin:0 0 16px">Vous avez généré ${FREE_LIMIT} CVs ATS-optimisés. C'est exactement ce que font les candidats qui décrochent 2× plus d'entretiens.</p><div style="background:#f8fafc;border-left:4px solid #6366f1;padding:16px;border-radius:0 10px 10px 0;margin-bottom:24px"><p style="font-size:14px;color:#0f172a;font-weight:700;margin:0 0 8px">Passez Pro et continuez sur votre lancée :</p><div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;align-items:center;gap:10px"><span style="color:#6366f1">♾️</span><span style="font-size:13px;color:#475569">Générations <strong>illimitées</strong> — CV, lettre, score ATS</span></div><div style="display:flex;align-items:center;gap:10px"><span style="color:#6366f1">🎤</span><span style="font-size:13px;color:#475569">Coaching entretien IA illimité</span></div><div style="display:flex;align-items:center;gap:10px"><span style="color:#6366f1">🔔</span><span style="font-size:13px;color:#475569">Alertes emploi jusqu'à 50 offres/jour</span></div></div></div><a href="${base}/#pricing" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;margin-bottom:12px">Démarrer l'essai Pro gratuit — 7 jours →</a><p style="font-size:12px;color:#94a3b8;margin:8px 0 0">0€ aujourd'hui · Annulation en 1 clic · Sans engagement</p></div></div><p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="${base}" style="color:#94a3b8">emploia.fr</a> · <a href="${base}/api/newsletter?unsubscribe=${encodeURIComponent(user.email)}" style="color:#94a3b8">Se désabonner</a></p></div></body></html>`,
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
    console.error("CV generation error:", err);
    return new Response(JSON.stringify({ error: "Erreur lors de la génération" }), { status: 500, headers: H_JSON });
  }
}
