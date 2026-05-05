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

  const token = await signToken(id);
  const safeUser = { id, name, email, plan: "free" };

  return new Response(JSON.stringify({ success: true, user: safeUser }), {
    status: 201,
    headers: { ...H, "Set-Cookie": setCookieHeader(token) }
  });
}
