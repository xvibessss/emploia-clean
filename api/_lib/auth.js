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
  try {
    const res = await fetch(UPSTASH_URL, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    return await res.json();
  } catch {
    return { result: null };
  }
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

export async function kvSetNX(key, value, ttlSeconds) {
  const cmd = ["SET", key, JSON.stringify(value), "NX", "EX", ttlSeconds];
  const data = await upstash(cmd);
  return data?.result === "OK";
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

// Comparaison d'un secret fourni par le client à un secret serveur. Exportée
// pour que les gardes admin / cron / health cessent de comparer avec `!==`,
// qui s'arrête au premier caractère différent et laisse mesurer, requête après
// requête, combien de caractères du secret sont justes. Refuse tout ce qui
// n'est pas une chaîne non vide — un secret serveur absent ne doit jamais
// « égaler » un en-tête absent.
export function safeEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  if (!provided || !expected) return false;
  return timingSafeEqual(provided, expected);
}

// `Authorization: Bearer <secret>` — la forme qu'injecte Vercel Cron. Accepte
// un objet Request (Edge) comme un IncomingMessage (Node).
export function bearerMatches(req, secret) {
  const h = typeof req.headers?.get === 'function'
    ? req.headers.get('authorization')
    : req.headers?.authorization;
  return safeEqual(h || '', secret ? `Bearer ${secret}` : '');
}

// En-tête `x-admin-secret` comparé à ADMIN_SECRET, même double runtime.
export function adminSecretMatches(req) {
  const h = typeof req.headers?.get === 'function'
    ? req.headers.get('x-admin-secret')
    : req.headers?.['x-admin-secret'];
  return safeEqual(h || '', process.env.ADMIN_SECRET || '');
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
  return `__Host-emploia-token=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;
}

function getToken(req) {
  const cookies = req.headers.get?.("cookie") || req.headers?.cookie || "";
  // Seul le cookie `__Host-` est lu. L'ancien `emploia-token` (sans préfixe)
  // était encore accepté « pendant la migration », close depuis bien plus que
  // les 7 jours de vie d'un jeton : il ne servait plus qu'à laisser un
  // sous-domaine poser un cookie de session sur tout `emploia.eu` (cookie
  // tossing) — exactement ce que le préfixe `__Host-` interdit. L'ancre `(^|;\s*)`
  // empêche aussi un cookie nommé `x__Host-emploia-token` de se faire passer
  // pour le vrai.
  const match = cookies.match(/(?:^|;\s*)__Host-emploia-token=([^;]+)/);
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
  const user = await kvGet(`user:${email}`);
  if (!user) return null;
  // Reject tokens issued before a password change (session invalidation)
  if (user.passwordChangedAt && payload.iat) {
    const changedAtSec = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
    if (payload.iat < changedAtSec) return null;
  }
  // Merge the atomic counter (source of truth) into the user object.
  // Falls back to user.generationsUsed for legacy accounts with no gen: key.
  const atomicCount = await kvGet(`gen:${email}`);
  if (typeof atomicCount === 'number') user.generationsUsed = atomicCount;
  // Time-limited Pro granted internally (e.g. referral rewards) — no Stripe sub.
  // Computed at read-time so it auto-expires; only ever upgrades a free account.
  if ((!user.plan || user.plan === 'free') && user.proUntil && new Date(user.proUntil).getTime() > Date.now()) {
    user.plan = 'pro';
    user.proGranted = true; // effective Pro from a grant, not a Stripe subscription
  }
  return user;
}

export async function kvDecr(key) {
  return upstash(['DECR', key]);
}

// Single implementation of the internal Pro grant used by the referral rewards
// and by the Pack Campagne one-time payment. Extends from the later of "now"
// and the existing proUntil, so an active grant is prolonged, never overwritten
// (and an expired one restarts from today instead of the past).
// Honored at read-time by getCurrentUser above — no Stripe subscription.
export function extendPro(current, days) {
  const DAY = 86400000;
  const base = Math.max(Date.now(), current ? new Date(current).getTime() : 0);
  return new Date(base + days * DAY).toISOString();
}

export async function incrementGenerations(user) {
  // Atomically increment a dedicated counter key to avoid race conditions.
  // Two simultaneous requests both reading generationsUsed=2 and both
  // writing 3 would effectively lose one increment. The INCR key is the
  // authoritative source; getCurrentUser merges it back into the user object.
  const { result } = await kvIncr(`gen:${user.email}`);
  return typeof result === 'number' ? result : null;
}

// Exported so generate endpoints can do a fresh atomic read before
// deciding to allow or deny the generation.
export async function getGenerationsUsed(email) {
  const count = await kvGet(`gen:${email}`);
  return typeof count === 'number' ? count : null;
}

// Atomic pre-increment to prevent concurrent requests from bypassing the
// free tier limit. Increments BEFORE the API call; refunds if over limit.
// Returns { allowed: true, count } or { allowed: false, count: FREE_LIMIT }.
export async function claimFreeGeneration(user) {
  // `!user.plan || user.plan === 'free'` et non `user.plan !== 'free'` : un
  // enregistrement sans champ `plan` doit compter comme gratuit, pas comme
  // illimité. Tous les chemins d'inscription posent `plan: 'free'` aujourd'hui,
  // donc le cas ne se produit pas — mais refundGeneration ci-dessous emploie
  // déjà la forme large, et deux fonctions du même fichier qui ne s'accordent
  // pas sur la définition de « gratuit » finissent par diverger au mauvais
  // moment. Le défaut par défaut doit être de facturer, jamais d'offrir.
  if (user.plan && user.plan !== 'free') return { allowed: true, count: null };
  const { result: newCount } = await kvIncr(`gen:${user.email}`);
  if (typeof newCount !== 'number' || newCount > FREE_LIMIT) {
    await kvDecr(`gen:${user.email}`);
    return { allowed: false, count: FREE_LIMIT };
  }
  return { allowed: true, count: newCount };
}

// Give a free user's generation credit back when the AI call fails AFTER it was
// claimed/incremented — so a provider error or timeout doesn't burn one of their 5.
// No-op for paid users (they aren't metered on this counter). Call it only on an
// error path, never after a successful generation.
export async function refundGeneration(user) {
  if (user && (!user.plan || user.plan === 'free')) {
    try { await kvDecr(`gen:${user.email}`); } catch {}
  }
}

// ── INPUT VALIDATION ────────────────────────────────────────────────────────
export function validateEmail(email) {
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email) && email.length <= 254;
}

export function sanitizeString(str, maxLen = 10000) {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLen).trim();
}

export function htmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

export async function kvDel(key) {
  return upstash(["DEL", key]);
}

export async function kvMget(...keys) {
  if (!keys.length) return [];
  const { result } = await upstash(["MGET", ...keys]);
  return (result || []).map(r => {
    if (r == null) return null;
    try { return JSON.parse(r); } catch { return r; }
  });
}

export async function kvSadd(key, ...members) {
  return upstash(["SADD", key, ...members]);
}

export async function kvSrem(key, ...members) {
  return upstash(["SREM", key, ...members]);
}

export async function kvSmembers(key) {
  const { result } = await upstash(["SMEMBERS", key]);
  return result || [];
}

export async function kvZadd(key, score, member) {
  return upstash(["ZADD", key, score, member]);
}

export async function kvZcard(key) {
  const { result } = await upstash(["ZCARD", key]);
  return typeof result === 'number' ? result : 0;
}

export async function kvZremrangebyrank(key, start, stop) {
  return upstash(["ZREMRANGEBYRANK", key, start, stop]);
}

export async function kvScard(key) {
  const { result } = await upstash(["SCARD", key]);
  return typeof result === 'number' ? result : 0;
}

export async function kvLlen(key) {
  const { result } = await upstash(["LLEN", key]);
  return typeof result === 'number' ? result : 0;
}

// ── ALLOWED ORIGINS ────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://emploia.eu',
  'https://www.emploia.eu',
  'https://emploia-clean.vercel.app',
];

// Only THIS project's Vercel preview deployments, e.g.
// https://emploia-clean-<hash>-xvibessss-projects.vercel.app
// https://emploia-clean-git-<branche>-xvibessss-projects.vercel.app
//
// L'ancienne forme `emploia-clean[a-z0-9-]*\.vercel\.app` acceptait
// `emploia-clean-nimportequoi.vercel.app` : n'importe qui peut créer un projet
// Vercel de ce nom et obtenir ce domaine. Le suffixe d'équipe est ce qui
// prouve que le déploiement est le nôtre.
const PREVIEW_ORIGIN = /^https:\/\/emploia-clean-(?:git-[a-z0-9-]+|[a-z0-9]+)-xvibessss-projects\.vercel\.app$/;

export function getAllowedOrigin(req) {
  const origin = req.headers.get('origin') || '';
  // Reflect credentialed CORS only for our own origins + our own preview deploys.
  // (Previously any *.vercel.app was reflected — anyone can deploy there, so with
  // Allow-Credentials that was a needless cross-origin exposure.)
  if (ALLOWED_ORIGINS.includes(origin) || PREVIEW_ORIGIN.test(origin)) return origin;
  return ALLOWED_ORIGINS[0]; // default to production
}

// ── LIENS DE DÉSINSCRIPTION SIGNÉS ──────────────────────────────────────────
// `/api/newsletter?unsubscribe=<email>` désinscrivait n'importe quelle adresse
// sans autre preuve que de la connaître : un tiers pouvait couper tous les
// emails d'un utilisateur (`optout:` bloque alertes, relances, rapports). Le
// lien porte désormais `t`, un HMAC de l'adresse ; seul le serveur sait le
// calculer, et seul le destinataire de l'email le reçoit.
//
// Clé dérivée de JWT_SECRET avec un préfixe de domaine : pas de nouvelle
// variable d'environnement à poser, et un jeton de désinscription ne peut
// jamais servir de signature de session (les messages signés diffèrent).
//
// HMAC calculé en JS pur, de façon synchrone : les liens sont construits dans
// une quinzaine de gabarits d'email, souvent au fond de callbacks synchrones,
// et Web Crypto n'offre qu'une API asynchrone. Vérifié contre node:crypto par
// scripts/security/unsubscribe.test.mjs.
const UNSUB_BASE = process.env.NEXT_PUBLIC_URL || 'https://emploia.eu';

const SHA256_K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);

function sha256(bytes) {
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const len = bytes.length;
  const total = ((len + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(total);
  m.set(bytes); m[len] = 0x80;
  const bits = len * 8;
  m[total - 4] = (bits >>> 24) & 0xff; m[total - 3] = (bits >>> 16) & 0xff;
  m[total - 2] = (bits >>> 8) & 0xff;  m[total - 1] = bits & 0xff;
  m[total - 5] = Math.floor(bits / 0x100000000) & 0xff;
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      W[i] = (m[j] << 24) | (m[j + 1] << 16) | (m[j + 2] << 8) | m[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA256_K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) { out[i * 4] = H[i] >>> 24; out[i * 4 + 1] = (H[i] >>> 16) & 0xff; out[i * 4 + 2] = (H[i] >>> 8) & 0xff; out[i * 4 + 3] = H[i] & 0xff; }
  return out;
}

export function hmacSha256Hex(key, message) {
  const enc = new TextEncoder();
  let k = enc.encode(key);
  if (k.length > 64) k = sha256(k);
  const block = new Uint8Array(64); block.set(k);
  const ipad = new Uint8Array(64), opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) { ipad[i] = block[i] ^ 0x36; opad[i] = block[i] ^ 0x5c; }
  const msg = enc.encode(message);
  const inner = new Uint8Array(64 + msg.length); inner.set(ipad); inner.set(msg, 64);
  const ih = sha256(inner);
  const outer = new Uint8Array(96); outer.set(opad); outer.set(ih, 64);
  return Array.from(sha256(outer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function unsubscribeToken(email) {
  return hmacSha256Hex(`unsub:v1:${getJwtSecret()}`, String(email).toLowerCase().trim()).slice(0, 32);
}

export function verifyUnsubscribeToken(email, token) {
  if (typeof token !== "string" || !/^[0-9a-f]{32}$/.test(token)) return false;
  try { return timingSafeEqual(unsubscribeToken(email), token); } catch { return false; }
}

export function unsubscribeUrl(email) {
  const e = String(email).toLowerCase().trim();
  return `${UNSUB_BASE}/api/newsletter?unsubscribe=${encodeURIComponent(e)}&t=${unsubscribeToken(e)}`;
}

// ── BUDGET IA ANONYME ───────────────────────────────────────────────────────
// Le chat et l'assistant support répondent sans compte. La limite par IP ne
// borne pas la facture Anthropic face à une rotation d'IP : ce plafond global
// et quotidien la borne. Atteint, les anonymes sont invités à créer un compte
// (gratuit) — les utilisateurs connectés ne sont jamais concernés.
export const ANON_AI_DAILY_CAP = Number(process.env.ANON_AI_DAILY_CAP) || 3000;

export async function claimAnonymousAiBudget(endpoint) {
  const day = new Date().toISOString().slice(0, 10);
  const rl = await checkRateLimit(`global:${day}`, `anon-ai-${endpoint}`, ANON_AI_DAILY_CAP, 86400 + 3600);
  return rl.allowed;
}
