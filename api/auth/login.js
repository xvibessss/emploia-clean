export const config = { runtime: 'edge' };
import {
  kvGet, signToken, setCookieHeader, checkRateLimit,
  verifyPassword, getAllowedOrigin, validateEmail
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

  let body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400, headers: H }); }

  const email = (body.email || '').toLowerCase().trim();
  const password = body.password || '';

  // Input validation
  if (!email || !validateEmail(email))
    return new Response(JSON.stringify({ error: "Email invalide" }), { status: 400, headers: H });
  if (!password || password.length < 8)
    return new Response(JSON.stringify({ error: "Mot de passe requis" }), { status: 400, headers: H });
  if (password.length > 128)
    return new Response(JSON.stringify({ error: "Mot de passe trop long" }), { status: 400, headers: H });

  // Rate limiting: max 5 attempts per email per 15 minutes
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rlEmail = await checkRateLimit(`email:${email}`, 'login', 5, 900);
  const rlIp = await checkRateLimit(`ip:${ip}`, 'login', 20, 900);

  if (!rlEmail.allowed || !rlIp.allowed) {
    return new Response(JSON.stringify({
      error: "Trop de tentatives. Réessayez dans 15 minutes.",
      retryAfter: 900
    }), {
      status: 429,
      headers: { ...H, "Retry-After": "900" }
    });
  }

  const user = await kvGet(`user:${email}`);

  // Constant-time response to prevent user enumeration
  if (!user) {
    // Still hash to prevent timing attacks
    await verifyPassword(password, 'dummy', null);
    return new Response(JSON.stringify({ error: "Email ou mot de passe incorrect" }), { status: 401, headers: H });
  }

  const valid = await verifyPassword(password, user.passwordHash, user.passwordSalt);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Email ou mot de passe incorrect" }), { status: 401, headers: H });
  }

  const token = await signToken(user.id);
  const safeUser = { id: user.id, name: user.name, email: user.email, plan: user.plan || 'free' };

  return new Response(JSON.stringify({ success: true, user: safeUser }), {
    status: 200,
    headers: { ...H, "Set-Cookie": setCookieHeader(token) }
  });
}
