export const config = { runtime: 'edge' };
import { kvGet, kvSet, checkRateLimit, getAllowedOrigin, validateEmail, htmlEscape } from './_lib/auth.js';

const DISPOSABLE = ['mailinator', 'guerrillamail', 'tempmail', 'yopmail', '10minutemail', 'throwam'];

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
    headers: { ...H, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
  });

  if (req.method === 'GET') {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rlUnsub = await checkRateLimit(`ip:${ip}`, 'newsletter-unsub', 10, 3600);
    if (!rlUnsub.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

    const url = new URL(req.url);
    const email = (url.searchParams.get('unsubscribe') || '').toLowerCase().trim().slice(0, 254);
    if (!email || !validateEmail(email))
      return new Response(JSON.stringify({ error: 'Email invalide' }), { status: 400, headers: H });
    const existing = await kvGet('newsletter_subscribers') || [];
    const updated = Array.isArray(existing) ? existing.filter(s => s.email !== email) : [];
    await kvSet('newsletter_subscribers', updated);
    // Return an HTML confirmation page — browser clicks from emails expect HTML, not JSON
    return new Response(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Désabonnement confirmé — Emploia</title><style>body{margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}.box{background:#fff;border-radius:20px;border:1px solid #e2e8f0;padding:48px 40px;max-width:480px;text-align:center}.logo{background:linear-gradient(135deg,#6366f1,#3b82f6);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff;margin-bottom:28px}.icon{font-size:48px;margin-bottom:16px}h1{font-size:22px;font-weight:800;color:#0f172a;margin:0 0 12px}p{color:#475569;line-height:1.6;margin:0 0 28px;font-size:15px}a{display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px;text-decoration:none}</style></head><body><div class="box"><div class="logo">Emploia</div><div class="icon">✅</div><h1>Désabonnement confirmé</h1><p>Votre adresse a bien été retirée de la liste. Vous ne recevrez plus d'emails de notre part.</p><a href="https://emploia.fr">Retour sur Emploia</a></div></body></html>`, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'newsletter', 5, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  const bodyText = await req.text();
  if (bodyText.length > 1000) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers: H });
  let body;
  try { body = JSON.parse(bodyText); }
  catch { return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400, headers: H }); }

  const email = String(body.email || '').toLowerCase().trim().slice(0, 254);
  const source = String(body.source || 'blog').slice(0, 50);
  const jobType = String(body.jobType || '').slice(0, 30);
  const location = String(body.location || '').slice(0, 100);

  if (!email || !validateEmail(email))
    return new Response(JSON.stringify({ error: 'Email invalide' }), { status: 400, headers: H });

  const domain = email.split('@')[1] || '';
  if (DISPOSABLE.some(d => domain.includes(d)))
    return new Response(JSON.stringify({ error: 'Email temporaire non accepté' }), { status: 400, headers: H });

  const existing = await kvGet('newsletter_subscribers') || [];
  if (Array.isArray(existing) && existing.some(s => s.email === email))
    return new Response(JSON.stringify({ ok: true, alreadySubscribed: true }), { status: 200, headers: H });

  const subscriber = {
    email,
    source,
    jobType: jobType || null,
    location: location || null,
    subscribedAt: new Date().toISOString(),
  };

  const updated = [subscriber, ...(Array.isArray(existing) ? existing : [])].slice(0, 10000);
  await kvSet('newsletter_subscribers', updated);

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const year = new Date().getFullYear();
    fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Emploia <noreply@emploia.fr>',
        to: [email],
        subject: 'Vous êtes abonné(e) aux alertes Emploia 📬',
        html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif"><div style="max-width:520px;margin:40px auto;padding:0 20px"><div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden"><div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px"><div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff;letter-spacing:-.5px">Emploia</div></div><div style="padding:32px"><h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 12px">Bienvenue dans la newsletter Emploia 📬</h1><p style="color:#475569;line-height:1.6;margin:0 0 16px">Chaque semaine, vous recevrez une sélection des meilleures offres d'emploi en France${jobType ? ` en <strong>${htmlEscape(jobType)}</strong>` : ''}, ainsi que nos derniers guides et conseils pour booster votre recherche.</p><div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:24px"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 10px">Au programme :</p><div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;align-items:center;gap:10px"><span>🔥</span><span style="font-size:13px;color:#475569">Meilleures offres de la semaine</span></div><div style="display:flex;align-items:center;gap:10px"><span>📚</span><span style="font-size:13px;color:#475569">Nouveaux guides CV & entretien</span></div><div style="display:flex;align-items:center;gap:10px"><span>💰</span><span style="font-size:13px;color:#475569">Données salaires et marché FR</span></div></div></div><a href="https://emploia.fr/jobs" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none">Voir les offres maintenant →</a></div></div><p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${year} Emploia · <a href="https://emploia.fr" style="color:#94a3b8">emploia.fr</a> · <a href="https://emploia.fr/api/newsletter?unsubscribe=${encodeURIComponent(email)}" style="color:#94a3b8">Se désabonner</a></p></div></body></html>`,
      }),
    }).catch(() => {});
  }

  return new Response(JSON.stringify({ ok: true }), { status: 201, headers: H });
}
