export const config = { runtime: 'edge' };
import {
  kvGet, kvSet, signToken, setCookieHeader, checkRateLimit,
  hashPassword, generateSalt, getAllowedOrigin, validateEmail, sanitizeString
} from "../_lib/auth.js";

const FORBIDDEN_DISPOSABLE = ['mailinator', 'guerrillamail', 'tempmail', 'throwam', 'yopmail', '10minutemail'];

export default async function handler(req) {
  const origin = getAllowedOrigin(req);
  const H = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };

  if (req.method === "OPTIONS") return new Response(null, {
    status: 204,
    headers: { ...H, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }
  });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Méthode non autorisée" }), { status: 405, headers: H });

  // Rate limit registrations: 3 per IP per hour
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'register', 3, 3600);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "Trop d'inscriptions depuis cette IP. Réessayez dans 1 heure." }), {
      status: 429, headers: { ...H, "Retry-After": "3600" }
    });
  }

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400, headers: H }); }

  // Sanitize inputs
  const name = sanitizeString(body.name, 100);
  const email = (body.email || '').toLowerCase().trim().slice(0, 254);
  const password = body.password || '';

  // Validate
  if (!name || name.length < 2)
    return new Response(JSON.stringify({ error: "Nom invalide (2 caractères minimum)" }), { status: 400, headers: H });
  if (!email || !validateEmail(email))
    return new Response(JSON.stringify({ error: "Email invalide" }), { status: 400, headers: H });

  // Block disposable email domains
  const emailDomain = email.split('@')[1] || '';
  if (FORBIDDEN_DISPOSABLE.some(d => emailDomain.includes(d)))
    return new Response(JSON.stringify({ error: "Email temporaire non accepté" }), { status: 400, headers: H });

  if (!password || password.length < 8)
    return new Response(JSON.stringify({ error: "Mot de passe trop court (8 caractères minimum)" }), { status: 400, headers: H });
  if (password.length > 128)
    return new Response(JSON.stringify({ error: "Mot de passe trop long" }), { status: 400, headers: H });

  // Check password strength
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  if (!hasUpper || !hasDigit)
    return new Response(JSON.stringify({ error: "Le mot de passe doit contenir une majuscule et un chiffre" }), { status: 400, headers: H });

  // Check duplicate
  const existing = await kvGet(`user:${email}`);
  if (existing) return new Response(JSON.stringify({ error: "Un compte avec cet email existe déjà" }), { status: 409, headers: H });

  // Hash password with unique salt (PBKDF2 — much stronger than HMAC)
  const salt = await generateSalt();
  const passwordHash = await hashPassword(password, salt);

  const id = `u_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const user = {
    id,
    name,
    email,
    passwordHash,
    passwordSalt: salt, // unique per user
    generationsUsed: 0,
    plan: "free",
    createdAt: new Date().toISOString(),
    ipCreated: ip,
  };

  await kvSet(`user:${email}`, user);
  await kvSet(`userid:${id}`, email);

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const firstName = name.split(' ')[0];
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Emploia <noreply@emploia.fr>',
        to: [email],
        subject: `Bienvenue sur Emploia, ${firstName} ! 🎉`,
        html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
<div style="max-width:520px;margin:40px auto;padding:0 20px">
  <div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px">
      <div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">Emploia</div>
    </div>
    <div style="padding:32px">
      <h1 style="font-size:22px;font-weight:800;color:#0f172a;margin:0 0 12px;letter-spacing:-.5px">Bienvenue, ${firstName} ! 🎉</h1>
      <p style="color:#475569;line-height:1.6;margin:0 0 20px">Votre compte Emploia est créé. Vous avez accès à votre copilote de candidature IA — le premier 100% français.</p>
      <p style="color:#475569;line-height:1.6;margin:0 0 28px">Avec Emploia, générez des CV et lettres de motivation optimisés ATS, analysez votre score de compatibilité sur chaque offre, et entraînez-vous aux entretiens avec l'IA.</p>
      <a href="https://emploia.fr/app" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;letter-spacing:-.2px">Commencer ma recherche →</a>
      <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e2e8f0">
        <p style="color:#64748b;font-size:13px;margin:0 0 12px;font-weight:600">Ce que vous pouvez faire :</p>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;align-items:center;gap:12px"><span style="font-size:20px">✨</span><span style="color:#475569;font-size:13px"><strong>Générer</strong> — CV et lettre de motivation IA en 30 secondes</span></div>
          <div style="display:flex;align-items:center;gap:12px"><span style="font-size:20px">📊</span><span style="color:#475569;font-size:13px"><strong>Dashboard</strong> — Suivre toutes vos candidatures en kanban</span></div>
          <div style="display:flex;align-items:center;gap:12px"><span style="font-size:20px">🎤</span><span style="color:#475569;font-size:13px"><strong>Entretien</strong> — Préparez-vous avec le coaching IA</span></div>
        </div>
      </div>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="https://emploia.fr" style="color:#94a3b8">emploia.fr</a></p>
</div>
</body></html>`,
      }),
    }).catch(() => {});
  }

  const token = await signToken(id);
  const safeUser = { id, name, email, plan: "free" };

  return new Response(JSON.stringify({ success: true, user: safeUser }), {
    status: 201,
    headers: { ...H, "Set-Cookie": setCookieHeader(token) }
  });
}
