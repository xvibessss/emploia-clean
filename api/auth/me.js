export const config = { runtime: 'edge' };
import { getCurrentUser, getAllowedOrigin, checkRateLimit, kvGet, kvSet } from "../_lib/auth.js";

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };

  if (req.method === "OPTIONS") return new Response(null, {
    status: 204, headers: { ...H, "Access-Control-Allow-Methods": "GET, OPTIONS" }
  });
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "Méthode non autorisée" }), { status: 405, headers: H });

  // Light rate limit on /me
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'me', 60, 60);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: H });

  const user = await getCurrentUser(req);
  if (!user) return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: H });

  // Never return passwordHash or salt to client
  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    plan: user.plan || 'free',
    generationsUsed: user.generationsUsed || 0,
    createdAt: user.createdAt,
  };

  // Lazy drip emails — fire async, don't block response
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && user.createdAt && user.email) {
    const daysSince = (Date.now() - new Date(user.createdAt).getTime()) / 86400000;
    const firstName = (user.name || '').split(' ')[0] || 'là';
    const sendDrip = async (key, subject, html) => {
      const fullUser = await kvGet(`user:${user.email}`);
      if (fullUser?.[key]) return;
      await kvSet(`user:${user.email}`, { ...fullUser, [key]: true });
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Emploia <noreply@emploia.fr>', to: [user.email], subject, html }),
      });
    };
    const baseHtml = (title, body) => `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif"><div style="max-width:520px;margin:40px auto;padding:0 20px"><div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden"><div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px"><div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff">Emploia</div></div><div style="padding:32px"><h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 12px">${title}</h1>${body}</div></div><p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="https://emploia.fr" style="color:#94a3b8">emploia.fr</a> · <a href="https://emploia.fr/legal/cgu" style="color:#94a3b8">Se désabonner</a></p></div></body></html>`;
    if (daysSince >= 1 && daysSince < 5) {
      sendDrip('drip1Sent', `${firstName}, vous avez encore 3 générations gratuites 🎁`, baseHtml(
        `${firstName}, votre copilote vous attend`,
        `<p style="color:#475569;line-height:1.6;margin:0 0 20px">Vous avez créé votre compte hier. Vous n'avez pas encore utilisé toutes vos générations gratuites — et c'est dommage, parce qu'Emploia peut faire des trucs impressionnants.</p><p style="color:#475569;line-height:1.6;margin:0 0 20px"><strong>Ce que vous pouvez générer maintenant :</strong></p><div style="display:flex;flex-direction:column;gap:10px;margin-bottom:28px"><div style="display:flex;align-items:center;gap:12px"><span style="font-size:20px">📄</span><span style="color:#475569;font-size:13px"><strong>CV ATS-optimisé</strong> — Collez une offre, obtenez un CV en 30s qui passe les filtres</span></div><div style="display:flex;align-items:center;gap:12px"><span style="font-size:20px">✉️</span><span style="color:#475569;font-size:13px"><strong>Lettre de motivation</strong> — Personnalisée à l'offre, sans effort</span></div><div style="display:flex;align-items:center;gap:12px"><span style="font-size:20px">🎯</span><span style="color:#475569;font-size:13px"><strong>Score ATS</strong> — Collez votre CV existant, obtenez un score et des conseils</span></div></div><a href="https://emploia.fr/app" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none">Générer maintenant →</a>`
      )).catch(() => {});
    } else if (daysSince >= 3 && daysSince < 7) {
      sendDrip('drip3Sent', `Comment se passe votre recherche, ${firstName} ? 🤝`, baseHtml(
        `Votre recherche avance ?`,
        `<p style="color:#475569;line-height:1.6;margin:0 0 20px">3 jours depuis votre inscription sur Emploia. On espère que vous avez déjà décroché quelques entretiens !</p><p style="color:#475569;line-height:1.6;margin:0 0 20px">Si vous êtes encore en recherche, voici ce que d'autres candidats ont utilisé cette semaine :</p><div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:24px"><p style="font-size:13px;color:#1e293b;font-style:italic;margin:0 0 8px">"J'ai postulé chez 3 entreprises avec Emploia la première semaine. 2 rappels. Mon score ATS est passé de 41 à 94."</p><p style="font-size:11px;color:#94a3b8;margin:0">— Sophie M., Chargée com' digitale</p></div><p style="color:#475569;font-size:13px;margin:0 0 24px">Passez Pro pour des <strong>générations illimitées</strong> — 7 jours d'essai gratuits, 0€ aujourd'hui.</p><a href="https://emploia.fr/#pricing" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none">Voir les offres Pro →</a>`
      )).catch(() => {});
    } else if (daysSince >= 6 && daysSince < 10) {
      sendDrip('drip6Sent', `⏰ Dernière chance — votre essai Pro expire bientôt`, baseHtml(
        `Votre accès complet expire dans 24h`,
        `<p style="color:#475569;line-height:1.6;margin:0 0 20px">Votre période d'essai Pro se termine bientôt, ${firstName}. Après ça, vous repassez en mode gratuit.</p><p style="color:#475569;line-height:1.6;margin:0 0 20px">Pour continuer à générer des CVs illimités, coacher vos entretiens et optimiser votre LinkedIn — restez Pro.</p><p style="color:#475569;line-height:1.6;margin:0 0 24px">Si la recherche d'emploi est encore en cours, <strong>9€/mois c'est probablement le meilleur investissement que vous puissiez faire</strong>. Un seul entretien décroché = plusieurs mois de salaire.</p><a href="https://emploia.fr/#pricing" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none">Continuer avec Pro →</a><p style="color:#94a3b8;font-size:12px;margin:20px 0 0">Annulation en 1 clic. Aucun engagement.</p>`
      )).catch(() => {});
    }
  }

  return new Response(JSON.stringify({ user: safeUser }), { status: 200, headers: H });
}
