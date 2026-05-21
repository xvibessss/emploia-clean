export const config = { runtime: 'edge' };
import {
  kvGet, kvSet, kvSadd, signToken, setCookieHeader, checkRateLimit,
  hashPassword, generateSalt, getAllowedOrigin, validateEmail, sanitizeString, htmlEscape
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

  const bodyText = await req.text();
  if (bodyText.length > 2000) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers: H });
  let body;
  try { body = JSON.parse(bodyText); }
  catch { return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400, headers: H }); }

  // Sanitize inputs
  const name = sanitizeString(body.name, 100).replace(/[\r\n]/g, ' ').trim();
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
    passwordSalt: salt,
    generationsUsed: 0,
    plan: "free",
    createdAt: new Date().toISOString(),
    ipCreated: ip,
  };

  await kvSet(`user:${email}`, user);
  await kvSet(`userid:${id}`, email);
  kvSadd('all_users', email).catch(() => {});
  // Track registration (fire and forget)
  const trackBase = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';
  fetch(`${trackBase}/api/track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'user_registered' }) }).catch(() => {});

  // Store the user's own referral code in KV immediately so friends can use it right away
  const refCharsMap = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const refSeedMap = id.slice(-8);
  let ownRefCode = '';
  for (let i = 0; i < 8; i++) ownRefCode += refCharsMap[(refSeedMap.charCodeAt(i % refSeedMap.length) + i * 7) % refCharsMap.length];
  kvSet(`ref:${ownRefCode}`, { userId: id, email, signups: [], monthsEarned: 0, createdAt: new Date().toISOString() }).catch(() => {});
  kvSet(`refcode:${id}`, ownRefCode).catch(() => {});

  // Track referral signup if a ref code was provided
  const refCode = typeof body.ref === 'string' ? body.ref.trim().toUpperCase() : null;
  if (refCode && /^[A-Z0-9]{8}$/.test(refCode)) {
    const base = process.env.NEXT_PUBLIC_URL || 'https://emploia.fr';
    fetch(`${base}/api/referral`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: refCode, newUserEmail: email }),
    }).catch(() => {});
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const firstNameRaw = name.replace(/[\r\n]/g, ' ').split(' ')[0];
    const firstName = htmlEscape(firstNameRaw);
    const refChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const refSeed = id.slice(-8);
    let welcomeRefCode = '';
    for (let i = 0; i < 8; i++) {
      welcomeRefCode += refChars[(refSeed.charCodeAt(i % refSeed.length) + i * 7) % refChars.length];
    }
    const refLink = `https://emploia.fr/?ref=${welcomeRefCode}`;
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Emploia <noreply@emploia.fr>',
        to: [email],
        subject: `🎉 Bienvenue ${firstNameRaw} — ton CV ATS est à 30 secondes`,
        html: `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,system-ui,sans-serif">
<div style="max-width:520px;margin:40px auto;padding:0 20px">
  <div style="background:#fff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:28px 32px">
      <div style="background:rgba(255,255,255,.2);display:inline-block;border-radius:10px;padding:6px 14px;font-size:18px;font-weight:900;color:#fff;letter-spacing:-0.5px">Emploia</div>
    </div>
    <div style="padding:32px">
      <h1 style="font-size:22px;font-weight:800;color:#0f172a;margin:0 0 12px;letter-spacing:-.5px">Bienvenue, ${firstName} ! 🎉</h1>
      <p style="color:#475569;line-height:1.6;margin:0 0 20px">Votre compte Emploia est créé. Vous avez <strong style="color:#0f172a">5 générations gratuites</strong> prêtes à l'emploi — votre copilote de candidature IA 100% français.</p>
      <a href="https://emploia.fr/app" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:15px;padding:14px 28px;border-radius:11px;text-decoration:none;letter-spacing:-.2px">✨ Créer mon CV maintenant →</a>
      <div style="margin-top:20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px 16px">
        <p style="color:#166534;font-size:12px;line-height:1.6;margin:0"><strong>💡 Pourquoi ça marche ?</strong> 75% des CV sont filtrés automatiquement avant d'être lus par un humain. Emploia optimise ton CV pour passer ces filtres ATS — mots-clés, format, structure — en 30 secondes.</p>
      </div>
      <div style="margin-top:24px;padding-top:20px;border-top:1px solid #e2e8f0">
        <p style="color:#64748b;font-size:13px;margin:0 0 14px;font-weight:700">3 premières actions à faire :</p>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;align-items:flex-start;gap:12px">
            <div style="min-width:28px;height:28px;border-radius:8px;background:#ede9fe;display:flex;align-items:center;justify-content:center;font-size:14px">1️⃣</div>
            <div><strong style="color:#0f172a;font-size:13px">Complétez votre profil</strong><br/><span style="color:#64748b;font-size:12px">Ajoutez vos expériences une fois — Emploia les réutilise pour chaque candidature.</span><br/><a href="https://emploia.fr/profil" style="font-size:12px;color:#6366f1;text-decoration:none;font-weight:600">→ Compléter mon profil</a></div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:12px">
            <div style="min-width:28px;height:28px;border-radius:8px;background:#dbeafe;display:flex;align-items:center;justify-content:center;font-size:14px">2️⃣</div>
            <div><strong style="color:#0f172a;font-size:13px">Trouvez une offre & générez votre CV</strong><br/><span style="color:#64748b;font-size:12px">Collez une offre d'emploi → CV ATS-optimisé en 30 secondes.</span><br/><a href="https://emploia.fr/app" style="font-size:12px;color:#6366f1;text-decoration:none;font-weight:600">→ Générer mon CV</a></div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:12px">
            <div style="min-width:28px;height:28px;border-radius:8px;background:#d1fae5;display:flex;align-items:center;justify-content:center;font-size:14px">3️⃣</div>
            <div><strong style="color:#0f172a;font-size:13px">Préparez votre entretien</strong><br/><span style="color:#64748b;font-size:12px">Entraînez-vous avec notre simulateur IA avant le grand jour.</span><br/><a href="https://emploia.fr/interview" style="font-size:12px;color:#6366f1;text-decoration:none;font-weight:600">→ Démarrer le simulateur</a></div>
          </div>
        </div>
      </div>
      <div style="margin-top:28px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:18px 20px">
        <p style="color:#0f172a;font-size:13px;font-weight:700;margin:0 0 8px">🎁 Votre code de parrainage</p>
        <p style="color:#475569;font-size:12px;margin:0 0 12px;line-height:1.5">Partagez Emploia et gagnez <strong>1 mois Pro offert</strong> par ami inscrit (max 3 mois).</p>
        <div style="background:#fff;border:1.5px dashed #6366f1;border-radius:10px;padding:10px 16px;text-align:center;font-size:18px;font-weight:900;color:#6366f1;letter-spacing:3px">${welcomeRefCode}</div>
        <a href="${refLink}" style="display:block;margin-top:10px;text-align:center;font-size:12px;color:#6366f1;text-decoration:none">Ou partagez ce lien →</a>
      </div>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">© ${new Date().getFullYear()} Emploia · <a href="https://emploia.fr" style="color:#94a3b8">emploia.fr</a> · <a href="https://emploia.fr/api/newsletter?unsubscribe=${encodeURIComponent(email)}" style="color:#94a3b8">Se désabonner</a></p>
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
