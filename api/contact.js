export const config = { runtime: 'edge' };
import { checkRateLimit, getAllowedOrigin, validateEmail, sanitizeString, htmlEscape } from './_lib/auth.js';

const SUBJECTS = { support: 'Support technique', billing: 'Facturation', feature: 'Suggestion', partnership: 'Partenariat', rgpd: 'RGPD', other: 'Autre' };

function sendEmail(apiKey, payload) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin' };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: H });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'contact', 3, 3600);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Trop de messages envoyés. Réessayez dans 1 heure.' }), { status: 429, headers: { ...H, 'Retry-After': '3600' } });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400, headers: H }); }

  const name = sanitizeString(body.name, 100);
  const email = (body.email || '').toLowerCase().trim().slice(0, 254);
  const subject = Object.prototype.hasOwnProperty.call(SUBJECTS, body.subject) ? body.subject : 'other';
  const message = sanitizeString(body.message, 2000);

  if (!name || name.length < 2) return new Response(JSON.stringify({ error: 'Nom invalide' }), { status: 400, headers: H });
  if (!validateEmail(email)) return new Response(JSON.stringify({ error: 'Email invalide' }), { status: 400, headers: H });
  if (!message || message.length < 10) return new Response(JSON.stringify({ error: 'Message trop court' }), { status: 400, headers: H });

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const subjectLabel = SUBJECTS[subject];
    const safeName = htmlEscape(name);
    const safeEmail = htmlEscape(email);
    const safeMessage = htmlEscape(message);
    const safeSubject = htmlEscape(subjectLabel);
    const firstName = htmlEscape(name.split(' ')[0]);

    // Fire-and-forget — don't block response on email delivery
    sendEmail(resendKey, {
      from: 'Emploia Contact <noreply@emploia.fr>',
      to: ['contact@emploia.fr'],
      reply_to: email,
      subject: `[${subjectLabel}] Message de ${name}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#1e293b">Nouveau message — Emploia</h2><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px;color:#64748b;font-weight:600;width:120px">De</td><td style="padding:8px">${safeName} &lt;${safeEmail}&gt;</td></tr><tr style="background:#f8fafc"><td style="padding:8px;color:#64748b;font-weight:600">Sujet</td><td style="padding:8px">${safeSubject}</td></tr><tr><td style="padding:8px;color:#64748b;font-weight:600">Message</td><td style="padding:8px;white-space:pre-line">${safeMessage}</td></tr></table><p style="color:#94a3b8;font-size:12px;margin-top:20px">Répondre directement à cet email pour contacter ${safeName}.</p></div>`,
    });

    sendEmail(resendKey, {
      from: 'Emploia <noreply@emploia.fr>',
      to: [email],
      subject: 'Votre message a bien été reçu — Emploia',
      html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif"><div style="max-width:520px;margin:40px auto;padding:0 20px"><div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden"><div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px"><div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff">Emploia</div></div><div style="padding:32px"><h1 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 12px">Message bien reçu, ${firstName} !</h1><p style="color:#475569;line-height:1.6;margin:0 0 16px">Merci de nous avoir contactés. L'équipe Emploia vous répondra sous <strong>24h ouvrées</strong>.</p><div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:20px"><p style="font-size:12px;color:#64748b;font-weight:600;margin:0 0 8px">Votre message :</p><p style="font-size:13px;color:#1e293b;white-space:pre-line;margin:0">${htmlEscape(message.slice(0, 300))}${message.length > 300 ? '...' : ''}</p></div><a href="https://emploia.fr" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:14px;padding:12px 24px;border-radius:11px;text-decoration:none">Retour sur Emploia →</a></div></div><p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="https://emploia.fr" style="color:#94a3b8">emploia.fr</a></p></div></body></html>`,
    });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: H });
}
