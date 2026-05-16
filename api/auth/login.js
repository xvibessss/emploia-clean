export const config = { runtime: 'edge' };
import {
  kvGet, signToken, setCookieHeader, checkRateLimit,
  verifyPassword, getAllowedOrigin, validateEmail, sanitizeString, COOKIE_NAME
} from "../_lib/auth.js";

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

  // Rate limit: 10 attempts per IP per 15 minutes (brute force protection)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await checkRateLimit(`ip:${ip}`, 'login', 10, 900);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "Trop de tentatives. Réessayez dans 15 minutes." }), {
      status: 429, headers: { ...H, "Retry-After": "900" }
    });
  }

  const bodyText = await req.text();
  if (bodyText.length > 2000) return new Response(JSON.stringify({ error: 'Requête trop longue' }), { status: 413, headers: H });
  let body;
  try { body = JSON.parse(bodyText); }
  catch { return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400, headers: H }); }

  const email = sanitizeString((body.email || ''), 254).toLowerCase();
  const password = body.password || '';

  if (!email || !validateEmail(email))
    return new Response(JSON.stringify({ error: "Email invalide" }), { status: 400, headers: H });
  if (!password)
    return new Response(JSON.stringify({ error: "Mot de passe requis" }), { status: 400, headers: H });

  const user = await kvGet(`user:${email}`);
  // Use same error message for missing user and wrong password to prevent user enumeration
  if (!user) {
    return new Response(JSON.stringify({ error: "Email ou mot de passe incorrect" }), { status: 401, headers: H });
  }

  // Google-only accounts have no local password — check before the passwordHash guard
  if (user.provider === 'google' && !user.passwordHash) {
    return new Response(JSON.stringify({ error: "Ce compte utilise la connexion Google. Utilisez 'Continuer avec Google'." }), { status: 401, headers: H });
  }

  if (!user.passwordHash) {
    return new Response(JSON.stringify({ error: "Email ou mot de passe incorrect" }), { status: 401, headers: H });
  }

  const valid = await verifyPassword(password, user.passwordHash, user.passwordSalt);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Email ou mot de passe incorrect" }), { status: 401, headers: H });
  }

  const token = await signToken(user.id);
  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    plan: user.plan || 'free',
    generationsUsed: user.generationsUsed || 0,
  };

  return new Response(JSON.stringify({ success: true, user: safeUser }), {
    status: 200,
    headers: { ...H, "Set-Cookie": setCookieHeader(token) }
  });
}
