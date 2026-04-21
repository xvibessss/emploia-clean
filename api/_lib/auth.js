// Edge-compatible auth lib — no Node.js APIs, no jsonwebtoken
// Uses Web Crypto API (available in Edge Runtime)

export const COOKIE_NAME = "emploia-token";
export const FREE_LIMIT = 5;
const JWT_SECRET = process.env.JWT_SECRET || "emploia-dev-secret-2025";

const UPSTASH_URL = process.env.STORAGE_KV_REST_API_URL || process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.STORAGE_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN;

// ── KV (Upstash REST) ──────────────────────────────────────────
async function upstash(command) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return { result: null };
  const res = await fetch(UPSTASH_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  return res.json();
}

export async function kvGet(key) {
  const { result } = await upstash(["GET", key]);
  if (!result) return null;
  try { return JSON.parse(result); } catch { return result; }
}

export async function kvSet(key, value) {
  await upstash(["SET", key, JSON.stringify(value)]);
}

// ── JWT (Web Crypto, Edge-safe) ────────────────────────────────
async function getKey() {
  const enc = new TextEncoder().encode(JWT_SECRET);
  return crypto.subtle.importKey("raw", enc, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function b64u(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function b64uDecode(str) {
  return atob(str.replace(/-/g, "+").replace(/_/g, "/"));
}

export async function signToken(userId) {
  const header = b64u(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64u(new TextEncoder().encode(JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 })));
  const key = await getKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64u(sig)}`;
}

export async function verifyToken(token) {
  try {
    const [header, payload, sig] = token.split(".");
    const key = await getKey();
    const valid = await crypto.subtle.verify("HMAC", key, Uint8Array.from(b64uDecode(sig), c => c.charCodeAt(0)), new TextEncoder().encode(`${header}.${payload}`));
    if (!valid) return null;
    const data = JSON.parse(b64uDecode(payload));
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch { return null; }
}

export function setCookieHeader(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;
}

function getToken(req) {
  const cookies = req.headers.get?.("cookie") || req.headers?.cookie || "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

export async function getCurrentUser(req) {
  const token = getToken(req);
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  const email = await kvGet(`userid:${payload.userId}`);
  if (!email) return null;
  return kvGet(`user:${email}`);
}

export async function incrementGenerations(user) {
  await kvSet(`user:${user.email}`, { ...user, generationsUsed: user.generationsUsed + 1 });
}
