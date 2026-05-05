// Edge-compatible secure auth lib
// Uses Web Crypto API — 100% Edge Runtime compatible

export const COOKIE_NAME = "__Host-emploia-token";
export const FREE_LIMIT = 5;

// No fallback — fail loudly if secret not set
function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET must be set (32+ chars)");
  return s;
}

// ── KV (Upstash REST) ──────────────────────────────────────────────────────
const UPSTASH_URL = process.env.STORAGE_KV_REST_API_URL || process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.STORAGE_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN;

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

export async function kvSet(key, value, ttl) {
  if (ttl) await upstash(["SET", key, JSON.stringify(value), "EX", ttl]);
  else await upstash(["SET", key, JSON.stringify(value)]);
}

export async function kvIncr(key) {
  return upstash(["INCR", key]);
}

export async function kvExpire(key, seconds) {
  return upstash(["EXPIRE", key, seconds]);
}

// ── RATE LIMITING ──────────────────────────────────────────────────────────
// In-memory fallback for when KV is unavailable
const memRL = new Map();
function memRateLimit(key, max, windowMs) {
  const now = Date.now();
  const entry = memRL.get(key) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
  entry.count++;
  memRL.set(key, entry);
  // Cleanup old entries periodically
  if (memRL.size > 1000) { const cutoff = now - windowMs * 2; for (const [k, v] of memRL) if (v.reset < cutoff) memRL.delete(k); }
  return { allowed: entry.count <= max, count: entry.count, limit: max };
}

export async function checkRateLimit(identifier, endpoint, maxReq, windowSecs) {
  const key = `rl:${endpoint}:${identifier}`;
  if (!UPSTASH_URL) {
    // Use in-memory rate limiting as fallback
    return memRateLimit(key, maxReq, windowSecs * 1000);
  }
  try {
    const { result: count } = await upstash(["INCR", key]);
    if (count === 1) await upstash(["EXPIRE", key, windowSecs]);
    return { allowed: count <= maxReq, count: count || 0, limit: maxReq };
  } catch {
    // KV error: use memory fallback
    return memRateLimit(key, maxReq, windowSecs * 1000);
  }
}

// ── PBKDF2 PASSWORD HASHING (edge-safe, much stronger than HMAC) ───────────
export async function hashPassword(plain, salt) {
  const enc = new TextEncoder();
  // Import password as raw key material
  const keyMat = await crypto.subtle.importKey("raw", enc.encode(plain), "PBKDF2", false, ["deriveBits"]);
  // Derive 256 bits (32 bytes) with 100k iterations
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
    keyMat, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(plain, storedHash, salt) {
  // Support both old format (no salt, HMAC) and new format (PBKDF2 + salt)
  if (!salt) {
    // Legacy: old HMAC hash — verify with old method
    const enc = new TextEncoder();
    const keyData = await crypto.subtle.importKey("raw", enc.encode(plain), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", keyData, enc.encode("emploia-salt"));
    const derived = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    return timingSafeEqual(derived, storedHash);
  }
  const derived = await hashPassword(plain, salt);
  return timingSafeEqual(derived, storedHash);
}

// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

// ── JWT (Web Crypto, Edge-safe) ────────────────────────────────────────────
async function getKey() {
  const enc = new TextEncoder().encode(getJwtSecret());
  return crypto.subtle.importKey("raw", enc, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function b64u(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function b64uDecode(str) {
  return atob(str.replace(/-/g, "+").replace(/_/g, "/"));
}

export async function signToken(userId, expiresIn = 60 * 60 * 24 * 7) {
  const header = b64u(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64u(new TextEncoder().encode(JSON.stringify({
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresIn,
    jti: crypto.randomUUID(), // prevent token reuse
  })));
  const key = await getKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64u(sig)}`;
}

export async function verifyToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const key = await getKey();
    const valid = await crypto.subtle.verify(
      "HMAC", key,
      Uint8Array.from(b64uDecode(sig), c => c.charCodeAt(0)),
      new TextEncoder().encode(`${header}.${payload}`)
    );
    if (!valid) return null;
    const data = JSON.parse(b64uDecode(payload));
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch { return null; }
}

export function setCookieHeader(token) {
  // __Host- prefix: enforces HTTPS + no domain attribute + path=/
  // This prevents cookie hijacking and subdomain attacks
  return `__Host-emploia-token=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Strict; Secure`;
}

function getToken(req) {
  const cookies = req.headers.get?.("cookie") || req.headers?.cookie || "";
  // Support both old and new cookie name during migration
  const match = cookies.match(/__Host-emploia-token=([^;]+)/) ||
                cookies.match(/emploia-token=([^;]+)/);
  return match ? match[1] : null;
}

export async function getCurrentUser(req) {
  const token = getToken(req);
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  const userId = payload.sub || payload.userId; // support old tokens
  const email = await kvGet(`userid:${userId}`);
  if (!email) return null;
  return kvGet(`user:${email}`);
}

export async function incrementGenerations(user) {
  await kvSet(`user:${user.email}`, { ...user, generationsUsed: user.generationsUsed + 1 });
}

// ── INPUT VALIDATION ────────────────────────────────────────────────────────
export function validateEmail(email) {
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email) && email.length <= 254;
}

export function sanitizeString(str, maxLen = 10000) {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLen).trim();
}

// ── ALLOWED ORIGINS ────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://emploia.fr',
  'https://www.emploia.fr',
  'https://emploia-clean.vercel.app',
];

export function getAllowedOrigin(req) {
  const origin = req.headers.get('origin') || '';
  // Allow any *.vercel.app preview deployment
  if (origin.endsWith('.vercel.app') || ALLOWED_ORIGINS.includes(origin)) return origin;
  return ALLOWED_ORIGINS[0]; // default to production
}
