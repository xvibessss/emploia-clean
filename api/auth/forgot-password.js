export const config = { runtime: 'edge' };
import { kvGet, kvSet, checkRateLimit, getAllowedOrigin, validateEmail } from '../_lib/auth.js';

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
    headers: { ...H, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
  });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'forgot-password', 3, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de requêtes. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  const bodyText = await req.text();
  if (bodyText.length > 500) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers: H });
  let body;
  try { body = JSON.parse(bodyText); } catch { return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers: H }); }

  const email = (body.email || '').toLowerCase().trim();
  if (!email || !validateEmail(email)) return new Response(JSON.stringify({ error: 'Email invalide' }), { status: 400, headers: H });

  // Always return success — never reveal if email exists
  const user = await kvGet(`user:${email}`);
  const resendKey = process.env.RESEND_API_KEY;

  if (user && resendKey) {
    const token = crypto.randomUUID();
    await kvSet(`reset:${token}`, { email, createdAt: Date.now() }, 3600);

    const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Emploia <noreply@emploia.fr>',
        to: [email],
        subject: 'Réinitialisez votre mot de passe Emploia',
        html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
<div style="max-width:520px;margin:40px auto;padding:0 20px">
  <div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px">
      <div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">Emploia</div>
    </div>
    <div style="padding:32px">
      <h1 style="font-size:22px;font-weight:800;color:#0f172a;margin:0 0 12px;letter-spacing:-.5px">Réinitialisation du mot de passe</h1>
      <p style="color:#475569;line-height:1.6;margin:0 0 28px">Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous — ce lien est valable <strong>1 heure</strong>.</p>
      <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;letter-spacing:-.2px">Réinitialiser mon mot de passe →</a>
      <p style="color:#94a3b8;font-size:12px;margin:28px 0 0;line-height:1.6">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.<br/>Lien alternatif : <a href="${resetUrl}" style="color:#6366f1;word-break:break-all">${resetUrl}</a></p>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="https://emploia.fr" style="color:#94a3b8">emploia.fr</a></p>
</div>
</body></html>`,
      }),
    });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: H });
}
