export const config = { runtime: 'edge' };
import { kvGet, kvSet, signToken, setCookieHeader } from "../_lib/auth.js";

async function hashPassword(plain) {
  const enc = new TextEncoder();
  const keyData = await crypto.subtle.importKey("raw", enc.encode(plain), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", keyData, enc.encode("emploia-salt"));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default async function handler(req) {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Méthode non autorisée" }), { status: 405, headers });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Corps invalide" }), { status: 400, headers }); }

  const { name, email, password } = body;
  if (!name || !email || !password) return new Response(JSON.stringify({ error: "Nom, email et mot de passe requis" }), { status: 400, headers });
  if (password.length < 8) return new Response(JSON.stringify({ error: "Mot de passe trop court (8 caractères min)" }), { status: 400, headers });

  const existing = await kvGet(`user:${email.toLowerCase()}`);
  if (existing) return new Response(JSON.stringify({ error: "Un compte avec cet email existe déjà" }), { status: 409, headers });

  const passwordHash = await hashPassword(password);
  const id = `u_${Date.now()}`;
  const user = { id, name, email: email.toLowerCase(), passwordHash, generationsUsed: 0, plan: "free", createdAt: new Date().toISOString() };

  await kvSet(`user:${email.toLowerCase()}`, user);
  await kvSet(`userid:${id}`, email.toLowerCase());

  const token = await signToken(id);
  return new Response(JSON.stringify({ success: true, user: { id, name, email: user.email, plan: "free" } }), { status: 201, headers: { ...headers, "Set-Cookie": setCookieHeader(token) } });
}
