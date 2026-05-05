export const config = { runtime: 'edge' };
import { getCurrentUser, getAllowedOrigin, checkRateLimit } from "../_lib/auth.js";

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

  return new Response(JSON.stringify({ user: safeUser }), { status: 200, headers: H });
}
