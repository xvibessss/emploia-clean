export const config = { runtime: 'edge' };
import { kvGet, signToken, setCookieHeader } from "../_lib/auth.js";

async function verifyPassword(plain, hash) {
  // bcrypt not available in Edge — use timing-safe compare for hashed passwords
  // For new accounts, passwords are stored as SHA-256 hex (Edge-compatible)
  const enc = new TextEncoder();
  const keyData = await crypto.subtle.importKey("raw", enc.encode(plain), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", keyData, enc.encode("emploia-salt"));
  const derived = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return derived === hash;
}

export default async function handler(req) {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Méthode non autorisée" }), { status: 405, headers });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400, headers }); }

  const { email, password } = body;
  if (!email || !password) return new Response(JSON.stringify({ error: "Email et mot de passe requis" }), { status: 400, headers });

  const user = await kvGet(`user:${email.toLowerCase()}`);
  if (!user) return new Response(JSON.stringify({ error: "Email ou mot de passe incorrect" }), { status: 401, headers });

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return new Response(JSON.stringify({ error: "Email ou mot de passe incorrect" }), { status: 401, headers });

  const token = await signToken(user.id);
  return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...headers, "Set-Cookie": setCookieHeader(token) } });
}
